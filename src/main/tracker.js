import { basename } from 'path'
import { randomUUID } from 'crypto'
import { store, saveStore } from './store'
import { readPotPlayer } from './players/potplayer'

/* Watches the player and turns what it sees into resume positions and
   history. One file at a time — whatever PotPlayer has open.

   A "watch" runs from the moment a file shows up in the player's title to the
   moment it goes away: the window closes, the title changes (next episode in
   PotPlayer's folder playlist), or playback stops. Only time spent PLAYING is
   counted, so a video left paused overnight is not an eight-hour watch. */

const POLL_MS = 2000
const MIN_WATCH_SECONDS = 10 // shorter than this is a peek, not a watch
const SAVE_EVERY_MS = 15000 // position survives a crash to within 15s
const DONE_FRACTION = 0.85 // past this, the credits are rolling
const DONE_VERSION = 2 // bump whenever DONE_FRACTION moves

let current = null
let lastSave = 0
let onChange = () => {}

// Episodes are found by file name because that is all PotPlayer's title
// gives us. Lowercased so "Ep01.MKV" and "Ep01.mkv" are the same file.
export const keyOf = (name) => String(name || '').toLowerCase()

export function fileFor(fileName, fullPath) {
  const key = keyOf(fileName)
  let f = store.files.find((x) => keyOf(x.fileName) === key)
  if (!f) {
    f = {
      id: randomUUID(),
      path: fullPath || null,
      fileName,
      titleId: null,
      positionMs: 0,
      durationMs: 0,
      completed: false,
      lastWatched: null
    }
    store.files.push(f)
  } else if (fullPath && !f.path) {
    f.path = fullPath
  }
  return f
}

function isDone(posMs, durMs) {
  return durMs > 0 && posMs >= durMs * DONE_FRACTION
}

/* Positions already on disk were judged by the old threshold, so lowering it
   has to sweep them too — otherwise an episode whose credits you sat through
   months ago stays in Continue watching forever. Runs once per DONE_VERSION.

   It only ever marks things finished, never the reverse: "Mark watched" sets
   completed without moving the position, so recomputing the flag from scratch
   would throw away every episode you marked by hand. */
export function recheckFinishedIfStale() {
  if ((store.settings.doneVersion || 1) >= DONE_VERSION) return
  let n = 0
  for (const f of store.files)
    if (!f.completed && isDone(f.positionMs, f.durationMs)) {
      f.completed = true
      n++
    }
  // History carries the same flag, for the "finished" label on the page.
  for (const h of store.history)
    if (!h.completed && isDone(h.toMs, h.durationMs)) {
      h.completed = true
      n++
    }
  store.settings.doneVersion = DONE_VERSION
  saveStore()
  console.log(`[tracker] finished at ${Math.round(DONE_FRACTION * 100)}%: ${n} updated`)
}

function writePosition(w) {
  const f = fileFor(w.fileName)
  f.positionMs = w.lastPos
  if (w.duration) f.durationMs = w.duration
  f.lastWatched = Date.now()
  if (isDone(w.lastPos, w.duration)) f.completed = true
}

function finish(w) {
  writePosition(w)
  if (w.watchedSec >= MIN_WATCH_SECONDS) {
    const f = fileFor(w.fileName)
    store.history.push({
      id: randomUUID(),
      fileId: f.id,
      titleId: f.titleId,
      fileName: w.fileName,
      start: w.startedAt,
      end: Date.now(),
      seconds: Math.round(w.watchedSec),
      fromMs: w.startPos,
      toMs: w.lastPos,
      durationMs: w.duration,
      completed: isDone(w.lastPos, w.duration)
    })
  }
  saveStore()
  onChange()
}

function tick() {
  const snap = readPotPlayer()
  const now = Date.now()
  const name = snap && snap.status !== 'stopped' ? snap.fileName : null

  if (current && current.fileName !== name) {
    finish(current)
    current = null
  }
  if (!name) return

  if (!current) {
    current = {
      fileName: name,
      startedAt: now,
      startPos: snap.positionMs,
      lastPos: snap.positionMs,
      duration: snap.durationMs,
      watchedSec: 0,
      lastTick: now
    }
    // Remember the path we launched it from, if we did.
    fileFor(name)
    onChange()
  }
  if (snap.status === 'playing') {
    // Capped so a sleep/resume gap is never counted as watching.
    current.watchedSec += Math.min(now - current.lastTick, POLL_MS * 2.5) / 1000
  }
  current.lastTick = now
  current.lastPos = snap.positionMs
  current.duration = snap.durationMs || current.duration
  current.status = snap.status

  if (now - lastSave >= SAVE_EVERY_MS) {
    lastSave = now
    writePosition(current)
    saveStore()
    onChange()
  }
}

/* What is playing right now, for the UI. */
export function nowPlaying() {
  if (!current) return null
  const f = fileFor(current.fileName)
  return {
    fileId: f.id,
    fileName: current.fileName,
    status: current.status || 'playing',
    positionMs: current.lastPos,
    durationMs: current.duration
  }
}

export function startTracker(changed) {
  onChange = changed || onChange
  setInterval(tick, POLL_MS)
  tick()
}

// Quitting mid-episode still records where you were.
export function flushTracker() {
  if (current) {
    finish(current)
    current = null
  }
}

export const displayName = (fileName) => basename(fileName || '').replace(/\.[^.]+$/, '')
