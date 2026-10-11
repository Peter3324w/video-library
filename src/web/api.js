import seed from './demo-seed.json'
import { kvGet, kvSet } from './kv'
import { askToRead, canRead, fileOf, hasFolderInput, hasPicker, listFiles, listHandle, pickFolder } from './folders'
import { createMatcher } from './matching'
import { createCloud } from './cloud'

/* The web build's `window.api`: the same bridge src/preload/index.js exposes,
   answered in the browser instead of by Electron's main process. The renderer
   is shared and can't tell which one it is talking to.

   Where the desktop app keeps data.json in userData, this keeps the same three
   lists (titles, files, history) in IndexedDB. The library starts empty, as
   the desktop app does; folders the visitor adds are read in place
   (folders.js) and matched to titles by the desktop's rules. */

/* Version 1 opened on the sample films. From 2 the library starts empty, so a
   store saved by version 1 has its samples taken out once (see `ready`). */
const STORE_VERSION = 2
const DEMO = 'Sample films'
const isDemo = (f) => !!f.path && (f.path.startsWith(`${DEMO}/`) || f.path.startsWith('Demo library/'))

/* ---------------- Sample films ----------------
   Not part of a new library. A visitor with nothing of their own to add can
   load them (Settings, or the empty Home page on a browser that can't open a
   folder): free films from archive.org, with some watch history to look at. */
// Written relative to the day the seed was generated; moved to today, so
// "Yesterday" still reads yesterday however old the build is.
const TIME_KEYS = ['addedAt', 'lastWatched', 'missingAt', 'start', 'end']
function demoLists() {
  const shift = Date.now() - seed.generatedAt
  const moved = (list) =>
    list.map((x) => {
      const y = { ...x }
      for (const k of TIME_KEYS) if (typeof y[k] === 'number') y[k] += shift
      return y
    })
  return { titles: moved(seed.titles), files: moved(seed.files), history: moved(seed.history) }
}
const emptyStore = () => ({
  version: 1,
  seedVersion: STORE_VERSION,
  settings: { theme: 'midnight', accent: null, accentRecents: [], folders: [] },
  titles: [],
  files: [],
  history: []
})

// The desktop tracker's rules (src/main/tracker.js), kept the same here.
const MIN_WATCH_SECONDS = 10 // shorter than this is a peek, not a watch
const SAVE_EVERY_MS = 15000 // position survives a closed tab to within 15s
const DONE_FRACTION = 0.85 // past this, the credits are rolling
const isDone = (posMs, durMs) => durMs > 0 && posMs >= durMs * DONE_FRACTION

