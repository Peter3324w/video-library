import assert from 'node:assert/strict'
import * as sync from '../src/shared/sync.js'

/* Tests the merge rules both builds share (src/shared/sync.js). They take the
   store they work on, so the test hands them a plain object it can reset
   between cases: the real source, no Electron needed. */
const store = { settings: {}, titles: [], files: [], history: [] }
const localPayload = () => sync.localPayload(store)
const mergeRemote = (remote) => sync.mergeRemote(store, remote)
const { backupReceipt } = sync

function reset(s = {}) {
  store.settings = s.settings || {}
  store.titles = s.titles || []
  store.files = s.files || []
  store.history = s.history || []
}
const T = (over = {}) => ({ id: 't-local', imdbId: 'tt0001', name: 'Youjo Senki', auto: true, ...over })
const F = (over = {}) => ({
  id: 'f-local',
  path: 'C:\\Users\\peter\\Downloads\\Video\\ep01.mkv',
  fileName: 'ep01.mkv',
  titleId: 't-local',
  positionMs: 0,
  durationMs: 1400000,
  completed: false,
  lastWatched: null,
  ...over
})

let ran = 0
const test = (name, fn) => {
  fn()
  ran++
  console.log('  ok  ' + name)
}

// ── what goes up ────────────────────────────────────────────────────────────
test('payload never carries a local path', () => {
  reset({ titles: [T()], files: [F({ positionMs: 500 })] })
  const p = localPayload()
  assert.equal(p.files.length, 1)
  assert.ok(!('path' in p.files[0]), 'path leaked into the payload')
  assert.ok(!('present' in p.files[0]))
})

test('a file with no watch state is inventory, not backup', () => {
  reset({ titles: [T()], files: [F(), F({ id: 'f-2', fileName: 'ep02.mkv', completed: true })] })
  const p = localPayload()
  assert.deepEqual(
    p.files.map((f) => f.fileName),
    ['ep02.mkv']
  )
})

test('a favourited title rides along even with nothing watched', () => {
  reset({ titles: [T({ favorite: true })], files: [F()] })
  assert.equal(localPayload().titles.length, 1)
  reset({ titles: [T()], files: [F()] })
  assert.equal(localPayload().titles.length, 0)
})

test('library folders and the refresh token never ride along', () => {
  reset({
    settings: {
      theme: 'midnight',
      folders: ['C:\\Users\\peter\\Downloads\\Video'],
      googleRefreshToken: 'secret',
      driveFileId: 'abc'
    }
  })
  const s = localPayload().settings
  assert.deepEqual(Object.keys(s), ['theme'])
})

// ── what comes down ─────────────────────────────────────────────────────────
test('a backup from another PC lands with no path and reads as missing', () => {
  reset()
  const n = mergeRemote({
    titles: [T({ id: 't-remote' })],
    files: [F({ id: 'f-remote', path: undefined, positionMs: 900, lastWatched: 5 })],
    history: []
  })
  assert.equal(n.titles, 1)
  assert.equal(n.files, 1)
  assert.equal(store.files[0].path, null, 'adopted the other PC\u2019s path')
  assert.equal(store.files[0].present, false)
})

test('titles match on imdbId, not on the other PC\u2019s uuid', () => {
  reset({ titles: [T()] })
  const n = mergeRemote({ titles: [T({ id: 't-remote', favorite: true })], files: [], history: [] })
  assert.equal(n.titles, 0, 'duplicated a title we already had')
  assert.equal(store.titles.length, 1)
  assert.equal(store.titles[0].favorite, true, 'favourite from the other PC was dropped')
})

test('a title fixed by hand anywhere stays fixed', () => {
  reset({ titles: [T()] })
  mergeRemote({ titles: [T({ id: 't-remote', auto: false })], files: [], history: [] })
  assert.equal(store.titles[0].auto, false)
})

test('files match on file name, case-insensitively', () => {
  reset({ titles: [T()], files: [F()] })
  const n = mergeRemote({
    titles: [],
    files: [F({ id: 'f-remote', fileName: 'EP01.MKV', positionMs: 700, lastWatched: 9 })],
    history: []
  })
  assert.equal(n.files, 0, 'same episode landed twice')
  assert.equal(store.files.length, 1)
  assert.equal(store.files[0].path, F().path, 'lost the local path on a fold')
})

