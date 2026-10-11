import { net } from 'electron'
import { basename, dirname } from 'path'
import { store, saveStore } from './store'
import { readEmbeddedTitle } from './embedded'
import {
  createCinemeta,
  detailsFromMeta,
  parseFile as parseName,
  parseFileName,
  plausibleMatch,
  titleFromMeta
} from '../shared/matching'

/* Metadata and artwork, keyless.

   Cinemeta is Stremio's public catalogue: search by name, get an IMDb id,
   poster, a large background (the hero), a logo, genres, a description and
   the IMDb rating. No account, no key. TMDB can join later for trending; nothing here depends on it.

   The rules themselves (file names, plausibility, the title record) live in
   src/shared/matching.js, shared with the web build. This file is the
   desktop's side of it: paths, files on disk, Electron's fetch, the store. */

export { parseFileName, plausibleMatch }

/* Up to two folders above the file, nearest first, stopping at a library
   folder: past Videos is the user's own folder, and "peter" found Peter Pan. */
function parentDirs(path, roots) {
  const low = (x) => x.toLowerCase().replace(/[\\/]+$/, '')
  const isRoot = (d) => roots.some((r) => low(r) === low(d)) || dirname(d) === d
  const names = []
  let dir = dirname(path)
  for (let up = 0; up < 2 && !isRoot(dir); up++) {
    names.push(basename(dir))
    dir = dirname(dir)
  }
  return names
}

function parseFile(f, roots = []) {
  if (!f.path) return parseName(f.fileName)
  return parseName(f.fileName, {
    embeddedTitle: () => readEmbeddedTitle(f.path),
    parentDirs: parentDirs(f.path, roots)
  })
}

/* ---------------- Cinemeta ---------------- */
async function getJson(url) {
  const res = await net.fetch(url, { headers: { 'user-agent': 'VideoLibrary/0.1' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const { findMeta, fullMeta } = createCinemeta(getJson)

/* Details for the title page — fetched once, then kept. Titles matched
   before details existed get them the first time their page opens. */
export async function ensureDetails(title) {
  if (title.details) return title
  const meta = await fullMeta(title.type, title.imdbId)
  if (!meta) return title
  title.details = detailsFromMeta(meta)
  if (!title.description && meta.description) title.description = meta.description
  saveStore()
  return title
}

/* ---------------- Matching ---------------- */
const tried = new Set() // one attempt per file per run; misses retry next launch
let running = false
let onMatched = () => {}

async function matchFile(f) {
  tried.add(f.id)
  const parsed = await parseFile(f, store.settings.folders || [])
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
  // History written before the match gets the title too.
  for (const h of store.history) if (h.fileId === f.id && !h.titleId) h.titleId = title.id
  return true
}

/* Match every file that has no title yet. Serial on purpose — a whole
   folder at once would be a burst of searches against a free service. */
export async function matchPending() {
  if (running) return
  running = true
  try {
    for (;;) {
      const f = store.files.find((x) => !x.titleId && !tried.has(x.id))
      if (!f) break
      try {
        if (await matchFile(f)) {
          saveStore()
          onMatched()
        }
      } catch (e) {
        console.error('[metadata]', f.fileName, e.message)
      }
    }
  } finally {
    running = false
  }
}

/* Bumped whenever matching gets smarter. Anything the old matcher linked on
   its own is unlinked and matched again; a title you fixed by hand (auto:
   false) is never touched. */
const MATCHER_VERSION = 5
function rematchIfStale() {
  const from = store.settings.matcherVersion || 1
  if (from >= MATCHER_VERSION) return
  /* 4 → 5 only added checks that turn matches DOWN, so instead of redoing
     every title (new addedAt, refetched details), unlink just the auto titles
     no file of theirs would still match. A favourite is never unlinked. */
  if (from === 4) {
    const bad = new Set(
      store.titles
        .filter((t) => t.auto !== false && !t.favorite)
        .filter((t) => {
          const mine = store.files.filter((f) => f.titleId === t.id)
          return (
            mine.length > 0 &&
            mine.every((f) => {
              const p = parseFileName(f.fileName)
              return p.rejected || (p.query && !plausibleMatch(p.query, t.name))
            })
          )
        })
        .map((t) => t.id)
    )
    for (const f of store.files) if (bad.has(f.titleId)) f.titleId = null
    for (const h of store.history) if (bad.has(h.titleId)) h.titleId = null
    store.titles = store.titles.filter((t) => !bad.has(t.id))
    store.settings.matcherVersion = MATCHER_VERSION
    saveStore()
    console.log(`[metadata] matcher v5: unlinked ${bad.size} implausible match(es)`)
    return
  }
  const auto = new Set(store.titles.filter((t) => t.auto !== false).map((t) => t.id))
  for (const f of store.files) if (auto.has(f.titleId)) f.titleId = null
  for (const h of store.history) if (auto.has(h.titleId)) h.titleId = null
  store.titles = store.titles.filter((t) => !auto.has(t.id))
  store.settings.matcherVersion = MATCHER_VERSION
  saveStore()
}

export function initMetadata(changed) {
  onMatched = changed || onMatched
  rematchIfStale()
  matchPending()
}