export function createWebApi() {
  let store = emptyStore()
  const libraryListeners = new Set()

  // The sample films and everything recorded against them.
  function removeDemo() {
    const gone = new Set(store.files.filter(isDemo).map((f) => f.id))
    store.files = store.files.filter((f) => !gone.has(f.id))
    store.history = store.history.filter((h) => !gone.has(h.fileId))
    const used = new Set([...store.files.map((f) => f.titleId), ...store.history.map((h) => h.titleId)])
    store.titles = store.titles.filter((t) => used.has(t.id))
  }

  /* Private windows and blocked site data make IndexedDB throw. The library
     then lives for the visit only. */
  const ready = (async () => {
    try {
      const saved = await kvGet('store')
      if (saved && Array.isArray(saved.titles) && Array.isArray(saved.files) && Array.isArray(saved.history)) {
        store = saved
        if (store.seedVersion !== STORE_VERSION) {
          removeDemo()
          store.seedVersion = STORE_VERSION
        }
      }
      await kvSet('store', store)
    } catch (e) {
      console.warn('[store] not persisted this visit', e)
    }
    if (!Array.isArray(store.settings.folders)) store.settings.folders = []
  })()
  const save = () => kvSet('store', store).catch(() => {})

  // Fresh arrays each time, as IPC gives the desktop renderer: React compares by identity.
  const libraryPayload = () => ({ titles: [...store.titles], files: [...store.files], history: [...store.history] })
  let cloud = null
  const changed = (how) => {
    save()
    const payload = libraryPayload()
    libraryListeners.forEach((cb) => cb(payload))
    // Signed in, a change here is owed to the account. Not the sync's own.
    if (cloud && !(how && how.fromSync)) cloud.schedule()
  }
  const publicSettings = () => ({
    theme: store.settings.theme || 'midnight',
    accent: store.settings.accent || null,
    accentRecents: Array.isArray(store.settings.accentRecents) ? store.settings.accentRecents : []
  })
  const SETTING_KEYS = new Set(['theme', 'accent', 'accentRecents'])
  const TITLE_KEYS = new Set(['favorite'])

  /* ---------------- Folders ----------------
     A folder is { id, name } in settings. What makes it readable is kept
     apart, because neither kind is plain data:
     - `handles`  a directory handle per folder (Chrome, Edge), saved in
                  IndexedDB and usable on the next visit once allowed again;
     - `picked`   the file list from a folder <input> (Firefox, Safari), which
                  lasts until the tab closes.
     `sources` is what a scan found this visit: file id → something playable.
     A file's path is "<folder name>/<path inside it>". */
  let handles = {}
  const picked = new Map()
  const sources = new Map()
  const readable = new Map() // folder id → could it be read on the last scan
  const folders = () => store.settings.folders
  const folderNames = () => [...(store.files.some(isDemo) ? [DEMO] : []), ...folders().map((f) => f.name)]
  const inFolder = (folder) => (f) => !!f.path && f.path.startsWith(`${folder.name}/`)

  // Titles nothing points at any more. One you favourited is kept.
  function pruneTitles() {
    const used = new Set([...store.files.map((f) => f.titleId), ...store.history.map((h) => h.titleId)])
    store.titles = store.titles.filter((t) => used.has(t.id) || t.auto === false || t.favorite)
  }
  /* A file that is no longer there: one you never watched is forgotten, one
     you did stays for History, like an uninstalled game keeping its hours. */
  function dropMissing(isMissing, result) {
    const watched = new Set(store.history.map((h) => h.fileId))
    store.files = store.files.filter((f) => {
      if (!isMissing(f)) return true
      if (!watched.has(f.id) && !f.lastWatched) return false
      if (f.present !== false && result) result.gone++
      if (!f.missingAt) f.missingAt = Date.now()
      f.present = false
      sources.delete(f.id)
      return true
    })
  }

  let scanning = null
  /* Returns { found, added, gone, back }, the desktop scanner's answer.
     `ask` may prompt for folders the browser wants re-approved, so it is only
     set when a click started the scan. Concurrent calls share one run. */
  function scan({ ask = false } = {}) {
    if (scanning) return scanning
    scanning = (async () => {
      const result = { found: 0, added: 0, gone: 0, back: 0 }
      // Prompts first, while the click is still fresh; walking can take a while.
      const allowed = new Map()
      for (const folder of folders()) {
        const handle = handles[folder.id]
        if (handle) allowed.set(folder.id, (await canRead(handle)) || (ask && (await askToRead(handle))))
      }
      for (const folder of folders()) {
        const handle = handles[folder.id]
        const listing = handle
          ? allowed.get(folder.id)
            ? await listHandle(handle)
            : null
          : picked.has(folder.id)
            ? listFiles(picked.get(folder.id))
            : null
        readable.set(folder.id, !!listing)
        const mine = inFolder(folder)
        if (!listing) {
          // Can't be read this visit. Not deleted: it comes back on reconnect.
          for (const f of store.files) if (mine(f)) f.present = false
          continue
        }
        const seen = new Set()
        for (const item of listing) {
          const path = `${folder.name}/${item.rel}`
          const key = item.name.toLowerCase()
          /* By path; failing that, a missing file of the same name is this one
             moved, so its history and resume position carry over. */
          let f =
            store.files.find((x) => x.path === path) ||
            store.files.find(
              (x) => x.present === false && !x.src && !seen.has(x.id) && String(x.fileName).toLowerCase() === key
            )
          if (!f) {
            f = {
              id: crypto.randomUUID(),
              path,
              fileName: item.name,
              titleId: null,
              positionMs: 0,
              durationMs: 0,
              completed: false,
              lastWatched: null
            }
            store.files.push(f)
            result.added++
          } else if (f.present === false) result.back++
          f.path = path
          f.present = true
          delete f.missingAt
          if (!f.addedAt) f.addedAt = Date.now()
          sources.set(f.id, item.source)
          seen.add(f.id)
          result.found++
        }
        dropMissing((f) => mine(f) && !seen.has(f.id), result)
      }
      pruneTitles()
      return result
    })().finally(() => {
      scanning = null
    })
    return scanning
  }

  async function getFile(fileId) {
    const source = sources.get(fileId)
    return source ? fileOf(source) : null
  }
  const matcher = createMatcher({ getStore: () => store, getFile, onMatched: changed })

  // Folders kept from earlier visits: read the ones the browser still allows.
  const booted = ready.then(async () => {
    try {
      handles = (await kvGet('handles')) || {}
    } catch {
      handles = {}
    }
    if (!folders().length) return
    await scan()
    changed()
    matcher.matchPending()
  })

  async function afterScan(result) {
    changed()
    matcher.matchPending()
    return result
  }

  /* Take a folder the visitor just picked. Picking one already in the library
     reconnects it instead of adding it twice. */
  async function adopt(pick) {
    let folder = null
    if (pick.handle) {
      for (const f of folders()) {
        const h = handles[f.id]
        if (h && (await h.isSameEntry(pick.handle).catch(() => false))) folder = f
      }
    } else folder = folders().find((f) => !handles[f.id] && f.name === pick.name) || null
    if (!folder) {
      const taken = new Set([DEMO, ...folders().map((f) => f.name)])
      let name = pick.name
      for (let n = 2; taken.has(name); n++) name = `${pick.name} (${n})`
      folder = { id: crypto.randomUUID(), name }
      folders().push(folder)
    }
    if (pick.handle) {
      handles[folder.id] = pick.handle
      // Safari and Firefox can't store a handle; the folder then lasts the visit.
      await kvSet('handles', handles).catch(() => {})
    } else picked.set(folder.id, pick.files)
  }

  /* ---------------- Account ----------------
     What an account carries is the visitor's own records. The sample films are
     the site's, loaded to look around with, so they stay out of it. */
  function syncView() {
    const files = store.files.filter((f) => !isDemo(f))
    const mine = new Set(files.map((f) => f.id))
    const history = store.history.filter((h) => mine.has(h.fileId))
    const used = new Set([...files.map((f) => f.titleId), ...history.map((h) => h.titleId)])
    const titles = store.titles.filter((t) => used.has(t.id) || !String(t.id).startsWith('demo-'))
    return { settings: store.settings, titles, files, history }
  }
  /* A different person signed in on this browser. What the last one watched is
     not theirs: files on this computer stay, as unwatched, and the rest goes. */
  function resetRecords() {
    const sample = new Set(store.files.filter(isDemo).map((f) => f.id))
    store.history = store.history.filter((h) => sample.has(h.fileId))
    store.files = store.files.filter((f) => sample.has(f.id) || f.present !== false)
    for (const f of store.files) {
      if (sample.has(f.id)) continue
      f.positionMs = 0
      f.completed = false
      f.lastWatched = null
    }
    for (const t of store.titles) if (!String(t.id).startsWith('demo-')) delete t.favorite
    pruneTitles()
  }
  cloud = createCloud({ getStore: () => store, syncView, resetRecords, changed })

  /* ---------------- Watching ----------------
     The desktop app polls PotPlayer; here the page's own <video> reports in
     (watchTick), and the records come out the same: a resume position while
     it plays, a history entry when it stops. Only time spent playing counts. */
  let current = null
  let lastSave = 0
  let blobUrl = null
  function writePosition(w) {
    const f = store.files.find((x) => x.id === w.fileId)
    if (!f) return null
    f.positionMs = w.lastPos
    if (w.duration) f.durationMs = w.duration
    f.lastWatched = Date.now()
    if (isDone(w.lastPos, w.duration)) f.completed = true // only ever turns on
    return f
  }
  function finish() {
    const w = current
    current = null
    if (!w) return
    const f = writePosition(w)
    if (f && w.watchedSec >= MIN_WATCH_SECONDS)
      store.history.push({
        id: crypto.randomUUID(),
        fileId: f.id,
        titleId: f.titleId,
        fileName: f.fileName,
        start: w.startedAt,
        end: Date.now(),
        seconds: Math.round(w.watchedSec),
        fromMs: w.startPos,
        toMs: w.lastPos,
        durationMs: w.duration,
        completed: isDone(w.lastPos, w.duration)
      })
    changed()
  }

  return {
    getLibrary: async () => {
      await ready
      return libraryPayload()
    },
    onLibrary: (cb) => {
      libraryListeners.add(cb)
      return () => libraryListeners.delete(cb)
    },

    // Folders. The first three answer what the desktop bridge answers.
    canAddFolder: hasPicker || hasFolderInput,
    // Chrome and Edge keep a folder between visits; elsewhere it is picked again.
    keepsFolders: hasPicker,
    getFolders: async () => {
      await ready
      return folderNames()
    },
    addFolder: async () => {
      const pick = await pickFolder()
      await booted
      if (!pick) return { folders: folderNames(), scan: null }
      await adopt(pick)
      const result = await afterScan(await scan())
      return { folders: folderNames(), scan: result }
    },
    removeFolder: async (name) => {
      await booted
      if (name === DEMO) removeDemo()
      else {
        const folder = folders().find((f) => f.name === name)
        if (folder) {
          store.settings.folders = folders().filter((f) => f !== folder)
          delete handles[folder.id]
          picked.delete(folder.id)
          readable.delete(folder.id)
          kvSet('handles', handles).catch(() => {})
          dropMissing(inFolder(folder))
          pruneTitles()
        }
      }
      changed()
      return folderNames()
    },
    // From a click: also asks again for folders the browser wants re-approved.
    rescan: async () => {
      await booted
      return afterScan(await scan({ ask: true }))
    },
    addFiles: async () => null,

    /* Web only. Folders from an earlier visit that can't be read yet: the
       browser wants a click before it hands them back. */
    foldersNeedingAccess: async () => {
      await booted
      return folders()
        .filter((f) => readable.get(f.id) === false)
        .map((f) => f.name)
    },
    reconnectFolders: async () => {
      await booted
      /* A folder with no kept handle has to be picked again, and a browser
         opens one picker per click. Picking a different folder adds it. */
      const lost = folders().find((f) => readable.get(f.id) === false && !handles[f.id])
      if (lost) {
        const pick = await pickFolder()
        if (pick) await adopt(pick)
      }
      return afterScan(await scan({ ask: true }))
    },
    hasDemo: async () => {
      await ready
      return store.files.some(isDemo)
    },
    restoreDemo: async () => {
      await booted
      const demo = demoLists()
      for (const k of ['titles', 'files', 'history']) {
        const have = new Set(store[k].map((x) => x.id))
        store[k].push(...demo[k].filter((x) => !have.has(x.id)))
      }
      changed()
      return folderNames()
    },

    // Player. The page plays the file itself (views/Watch.jsx) and reports in.
    play: async () => ({ ok: true }),
    nowPlaying: async () =>
      current && {
        fileId: current.fileId,
        status: current.playing ? 'playing' : 'paused',
        positionMs: current.lastPos,
        durationMs: current.duration
      },
    watchSource: async (fileId) => {
      await booted
      const f = store.files.find((x) => x.id === fileId)
      if (!f || f.present === false) return { error: 'This file isn’t here any more.' }
      if (f.src) return { url: f.src }
      try {
        const file = await getFile(fileId)
        if (!file) return { error: 'This folder needs reconnecting before it can play.' }
        if (blobUrl) URL.revokeObjectURL(blobUrl)
        blobUrl = URL.createObjectURL(file)
        return { url: blobUrl }
      } catch {
        return { error: 'This file couldn’t be opened. Was it moved or deleted?' }
      }
    },
    watchTick: (fileId, { positionMs, durationMs, playing }) => {
      const now = Date.now()
      if (current && current.fileId !== fileId) finish()
      if (!current) {
        if (!store.files.some((x) => x.id === fileId)) return
        current = { fileId, startedAt: now, startPos: positionMs, watchedSec: 0, lastTick: now, playing: false }
      }
      // Counted from the last report, capped so a sleeping laptop isn't a watch.
      if (current.playing) current.watchedSec += Math.min(now - current.lastTick, 5000) / 1000
      current.lastTick = now
      current.playing = !!playing
      current.lastPos = positionMs
      current.duration = durationMs || current.duration
      if (now - lastSave >= SAVE_EVERY_MS) {
        lastSave = now
        writePosition(current)
        changed()
      }
    },
    watchEnd: () => finish(),

    titleDetails: async (id) => {
      await ready
      const t = store.titles.find((x) => x.id === id)
      if (!t) return null
      try {
        await matcher.ensureDetails(t)
      } catch {
        /* offline: the page renders from what we have */
      }
      changed()
      return t
    },
    updateTitle: async (id, patch) => {
      await ready
      const t = store.titles.find((x) => x.id === id)
      if (!t) return null
      for (const [k, v] of Object.entries(patch || {})) if (TITLE_KEYS.has(k)) t[k] = v
      changed()
      return t
    },
    // Same rule as the desktop app: unwatching also forgets the position.
    setWatched: async (fileIds, watched) => {
      await ready
      const ids = new Set(fileIds || [])
      for (const f of store.files) {
        if (!ids.has(f.id)) continue
        f.completed = !!watched
        if (!watched) f.positionMs = 0
        else f.lastWatched = f.lastWatched || Date.now()
      }
      changed()
    },
    revealFile: async () => {},

    getSettings: async () => {
      await ready
      return publicSettings()
    },
    setSettings: async (patch) => {
      await ready
      for (const [k, v] of Object.entries(patch || {})) if (SETTING_KEYS.has(k)) store.settings[k] = v
      save()
      cloud.schedule()
      return publicSettings()
    },

    // Web only: signing in and syncing (cloud.js). `account.available` is
    // false in a build with no Supabase project configured.
    account: cloud,

    openExternal: async (url) => {
      if (/^https?:\/\//i.test(String(url))) window.open(url, '_blank', 'noopener')
    }

  }
}
