import { net } from 'electron'
import { randomUUID } from 'crypto'
import { basename, dirname } from 'path'
import { store, saveStore } from './store'
import { readEmbeddedTitle } from './embedded'

/* Metadata and artwork, keyless.

   Cinemeta is Stremio's public catalogue: search by name, get an IMDb id,
   poster, a large background (the hero), a logo, genres, a description and
   the IMDb rating. No account, no key. TMDB can join later for trending; nothing here depends on it. */

const CINEMETA = 'https://v3-cinemeta.strem.io'
const ART = 'https://images.metahub.space'

/* ---------------- File names ----------------
   "AnimePahe_Youjo_Senki_-_01_BD_1080p_Vodes.mp4"  → Youjo Senki, ep 1
   "The.Expanse.S02E07.720p.WEB.x265-GRP.mkv"        → The Expanse, S2 E7
   "Inception.2010.1080p.BluRay.x264.mkv"            → Inception (2010)

   Everything after the first quality/source tag is release noise. */
const NOISE =
  /\b(2160p|1080p|720p|576p|480p|4k|uhd|hdr|bd|bdrip|brrip|bluray|blu-ray|web|web-?dl|webrip|hdtv|dvdrip|remux|x264|x265|h\.?264|h\.?265|hevc|avc|aac|ac3|dts|flac|10bit|8bit|proper|repack|extended|unrated|dual[- ]audio|multi[- ]sub)\b/i

/* Release sites and groups that lead a file name without brackets. The search
   is fuzzy and always returns SOMETHING, so a prefix left in doesn't miss — it
   matches the wrong show: "AnimePahe Youjo Senki" found Symphogear GX on the
   word "Senki". Bracketed groups ([SubsPlease]) are already stripped below. */
const SITE_PREFIX =
  /^(animepahe|anime ?time|animekaizoku|subsplease|erai-raws|horriblesubs|judas|ember|asw|yts( mx| am)?|yify|rarbg|tgx|psa|ettv|eztv|tfpdl|www \S+ \S+)[\s-]+/i

const GAME_VIDEO = /\b(cutscenes?|gameplay|walkthrough|playthrough|full game|let'?s play|speedrun)\b/i
// `rejected`: we know what this is, and it isn't a film — no fallbacks either.
const EMPTY_PARSE = () => ({ query: '', season: null, episode: null, year: null, type: 'movie', rejected: true })

export function parseFileName(fileName) {
  const raw = String(fileName || '').replace(/\.[a-z0-9]{2,4}$/i, '')
  /* Game footage and YouTube downloads (yt-dlp ends names in the 11-char video
     id) aren't films. Matched anyway, "RESIDENT EVIL 9 … All Cutscenes Full
     Game" became the film Resident Evil. */
  if (GAME_VIDEO.test(raw) || /\[[A-Za-z0-9_-]{11}\]$/.test(raw)) return EMPTY_PARSE()
  // Hashtags are a social clip's caption, never a film's name ("… #leagueoflegends").
  if (/(^|\s)#[a-z]\w+/i.test(raw)) return EMPTY_PARSE()
  // [Group] tags and (CRC) blobs — but keep a bracketed year.
  let s = raw.replace(/\[[^\]]*\]/g, ' ').replace(/\((?!(19|20)\d{2}\))[^)]*\)/g, ' ')
  /* …unless the brackets ARE the name: "[Frieren Season 1] [ Episode 10]
     [720p] [ @Tv_Series_ETY ]". Then keep their contents, minus @handles. */
  if (!/[a-z]{2,}/i.test(s.replace(/[._]+/g, ' ')))
    s = [...raw.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]).filter((t) => !/@/.test(t)).join(' ')
  s = s.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim()
  s = s.replace(SITE_PREFIX, '')

  let season = null
  let episode = null
  let year = null
  let cut = s.length

  // No \b after the number: "S03e04Harms.Way" (a dropped dot) is still S3 E4.
  const se = s.match(/\bS(\d{1,2})\s?E(\d{1,3})(?!\d)/i) || s.match(/\b(\d{1,2})x(\d{2,3})(?!\d)/)
  if (se) {
    season = +se[1]
    episode = +se[2]
    cut = Math.min(cut, se.index)
  } else {
    // Anime: "Title - 01", "Title - 01v2", "Title Episode 12"
    const ep = s.match(/\s-\s(\d{1,4})(?:v\d)?\b/) || s.match(/\b(?:episode|ep)\s?(\d{1,4})\b/i)
    if (ep) {
      season = 1
      episode = +ep[1]
      cut = Math.min(cut, ep.index)
    }
  }
  const y = s.match(/\(?\b((?:19|20)\d{2})\b\)?/)
  if (y && y.index > 0) {
    year = +y[1]
    cut = Math.min(cut, y.index)
  }
  const noise = s.match(NOISE)
  if (noise && noise.index > 0) cut = Math.min(cut, noise.index)

  let query = s.slice(0, cut).replace(/[-\s]+$/, '').trim()
  let type = episode != null ? 'series' : 'movie'

  /* "Youjo Senki II - 01" is season 2 of the same show — Cinemeta files it
     that way — so the marker becomes the season and leaves the search. A bare
     trailing digit is NOT read as a season: "Toy Story 3" is a title. */
  const sm = query.match(/\s+(?:season\s*(\d{1,2})|(\d{1,2})(?:st|nd|rd|th)\s+season|s(\d{1,2})|(ii|iii|iv|v|vi))$/i)
  if (sm) {
    const roman = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6 }
    const n = +(sm[1] || sm[2] || sm[3]) || roman[String(sm[4]).toLowerCase()]
    if (n && type === 'series') season = n
    query = query.slice(0, sm.index).trim()
  }
  /* "Youjo Senki Movie - 01" is the film, and "Movie" left in the query
     finds Scary Movie. */
  const mv = query.match(/\s+(?:the\s+)?(?:movie|film)(?:\s+\d+)?$/i)
  if (mv) {
    type = 'movie'
    season = null
    episode = null
    query = query.slice(0, mv.index).trim()
  }
  /* Scrambled names ("tno10172x") have no real word to search for, and the
     search always answers something — better unmatched than wrong. */
  if (!query.split(/[\s-]+/).some((w) => /^[a-z]{2,}$/i.test(w) || /^(19|20)\d{2}$/.test(w))) query = ''

  return { query, season, episode, year, type }
}

