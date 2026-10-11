/* What rides to Drive, and what a backup MEANS when it comes back down.

   Identity and merge rules only. Nothing here touches the network or knows
   where the copy is kept, so it can be reasoned about — and tested — on its
   own, and both builds use it: the desktop app against a file in Google Drive
   (src/main/drive.js), the web build against a row in Postgres
   (src/web/cloud.js). Every function takes the store it works on.

   Three identities do all the work, because a backup written on another PC
   knows none of this machine's UUIDs:
     titles   imdbId      the same show is the same show anywhere
     files    file name    all PotPlayer's window title ever gives us, and
                           already how the tracker finds a file
     history  its own id   one watch is one row; unioned, never folded
   Remote ids are remapped through those matches on the way in. Skip that and
   history lands pointing at fileIds this library has never heard of. */

// Lowercased so "Ep01.MKV" and "Ep01.mkv" are the same file.
const keyOf = (name) => String(name || '').toLowerCase()

// Carried across machines. No secrets, no machine state: `folders` holds
// absolute paths, so a games-PC folder would arrive here as an entry that
// scans nothing, and driveFileId/googleRefreshToken belong to one install.
const SYNCABLE_SETTINGS = ['theme', 'accent', 'accentRecents']

// A file record minus everything that is true only of this PC. `path` is the
// big one — send it and the other machine's Resume button would hand PotPlayer
// a path off a drive it cannot see.
const fileForSync = (f) => ({
  id: f.id,
  fileName: f.fileName,
  titleId: f.titleId || null,
  season: f.season ?? null,
  episode: f.episode ?? null,
  positionMs: f.positionMs || 0,
  durationMs: f.durationMs || 0,
  completed: !!f.completed,
  lastWatched: f.lastWatched || null
})

// Watch state, or nothing. A file that is merely ON this disk is inventory —
// the other PC rediscovers its own by scanning, and 88 phantom "Not on this
// PC" rows is not a backup of anything.
const isWorthSyncing = (f) => (f.positionMs || 0) > 0 || f.completed || f.lastWatched

export function localPayload(store) {
  const files = store.files.filter(isWorthSyncing)
  /* Titles worth carrying: the ones that state points at, plus any you
     favourited or matched by hand — that is your work, even for a show whose
     files are long gone. Art needs no special handling: Cinemeta posters are
     metahub URLs, not files on this PC, so they travel as-is. */
  const used = new Set([...files.map((f) => f.titleId), ...store.history.map((h) => h.titleId)])
  const titles = store.titles.filter((t) => used.has(t.id) || t.auto === false || t.favorite)
  const settings = {}
  for (const k of SYNCABLE_SETTINGS) if (store.settings[k] !== undefined) settings[k] = store.settings[k]
  return {
    app: 'video-library',
    version: 1,
    exportedAt: Date.now(),
    titles,
    files: files.map(fileForSync),
    history: store.history,
    settings
  }
}

/* Where you stopped is whichever machine watched it LAST, not whichever got
   furthest. Max looks like the safe choice and isn't: start a rewatch on this
   laptop and a stale 90% from the other PC would drag Resume back into the
   credits. `completed` is the exception — it only ever turns on, the same
   one-way rule the finished sweep follows, so nothing un-watches itself. */
function foldFile(mine, rf, localTitleId) {
  let changed = false
  if ((rf.lastWatched || 0) > (mine.lastWatched || 0)) {
    mine.positionMs = rf.positionMs || 0
    mine.lastWatched = rf.lastWatched
    changed = true
  }
  if ((rf.durationMs || 0) > (mine.durationMs || 0)) {
    mine.durationMs = rf.durationMs
    changed = true
  }
  if (rf.completed && !mine.completed) {
    mine.completed = true
    changed = true
  }
  if (mine.season == null && rf.season != null) mine.season = rf.season
  if (mine.episode == null && rf.episode != null) mine.episode = rf.episode
  if (!mine.titleId && rf.titleId) mine.titleId = localTitleId(rf.titleId)
  return changed
}

