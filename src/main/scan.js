import { promises as fsp, existsSync } from 'fs'
import { basename, join } from 'path'
import { store, saveStore } from './store'
import { fileFor } from './tracker'
import { MAX_DEPTH, MIN_BYTES, SKIP_DIR, SKIP_FILE, VIDEO } from '../shared/scan-rules'

/* Folder scanning. Walks every library folder for video files and gives each
   one a record with its full path — which is what Resume needs, since
   PotPlayer's window title only ever tells us the file NAME.

   A file already known by name (watched before the folder was added) gets its
   path filled in, so its history and resume position carry straight over. */

async function walk(dir, depth, out) {
  let entries
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
  } catch {
    return // unreadable or gone — skip, don't fail the whole scan
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) {
      if (depth < MAX_DEPTH && !SKIP_DIR.test(e.name)) await walk(full, depth + 1, out)
    } else if (e.isFile() && VIDEO.test(e.name) && !SKIP_FILE.test(e.name)) {
      try {
        if ((await fsp.stat(full)).size >= MIN_BYTES) out.push(full)
      } catch {
        /* vanished mid-scan */
      }
    }
  }
}

const inside = (path, root) => path.toLowerCase().startsWith(root.toLowerCase().replace(/[\\/]*$/, '\\'))

// Record a video found on disk: fill in (or fix) its path, mark it present.
function recordFile(full) {
  const f = fileFor(basename(full), full)
  // Moved or re-downloaded: a stale path is replaced by the one on disk now.
  if (f.path !== full && !(f.path && existsSync(f.path))) f.path = full
  // Back on disk after being gone: it reconnects to its history as it was.
  if (f.present === false) back++
  f.present = true
  delete f.missingAt
  if (!f.addedAt) f.addedAt = Date.now()
  return f
}

/* Files picked one by one (Add file), outside any library folder. */
export function addFiles(paths) {
  const before = store.files.length
  for (const p of paths) if (VIDEO.test(p)) recordFile(p)
  saveStore()
  return { found: paths.length, added: store.files.length - before }
}

/* Keep only the outermost folders: Downloads covers Downloads\Video\s1, and
   walking both is the same files twice. */
export function normalizeFolders(list) {
  const low = (p) => p.toLowerCase().replace(/[\\/]+$/, '')
  const uniq = [...new Map(list.map((p) => [low(p), p])).values()]
  return uniq.filter((p) => !uniq.some((q) => q !== p && inside(p, q)))
}

let scanning = null
let back = 0

/* Returns { found, added, gone, back }. Concurrent calls share one run. */
export function scanFolders() {
  if (scanning) return scanning
  scanning = (async () => {
    const folders = store.settings.folders || []
    const found = []
    for (const root of folders) await walk(root, 0, found)

    const known = new Set(store.files.map((f) => f.id))
    back = 0
    const seen = new Set()
    for (const full of found) {
      seen.add(recordFile(full).id)
    }
    /* Not found this time. Inside a library folder, either it was deleted or
       the rules now leave it out (a Captures folder, a clip): a file you never
       watched is simply forgotten; one you did stays, for History. Anywhere
       else (Add file, or a folder since removed) the file is just checked.
       Either way a kept file is marked by whether it's still on disk, and
       when it went, like an uninstalled game keeping its hours. */
    const watched = new Set(store.history.map((h) => h.fileId))
    let gone = 0
    store.files = store.files.filter((f) => {
      if (seen.has(f.id) || !f.path) return true
      const inLibrary = folders.some((r) => inside(f.path, r))
      if (inLibrary && !watched.has(f.id) && !f.lastWatched) return false
      const present = existsSync(f.path)
      if (!present && f.present !== false) {
        gone++
        f.missingAt = Date.now()
      } else if (present && f.present === false) {
        back++
        delete f.missingAt
      }
      f.present = present
      return true
    })
    // Titles we matched that nothing points at any more. One you touched
    // (favourited, or picked by hand) is kept.
    const used = new Set([...store.files.map((f) => f.titleId), ...store.history.map((h) => h.titleId)])
    store.titles = store.titles.filter((t) => used.has(t.id) || t.auto === false || t.favorite)
    saveStore()
    return { found: found.length, added: [...seen].filter((id) => !known.has(id)).length, gone, back }
  })().finally(() => {
    scanning = null
  })
  return scanning
}