/* Folders that say nothing about what's inside them — skipped when a file's
   folder is used as its name ("Book 1" → look one level up). */
const GENERIC_DIR =
  /^(s\d{1,2}|season\s*\d+|book\s*\d+|part\s*\d+|disc\s*\d+|videos?|downloads?|movies?|films?|tv|tv shows|shows|series|anime|cartoons?|complete|extras?|subs?)$/i

/* The file name first; when it has nothing to search for, the title written
   inside the file; then the folder it sits in. Season and episode are kept
   from whichever source had them — the folder rarely does. */
async function parseFile(f, roots = []) {
  let p = parseFileName(f.fileName)
  if (p.query || p.rejected || !f.path) return p
  const embedded = await readEmbeddedTitle(f.path)
  // Some sites stamp an advert where the title goes ("Download Movies On …").
  if (embedded && !/(download|https?:|www\.|\.(com|to|in|org|net|me)\b|t\.me|telegram|@)/i.test(embedded)) {
    // A fake extension, so a trailing ".S01E01" isn't taken for one.
    const e = parseFileName(`${embedded}.x`)
    if (e.query) return e
  }
  // Never above a library folder: past Videos is the user's own folder, and
  // "peter" found Peter Pan.
  const low = (x) => x.toLowerCase().replace(/[\\/]+$/, '')
  const isRoot = (d) => roots.some((r) => low(r) === low(d)) || dirname(d) === d
  let dir = dirname(f.path)
  for (let up = 0; up < 2 && !isRoot(dir); up++) {
    const name = basename(dir)
    if (!GENERIC_DIR.test(name)) {
      const d = parseFileName(`${name}.x`)
      if (d.query) {
        const hasEp = p.episode != null
        return {
          ...d,
          season: hasEp ? p.season : d.season,
          episode: hasEp ? p.episode : d.episode,
          type: hasEp ? 'series' : d.type
        }
      }
    }
    dir = dirname(dir)
  }
  return p
}