test('the later watch decides where you resume', () => {
  reset({ titles: [T()], files: [F({ positionMs: 1300000, lastWatched: 100 })] })
  mergeRemote({
    titles: [],
    files: [F({ id: 'f-remote', positionMs: 20000, lastWatched: 200 })],
    history: []
  })
  assert.equal(store.files[0].positionMs, 20000, 'a stale further position won')
  assert.equal(store.files[0].lastWatched, 200)
})

test('an older backup never drags the position backwards', () => {
  reset({ titles: [T()], files: [F({ positionMs: 20000, lastWatched: 200 })] })
  mergeRemote({
    titles: [],
    files: [F({ id: 'f-remote', positionMs: 1300000, lastWatched: 100 })],
    history: []
  })
  assert.equal(store.files[0].positionMs, 20000)
})

test('completed only ever turns on', () => {
  reset({ titles: [T()], files: [F({ completed: true, lastWatched: 100 })] })
  mergeRemote({
    titles: [],
    files: [F({ id: 'f-remote', completed: false, positionMs: 10, lastWatched: 999 })],
    history: []
  })
  assert.equal(store.files[0].completed, true, 'a rewatch elsewhere un-finished it')
})

test('history is remapped onto local ids, not the backup\u2019s', () => {
  reset({ titles: [T()], files: [F()] })
  mergeRemote({
    titles: [T({ id: 't-remote' })],
    files: [F({ id: 'f-remote', positionMs: 5, lastWatched: 5 })],
    history: [{ id: 'h-1', fileId: 'f-remote', titleId: 't-remote', seconds: 900, end: 5 }]
  })
  const h = store.history[0]
  assert.equal(h.fileId, 'f-local', 'history points at a file this library has never heard of')
  assert.equal(h.titleId, 't-local', 'history points at a title this library has never heard of')
})

test('history for a title the backup did not carry is left unmatched, not dangling', () => {
  reset()
  mergeRemote({
    titles: [],
    files: [],
    history: [{ id: 'h-1', fileId: 'f-gone', titleId: 't-gone', seconds: 60, end: 1 }]
  })
  assert.equal(store.history[0].titleId, null)
})

test('merging the same backup twice adds nothing', () => {
  reset({ titles: [T()], files: [F()] })
  const remote = {
    titles: [T({ id: 't-remote' })],
    files: [F({ id: 'f-remote', positionMs: 700, lastWatched: 9 })],
    history: [{ id: 'h-1', fileId: 'f-remote', titleId: 't-remote', seconds: 900, end: 9 }]
  }
  mergeRemote(remote)
  const after = JSON.stringify(store)
  const n = mergeRemote(remote)
  assert.deepEqual(n, { titles: 0, files: 0, folded: 0, history: 0 })
  assert.equal(JSON.stringify(store), after, 'a second sync changed the library')
})

test('history stays in order after a merge', () => {
  reset({ history: [{ id: 'h-new', end: 900 }] })
  mergeRemote({ titles: [], files: [], history: [{ id: 'h-old', end: 100 }] })
  assert.deepEqual(
    store.history.map((h) => h.id),
    ['h-old', 'h-new']
  )
})

test('a theme picked here survives a backup that disagrees', () => {
  reset({ settings: { theme: 'midnight' } })
  mergeRemote({ titles: [], files: [], history: [], settings: { theme: 'moss', accent: '#38bdf8' } })
  assert.equal(store.settings.theme, 'midnight', 'the backup clobbered a local setting')
  assert.equal(store.settings.accent, '#38bdf8', 'a missing setting was not filled in')
})

test('a torn or hand-edited Drive file is ignored, not merged', () => {
  reset({ titles: [T()] })
  assert.equal(mergeRemote(null), null)
  assert.equal(mergeRemote('nonsense'), null)
  assert.deepEqual(mergeRemote({}), { titles: 0, files: 0, folded: 0, history: 0 })
  assert.equal(store.titles.length, 1)
})

test('the receipt counts the payload, not the library', () => {
  reset({
    titles: [T()],
    files: [F({ completed: true, lastWatched: 1 })],
    history: [{ id: 'h', seconds: 1200 }]
  })
  const p = localPayload()
  const r = backupReceipt(p)
  // Change the library after the payload is taken: the receipt must not move.
  store.files.push(F({ id: 'f-9', fileName: 'ep09.mkv', completed: true, lastWatched: 2 }))
  assert.deepEqual(backupReceipt(p), { ...r, at: backupReceipt(p).at })
  assert.equal(r.watched, 1)
  assert.equal(r.seconds, 1200)
})

console.log(`\n${ran} passed`)
