import { createCinemeta, detailsFromMeta, parseFile, titleFromMeta } from '../shared/matching'
import { embeddedTitle } from '../shared/embedded'

/* The web build's side of matching a file to a title. The rules are the
   desktop's (src/shared/matching.js); this supplies the browser's fetch, a
   File to read the embedded title from, and the folders above a file. */

async function getJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
const { findMeta, fullMeta } = createCinemeta(getJson)

/* The folders above a file, nearest first, three at most. Unlike the desktop,
   the picked folder itself counts: there it is Downloads or Videos, here a
   visitor is as likely to pick the show's own folder. */
function parentDirs(path) {
  return path.split('/').slice(0, -1).reverse().slice(0, 3)
}

export function createMatcher({ getStore, getFile, onMatched }) {
  const tried = new Set() // one attempt per file per visit
  let running = false

  async function matchFile(f) {
    tried.add(f.id)
    const store = getStore()
    const parsed = await parseFile(f.fileName, {
      embeddedTitle: async () => {
        try {
          const file = await getFile(f.id)
          if (!file) return null
          const read = async (start, length) => new Uint8Array(await file.slice(start, start + length).arrayBuffer())
          return await embeddedTitle(f.fileName, file.size, read)
        } catch {
          return null
        }
      },
      parentDirs: parentDirs(f.path || '')
    })
    f.season = parsed.season
    f.episode = parsed.episode
    if (!parsed.query) return false
    const hit = await findMeta(parsed)
    if (!hit) return false
    const imdbId = hit.imdb_id || hit.id
    let title = store.titles.find((t) => t.imdbId === imdbId)
    if (!title) {
      const meta = (await fullMeta(hit.type, imdbId)) || hit
      title = titleFromMeta(meta, hit.type)
      store.titles.push(title)
    }
    f.titleId = title.id
    for (const h of store.history) if (h.fileId === f.id && !h.titleId) h.titleId = title.id
    return true
  }

  /* Match every file that has no title yet. Serial on purpose: a whole folder
     at once would be a burst of searches against a free service. */
  async function matchPending() {
    if (running) return
    running = true
    try {
      for (;;) {
        const f = getStore().files.find((x) => !x.titleId && x.present !== false && !tried.has(x.id))
        if (!f) break
        try {
          if (await matchFile(f)) onMatched()
        } catch (e) {
          console.error('[metadata]', f.fileName, e.message)
        }
      }
    } finally {
      running = false
    }
  }

  // Cast, trailers and the episode list, fetched the first time a page opens.
  async function ensureDetails(title) {
    if (title.details) return title
    const meta = await fullMeta(title.type, title.imdbId)
    if (!meta) return title
    title.details = detailsFromMeta(meta)
    if (!title.description && meta.description) title.description = meta.description
    return title
  }

  return { matchPending, ensureDetails }
}