/* ---------------- Cinemeta ---------------- */
async function getJson(url) {
  const res = await net.fetch(url, { headers: { 'user-agent': 'VideoLibrary/0.1' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/* Cached per run: a season folder is 24 files with the same query, and
   that should be one search, not 24 against a free service. */
const searchCache = new Map()
function search(type, query) {
  if (!query) return Promise.resolve([])
  const key = `${type}|${query.toLowerCase()}`
  if (!searchCache.has(key)) {
    const url = `${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(query)}.json`
    const p = getJson(url).then((d) => (Array.isArray(d.metas) ? d.metas : []))
    p.catch(() => searchCache.delete(key)) // a network blip shouldn't stick
    searchCache.set(key, p)
  }
  return searchCache.get(key)
}

const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const words = (x) => new Set(norm(x).split(' ').filter(Boolean))

/* Would a person agree this hit IS that name? Real titles parse down to a few
   words, and for those Cinemeta is trusted even with no words in common — it
   knows alternate titles, so "Youjo Senki" rightly finds Saga of Tanya the
   Evil. A long query is a sentence: a YouTube video's title ("Xbox One
   Doesn't Turn On - Completely Dead With No Power…"), which the always-answering
   search turned into the film Man with No Past on two shared words. So past
   LONG_QUERY words, the hit's name has to account for at least half of them —
   or the file stays unmatched, which beats wrong. */
const LONG_QUERY = 5
export function plausibleMatch(query, name) {
  const q = words(query)
  if (q.size < LONG_QUERY) return true
  const n = words(name)
  let shared = 0
  for (const w of q) if (n.has(w)) shared++
  return shared / q.size >= 0.5
}

/* Best hit for a parsed name. Cinemeta's search is fuzzy and usually
   answers, so the real defence against leftover junk is SITE_PREFIX above;
   on an outright miss the first word is dropped and we try again, twice at
   most. The expected type is searched first, the other one
   second: a movie with "- 01" in its name is rarer than a show without it. */
async function findMeta(parsed) {
  const types = parsed.type === 'series' ? ['series', 'movie'] : ['movie', 'series']
  let words = parsed.query.split(' ')
  for (let drop = 0; drop < 3 && words.length > 0; drop++) {
    const q = words.join(' ')
    for (const type of types) {
      const hits = await search(type, q)
      if (!hits.length) continue
      // Prefer the year when we have one, then an exact name.
      const byYear = parsed.year && hits.find((h) => String(h.releaseInfo || '').startsWith(String(parsed.year)))
      const exact = hits.find((h) => norm(h.name) === norm(q))
      const best = byYear || exact || hits[0]
      // Judged against the whole name, not the shortened retry: dropping words
      // from a sentence only makes a coincidental hit easier.
      if (!plausibleMatch(parsed.query, best.name)) continue
      return { ...best, type }
    }
    words = words.slice(1)
  }
  return null
}

async function fullMeta(type, imdbId) {
  try {
    const d = await getJson(`${CINEMETA}/meta/${type}/${imdbId}.json`)
    return d.meta || null
  } catch {
    return null
  }
}

/* Everything the title page needs beyond the card: cast and crew for More
   info, trailers, and the episode list (names, summaries, thumbnails) so
   episodes you haven't downloaded still show up in their season. */
function detailsFromMeta(meta) {
  const list = (x) => (Array.isArray(x) ? x.filter(Boolean) : [])
  return {
    cast: list(meta.cast),
    director: list(meta.director),
    writer: list(meta.writer),
    country: meta.country || '',
    awards: meta.awards || '',
    released: meta.released || '',
    trailers: list(meta.trailers).map((t) => t.source).filter(Boolean),
    episodes: list(meta.videos)
      .filter((v) => v.season != null && (v.episode != null || v.number != null))
      .map((v) => ({
        season: v.season,
        episode: v.episode != null ? v.episode : v.number,
        name: v.name || v.title || '',
        overview: v.overview || v.description || '',
        thumbnail: v.thumbnail || null,
        released: v.released || v.firstAired || null
      }))
  }
}

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

function titleFromMeta(meta, type) {
  const id = meta.imdb_id || meta.id
  return {
    id: randomUUID(),
    imdbId: id,
    type,
    // Movies / TV for now. Anime and Cartoons become their own categories later.
    category: type === 'series' ? 'tv' : 'movies',
    name: meta.name,
    year: meta.releaseInfo || meta.year || '',
    description: meta.description || '',
    genres: meta.genres || meta.genre || [],
    imdbRating: meta.imdbRating || null,
    runtime: meta.runtime || '',
    poster: `${ART}/poster/medium/${id}/img`,
    background: `${ART}/background/large/${id}/img`,
    logo: meta.logo ? `${ART}/logo/medium/${id}/img` : null,
    addedAt: Date.now(),
    details: meta.videos || meta.cast ? detailsFromMeta(meta) : null,
    auto: true // matched by us, not picked by you — safe to redo if the matcher improves
  }
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
