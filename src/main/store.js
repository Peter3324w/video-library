import { app } from 'electron'
import {
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { join } from 'path'

/* The whole library lives in one JSON file in userData.

   Three lists, and the split is the point:
   - titles   what a thing IS: a movie or a show, matched to TMDB when we can.
              Ratings, reviews and favourites hang off the title.
   - files    what is on disk right now, each pointing at a title (and a
              season/episode for shows). Resume position lives here.
   - history  what you watched and when. Keyed by title, never by path, so it
              outlives the file — delete an episode and you still watched it. */
const EMPTY = () => ({
  version: 1,
  settings: {},
  titles: [],
  files: [],
  history: []
})

let dataPath = ''
export let store = EMPTY()

function tryParse(file) {
  try {
    if (!existsSync(file)) return null
    const parsed = JSON.parse(readFileSync(file, 'utf-8'))
    if (!parsed || typeof parsed !== 'object') return null
    const base = EMPTY()
    for (const k of ['titles', 'files', 'history'])
      if (!Array.isArray(parsed[k])) parsed[k] = base[k]
    if (!parsed.settings || typeof parsed.settings !== 'object') parsed.settings = {}
    return parsed
  } catch {
    return null
  }
}

export function loadStore() {
  dataPath = join(app.getPath('userData'), 'data.json')
  // Main file first, then the last known-good backup. Never silently reset to
  // empty over real data.
  store = tryParse(dataPath) || tryParse(dataPath + '.bak') || EMPTY()
  const s = store.settings
  if (s.theme === undefined) s.theme = 'midnight'
  if (s.accent === undefined) s.accent = null
  if (!Array.isArray(s.accentRecents)) s.accentRecents = []
  return store
}

/* Windows Defender scanning the file can make the rename lose a race it would
   win a moment later (it shows up as silent EPERMs). Retry lock errors
   only; anything else is a real failure. */
const LOCK_CODES = new Set(['EPERM', 'EACCES', 'EBUSY'])
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}
function renameWithRetry(tmp, file, tries = 5) {
  for (let i = 0; ; i++) {
    try {
      renameSync(tmp, file)
      return
    } catch (e) {
      if (i >= tries - 1 || !LOCK_CODES.has(e.code)) throw e
      sleepSync(20 * 2 ** i)
    }
  }
}

function atomicWrite(file, data) {
  const tmp = file + '.tmp'
  const fd = openSync(tmp, 'w')
  try {
    writeFileSync(fd, data)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  try {
    renameWithRetry(tmp, file)
  } catch (e) {
    try {
      unlinkSync(tmp)
    } catch {
      /* best effort */
    }
    throw e
  }
}

let lastGood = ''
export function saveStore() {
  try {
    const json = JSON.stringify(store, null, 2)
    atomicWrite(dataPath, json)
    if (json !== lastGood) {
      try {
        copyFileSync(dataPath, dataPath + '.bak')
      } catch {
        /* best effort */
      }
      lastGood = json
    }
  } catch (e) {
    console.error('[store] could not write data.json', e)
  }
}
