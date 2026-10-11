// Builds src/web/demo-seed.json, the sample films the web build can load.
//
//   node scripts/build-demo-seed.mjs
//
// The web build starts empty. A visitor with no folder to point it at can load
// these instead: a library that is already lived in, with things half watched,
// things finished, things deleted. Everything in it is free to stream: the Blender open
// movies and Pioneer One are Creative Commons, the rest are public domain,
// all hosted on archive.org. Art and metadata come from Cinemeta, exactly as
// they do for a scanned file.
//
// Timestamps are written relative to `generatedAt`; the web build shifts them
// to the visitor's clock, so "Yesterday" is still yesterday next year.
import { writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const CINEMETA = 'https://v3-cinemeta.strem.io'
const ART = 'https://images.metahub.space'
const IA = (item, file) => `https://archive.org/download/${item}/${encodeURIComponent(file).replace(/%2F/g, '/')}`

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR
const now = Date.now()
const ago = (ms) => now - ms

/* `watch` is where the visitor "left it": a fraction of the runtime, and how
   long ago. `gone` is a file deleted that long ago: no source, history only. */
const MOVIES = [
  {
    imdb: 'tt1727587',
    fileName: 'Sintel.2010.1080p.BluRay.x264.mp4',
    src: IA('Sintel', 'sintel-2048-stereo_512kb.mp4'),
    durationMs: 888060,
    added: 9 * DAY,
    watch: { at: 0.42, ago: 3 * HOUR },
    favorite: true
  },
  {
    imdb: 'tt1254207',
    fileName: 'Big.Buck.Bunny.2008.720p.mp4',
    src: IA('BigBuckBunny_124', 'Content/big_buck_bunny_720p_surround.mp4'),
    durationMs: 596500,
    added: 14 * DAY,
    watch: { at: 0.97, ago: 5 * DAY }
  },
  {
    imdb: 'tt0032599',
    fileName: 'His.Girl.Friday.1940.720p.WEB-DL.mp4',
    src: IA('his_girl_friday', 'his_girl_friday_512kb.mp4'),
    durationMs: 5504520,
    added: 6 * DAY,
    watch: { at: 0.38, ago: 4 * DAY }
  },
  {
    imdb: 'tt2285752',
    fileName: 'Tears.of.Steel.2012.1080p.mp4',
    src: IA('Tears-of-Steel', 'tears_of_steel_720p.mp4'),
    durationMs: 734120,
    added: 2 * DAY
  },
  {
    imdb: 'tt0807840',
    fileName: 'Elephants.Dream.2006.1080p.mp4',
    src: IA('ElephantsDream', 'ed_hd.mp4'),
    durationMs: 653850,
    added: 14 * DAY
  },
  {
    imdb: 'tt1172203',
    fileName: 'Sita.Sings.the.Blues.2008.DVDRip.mp4',
    src: IA('Sita_Sings_the_Blues', 'Sita_Sings_the_Blues_small.mp4'),
    durationMs: 4891230,
    added: 1 * DAY
  },
  {
    imdb: 'tt0017925',
    fileName: 'The.General.1926.720p.BluRay.mp4',
    src: IA('TheGeneral', 'The_General_512kb.mp4'),
    durationMs: 4039150,
    added: 11 * DAY,
    favorite: true
  },
  {
    imdb: 'tt0063350',
    fileName: 'Night.of.the.Living.Dead.1968.1080p.BluRay.x264.mkv',
    durationMs: 96 * MIN,
    added: 40 * DAY,
    watch: { at: 0.96, ago: 20 * DAY },
    gone: 12 * DAY
  },
  {
    imdb: 'tt0056923',
    fileName: 'Charade.1963.1080p.BluRay.x264.mkv',
    durationMs: 113 * MIN,
    added: 35 * DAY,
    watch: { at: 0.55, ago: 26 * DAY },
    gone: 12 * DAY
  },
  {
    imdb: 'tt0013442',
    fileName: 'Nosferatu.1922.REMASTERED.720p.mkv',
    durationMs: 89 * MIN,
    added: 60 * DAY,
    watch: { at: 0.99, ago: 48 * DAY },
    gone: 30 * DAY
  }
]

const SHOW = {
  imdb: 'tt1748166',
  added: 8 * DAY,
  episodes: [
    { ep: 1, item: 'pioneer-one-ep.-1-earthfall-pilot', file: 'PIONEER ONE Ep.1 Earthfall-Pilot.mp4', durationMs: 1896310, watch: { at: 0.93, ago: 3 * DAY } },
    { ep: 2, item: 'pioneer-one-ep.-2-the-man-from-mars_202608', file: 'PIONEER ONE Ep.2 The Man From Mars.mp4', durationMs: 2322040, watch: { at: 0.91, ago: 2 * DAY } },
    { ep: 3, item: 'pioneer-one-ep.-3-alone-in-the-night', file: 'PIONEER ONE Ep.3 Alone in the Night.mp4', durationMs: 1874730, watch: { at: 0.41, ago: 1 * DAY } },
    { ep: 4, item: 'pioneer-one-ep.-4-triangular-diploma', file: 'PIONEER ONE Ep.4 Triangular Diploma.mp4', durationMs: 2026710 },
    { ep: 5, item: 'pioneer-one-ep.-5-sea-change', file: 'PIONEER ONE Ep.5 Sea Change.mp4', durationMs: 2264050 },
    { ep: 6, item: 'pioneer-one-ep.-6-war-of-the-world-3mp-4_202608', file: 'PIONEER ONE Ep.6 War of the World3mp4.mp4', durationMs: 2640270 }
  ]
}

const DONE_FRACTION = 0.85 // same rule as src/main/tracker.js

async function meta(type, imdb) {
  const res = await fetch(`${CINEMETA}/meta/${type}/${imdb}.json`)
  if (!res.ok) throw new Error(`${imdb}: HTTP ${res.status}`)
  const m = (await res.json()).meta
  if (!m) throw new Error(`${imdb}: no meta`)
  return m
}

// The same shapes src/main/metadata.js writes, so the renderer can't tell.
const list = (x) => (Array.isArray(x) ? x.filter(Boolean) : [])
function details(m) {
  return {
    cast: list(m.cast),
    director: list(m.director),
    writer: list(m.writer),
    country: m.country || '',
    awards: m.awards || '',
    released: m.released || '',
    trailers: list(m.trailers).map((t) => t.source).filter(Boolean),
    episodes: list(m.videos)
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
function title(m, type, added, favorite) {
  const id = m.imdb_id || m.id
  return {
    id: `demo-${id}`,
    imdbId: id,
    type,
    category: type === 'series' ? 'tv' : 'movies',
    name: m.name,
    year: m.releaseInfo || m.year || '',
    description: m.description || '',
    genres: m.genres || m.genre || [],
    imdbRating: m.imdbRating || null,
    runtime: m.runtime || '',
    poster: `${ART}/poster/medium/${id}/img`,
    background: `${ART}/background/large/${id}/img`,
    logo: m.logo ? `${ART}/logo/medium/${id}/img` : null,
    addedAt: ago(added),
    details: details(m),
    auto: true,
    ...(favorite ? { favorite: true } : {})
  }
}

const titles = []
const files = []
const history = []

function addFile({ id, titleId, fileName, folder, src, durationMs, added, watch, gone, season = null, episode = null }) {
  const positionMs = watch ? Math.round(durationMs * watch.at) : 0
  const completed = !!watch && watch.at >= DONE_FRACTION
  const f = {
    id,
    path: `${folder}/${fileName}`,
    fileName,
    titleId,
    season,
    episode,
    positionMs,
    durationMs,
    completed,
    lastWatched: watch ? ago(watch.ago) : null,
    present: !gone,
    addedAt: ago(added),
    ...(gone ? { missingAt: ago(gone) } : {}),
    ...(src ? { src } : {})
  }
  files.push(f)
  if (watch) {
    const seconds = Math.round(positionMs / 1000)
    history.push({
      id: `h-${id}`,
      fileId: id,
      titleId,
      fileName,
      start: ago(watch.ago) - seconds * 1000,
      end: ago(watch.ago),
      seconds,
      fromMs: 0,
      toMs: positionMs,
      durationMs,
      completed
    })
  }
}

for (const mv of MOVIES) {
  const t = title(await meta('movie', mv.imdb), 'movie', mv.added, mv.favorite)
  titles.push(t)
  addFile({ ...mv, id: `demo-file-${mv.imdb}`, titleId: t.id, folder: 'Sample films/Movies' })
  console.log('movie ', t.name, mv.gone ? '(not on this PC)' : '')
}

const show = title(await meta('series', SHOW.imdb), 'series', SHOW.added)
titles.push(show)
for (const e of SHOW.episodes) {
  const n = String(e.ep).padStart(2, '0')
  addFile({
    id: `demo-file-${SHOW.imdb}-s1e${e.ep}`,
    titleId: show.id,
    fileName: `Pioneer.One.S01E${n}.720p.x264-VODO.mp4`,
    folder: 'Sample films/TV/Pioneer One',
    src: IA(e.item, e.file),
    durationMs: e.durationMs,
    added: SHOW.added,
    watch: e.watch,
    season: 1,
    episode: e.ep
  })
}
console.log('series', show.name, `${SHOW.episodes.length} episodes`)

history.sort((a, b) => a.end - b.end)
const out = join(dirname(fileURLToPath(import.meta.url)), '../src/web/demo-seed.json')
writeFileSync(out, JSON.stringify({ generatedAt: now, titles, files, history }, null, 2) + '\n')
console.log(`wrote ${out}: ${titles.length} titles, ${files.length} files, ${history.length} history`)