export function mergeRemote(store, remote) {
  if (!remote || typeof remote !== 'object') return null
  const counts = { titles: 0, files: 0, folded: 0, history: 0 }

  // ---- titles: by id, else by imdbId ----
  const titleIds = new Map()
  for (const rt of Array.isArray(remote.titles) ? remote.titles : []) {
    if (!rt || !rt.id) continue
    const mine =
      store.titles.find((t) => t.id === rt.id) ||
      (rt.imdbId ? store.titles.find((t) => t.imdbId === rt.imdbId) : null)
    if (!mine) {
      store.titles.push({ ...rt })
      titleIds.set(rt.id, rt.id)
      counts.titles++
      continue
    }
    titleIds.set(rt.id, mine.id)
    // Your decisions win over ours, from either side. A title fixed by hand on
    // one PC must not go back to auto here, or the matcher would re-match it.
    if (rt.favorite) mine.favorite = true
    if (rt.auto === false) mine.auto = false
    if (!mine.description && rt.description) mine.description = rt.description
    if (!mine.details && rt.details) mine.details = rt.details
  }
  // A remote id we matched, else the same id if it happens to exist here, else
  // nothing — better unmatched than pointing at a title that isn't there.
  const localTitleId = (id) =>
    !id ? null : titleIds.get(id) || (store.titles.some((t) => t.id === id) ? id : null)

  // ---- files: by id, else by file name ----
  const fileIds = new Map()
  for (const rf of Array.isArray(remote.files) ? remote.files : []) {
    if (!rf || !rf.id || !rf.fileName) continue
    const mine =
      store.files.find((f) => f.id === rf.id) ||
      store.files.find((f) => keyOf(f.fileName) === keyOf(rf.fileName))
    if (!mine) {
      // No path: it is on the other PC, so it reads "Not on this PC" and its
      // history survives. Scanning fills the path in if the file turns up here.
      store.files.push({ ...fileForSync(rf), path: null, titleId: localTitleId(rf.titleId), present: false })
      fileIds.set(rf.id, rf.id)
      counts.files++
      continue
    }
    fileIds.set(rf.id, mine.id)
    if (foldFile(mine, rf, localTitleId)) counts.folded++
  }

  // ---- history: union by id, remapped ----
  const known = new Set(store.history.map((h) => h.id))
  for (const rh of Array.isArray(remote.history) ? remote.history : []) {
    if (!rh || !rh.id || known.has(rh.id)) continue
    store.history.push({
      ...rh,
      fileId: fileIds.get(rh.fileId) || rh.fileId,
      titleId: localTitleId(rh.titleId)
    })
    known.add(rh.id)
    counts.history++
  }
  if (counts.history) store.history.sort((a, b) => (a.end || 0) - (b.end || 0))

  // ---- settings: fill gaps, never clobber ----
  // A backup must not reach in and change a theme you
  // picked here a minute ago.
  const rs = remote.settings || {}
  for (const k of SYNCABLE_SETTINGS) {
    const empty =
      store.settings[k] === undefined ||
      store.settings[k] === null ||
      (Array.isArray(store.settings[k]) && !store.settings[k].length)
    if (empty && rs[k] !== undefined) store.settings[k] = rs[k]
  }
  return counts
}

/* A receipt for what went up, counted from the payload at the moment it went
   up. Re-counting the live library later drifts the instant anything changes,
   and a summary that quietly describes your CURRENT library rather than your
   backup is worse than none — it reassures you about a file it never read. */
export function backupReceipt(payload) {
  const watched = payload.files.filter((f) => f.completed).length
  return {
    at: Date.now(),
    titles: payload.titles.length,
    files: payload.files.length,
    watched,
    history: payload.history.length,
    seconds: payload.history.reduce((n, h) => n + (h.seconds || 0), 0)
  }
}
