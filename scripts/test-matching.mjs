// The file-name rules both builds share (src/shared/matching.js).
//
//   node scripts/test-matching.mjs
import { parseFile, parseFileName, plausibleMatch } from '../src/shared/matching.js'

let failed = 0
function eq(label, got, want) {
  const ok = Object.entries(want).every(([k, v]) => got[k] === v)
  if (!ok) failed++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n      got  ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`}`)
}
const name = (fileName, want) => eq(fileName, parseFileName(fileName), want)

name('AnimePahe_Youjo_Senki_-_01_BD_1080p_Vodes.mp4', { query: 'Youjo Senki', season: 1, episode: 1, type: 'series' })
name('The.Expanse.S02E07.720p.WEB.x265-GRP.mkv', { query: 'The Expanse', season: 2, episode: 7, type: 'series' })
name('Inception.2010.1080p.BluRay.x264.mkv', { query: 'Inception', year: 2010, type: 'movie' })
name('[SubsPlease] Sousou no Frieren - 12 (1080p) [ABCD1234].mkv', { query: 'Sousou no Frieren', episode: 12, type: 'series' })
name('[Frieren Season 1] [ Episode 10] [720p] [ @Tv_Series_ETY ].mkv', { query: 'Frieren', season: 1, episode: 10 })
name('Youjo Senki II - 03.mkv', { query: 'Youjo Senki', season: 2, episode: 3 })
name('Youjo Senki Movie - 01.mkv', { query: 'Youjo Senki', type: 'movie', episode: null })
name('Toy Story 3 (2010).mkv', { query: 'Toy Story 3', year: 2010, type: 'movie' })
name('tfpdl-tno10172x.mkv', { query: '' })
name('RESIDENT EVIL 9 All Cutscenes Full Game.mp4', { query: '', rejected: true })
name('Some clip [r42d9Z9mfss].webm', { query: '', rejected: true })
// A bare episode number keeps its number; the name comes from the folder.
name('S01E01.mkv', { query: '', season: 1, episode: 1, type: 'series' })
name('movie.mkv', { query: '' })

const up = async (fileName, parentDirs, want, embedded) =>
  eq(`${parentDirs.join(' < ')} < ${fileName}`, await parseFile(fileName, { parentDirs, embeddedTitle: embedded && (async () => embedded) }), want)
await up('S01E01.mkv', ['Season 1', 'Severance'], { query: 'Severance', season: 1, episode: 1, type: 'series' })
await up('movie.mkv', ['Arrival (2016)'], { query: 'Arrival', year: 2016, type: 'movie' })
await up('tfpdl-tno10172x.mkv', ['S1', 'The Night Of'], { query: 'The Night Of' })
await up('tfpdl-tno10172x.mkv', ['S1'], { query: 'The Night Of', season: 1, episode: 1 }, 'TFPDL - The.Night.Of.S01E01')
await up('tfpdl-tno10172x.mkv', ['The Night Of'], { query: 'The Night Of' }, 'Download Movies On example.com')

const ok = (label, got) => {
  if (!got) failed++
  console.log(`${got ? 'PASS' : 'FAIL'}  ${label}`)
}
ok('short query trusts the search', plausibleMatch('Youjo Senki', 'Saga of Tanya the Evil'))
ok('a sentence needs half its words', !plausibleMatch('Xbox One Doesnt Turn On Completely Dead With No Power', 'The Man with No Past'))

console.log(failed ? `\n${failed} failed` : '\nall passed')
process.exit(failed ? 1 : 0)
