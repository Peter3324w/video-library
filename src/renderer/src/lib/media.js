import { cleanName, formatPos } from '../components/rows'

/* One thing you're watching, for Home: a title (show or movie) and the file
   you last had open from it. A show with twelve episodes is one card, on the
   episode you're up to — not twelve cards. Files not matched to a title yet
   stand alone under their cleaned-up file name. */
// On this PC, as far as the last scan knows. A file never scanned (seen only
// in the player) has no flag and counts as here.
export const onDisk = (f) => f.present !== false

// A title with nothing left on this PC is history: it keeps its cover, its
// episodes and where you got to, like an uninstalled game keeping its hours.
export const titleOnDisk = (title, files) => files.some((f) => f.titleId === title.id && onDisk(f))

/* Deleted titles stay out of it: Home is what you can watch now, History and
   each library's "Not on this PC" shelf are where the rest lives. */
export function watchItems(library, now) {
  const titles = new Map((library.titles || []).map((t) => [t.id, t]))
  const groups = new Map()
  for (const f of library.files || []) {
    if (!onDisk(f)) continue
    const key = f.titleId || `file:${f.id}`
    const g = groups.get(key)
    const isNow = now && now.fileId === f.id
    const ts = isNow ? Date.now() : f.lastWatched || 0
    if (!g || ts > g.ts) groups.set(key, { key, file: f, title: titles.get(f.titleId) || null, ts, isNow })
  }
  return [...groups.values()].filter((g) => g.ts > 0).sort((a, b) => b.ts - a.ts)
}

export const itemName = (it) => (it.title ? it.title.name : cleanName(it.file.fileName))

// "S1 · E7", or "Episode 7" when there's no season, or nothing for a movie.
export function episodeLabel(file) {
  if (!file || file.episode == null) return ''
  return file.season != null ? `S${file.season} · E${file.episode}` : `Episode ${file.episode}`
}

// Live numbers when it's the file open in the player, saved ones otherwise.
export function progressOf(it, now) {
  const live = it.isNow && now
  const pos = live ? now.positionMs : it.file.positionMs || 0
  const dur = live ? now.durationMs : it.file.durationMs || 0
  return { pos, dur, left: dur > pos ? dur - pos : 0 }
}

export function leftLabel(p, file) {
  if (file && file.completed) return 'Finished'
  if (!p.dur) return ''
  return `${formatPos(p.left)} left`
}

const epOrder = (f) => (f.season || 0) * 10000 + (f.episode || 0)

/* What pressing Play on a show should open:
   1. an episode you're partway through (the most recent one),
   2. else the episode after the last one you finished,
   3. else the first episode on disk.
   A movie is just its (most recent) file. Only files on this PC count. */
export function nextFileFor(title, files) {
  const mine = files.filter((f) => f.titleId === title.id && f.path && f.present !== false)
  if (!mine.length) return null
  const started = mine
    .filter((f) => f.positionMs > 0 && !f.completed)
    .sort((a, b) => (b.lastWatched || 0) - (a.lastWatched || 0))[0]
  if (started) return started
  const sorted = [...mine].sort((a, b) => epOrder(a) - epOrder(b))
  const done = sorted.filter((f) => f.completed)
  if (done.length) {
    const last = Math.max(...done.map(epOrder))
    const after = sorted.find((f) => epOrder(f) > last && !f.completed)
    if (after) return after
  }
  return sorted.find((f) => !f.completed) || sorted[0]
}
