import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { loadStore, saveStore, store } from './store'
import { flushTracker, nowPlaying, recheckFinishedIfStale, startTracker } from './tracker'
import { findPotPlayerExe, launchPotPlayer } from './players/potplayer'
import { ensureDetails, initMetadata, matchPending } from './metadata'
import { addFiles, normalizeFolders, scanFolders } from './scan'
import { initArtCache, registerArtScheme } from './artcache'
import { driveConnected, driveSync, initDrive, registerDrive, scheduleDriveSync } from './drive'

let mainWindow = null

// ---------- Window ----------
// Frameless and black, the renderer draws its own
// window controls and drag strip.
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 940,
    minHeight: 600,
    show: false,
    frame: false,
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    // Packaged, the window takes the .exe's icon. In dev the exe is Electron's
    // own, so point at the same build/icon.ico the installer uses.
    ...(app.isPackaged ? {} : { icon: join(__dirname, '../../build/icon.ico') }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow.show())
  mainWindow.on('closed', () => (mainWindow = null))

  if (process.env['ELECTRON_RENDERER_URL']) mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function broadcast(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload)
}
// Bring the window forward — after a Drive sign-in the browser has the focus.
function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

// ---------- Library ----------
function libraryPayload() {
  return { titles: store.titles, files: store.files, history: store.history }
}
ipcMain.handle('library:get', () => libraryPayload())

// ---------- Folders ----------
const folders = () => store.settings.folders || (store.settings.folders = [])

/* Downloads and Videos are where downloads land, so they're in the library
   from the first run — once. Remove one in Settings and it stays removed. */
function addDefaultFolders() {
  if (store.settings.defaultFoldersAdded) return
  const defaults = ['downloads', 'videos'].map((k) => app.getPath(k)).filter((p) => existsSync(p))
  store.settings.folders = normalizeFolders([...folders(), ...defaults])
  store.settings.defaultFoldersAdded = true
  saveStore()
}
async function rescan() {
  const r = await scanFolders()
  broadcast('library:update', libraryPayload())
  matchPending() // new files → titles → art, in the background
  return r
}
ipcMain.handle('folders:get', () => folders())
ipcMain.handle('folders:add', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Add a folder with movies or shows',
    properties: ['openDirectory', 'multiSelections']
  })
  if (r.canceled) return { folders: folders(), scan: null }
  store.settings.folders = normalizeFolders([...folders(), ...r.filePaths])
  saveStore()
  return { folders: store.settings.folders, scan: await rescan() }
})
ipcMain.handle('folders:remove', (_e, path) => {
  store.settings.folders = folders().filter((x) => x !== path)
  saveStore()
  return store.settings.folders
})
ipcMain.handle('library:rescan', () => rescan())
ipcMain.handle('files:add', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Add movies or episodes',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Videos', extensions: ['mkv', 'mp4', 'm4v', 'avi', 'mov', 'wmv', 'webm', 'ts', 'm2ts', 'flv', 'mpg', 'mpeg'] }
    ]
  })
  if (r.canceled) return null
  const res = addFiles(r.filePaths)
  broadcast('library:update', libraryPayload())
  matchPending()
  return res
})

// ---------- Title page tools ----------
ipcMain.handle('title:details', async (_e, id) => {
  const t = store.titles.find((x) => x.id === id)
  if (!t) return null
  try {
    await ensureDetails(t)
  } catch {
    /* offline — the page renders from what we have */
  }
  broadcast('library:update', libraryPayload())
  return t
})
// Only the fields a person sets. Everything else on a title is ours.
const TITLE_KEYS = new Set(['favorite'])
ipcMain.handle('title:update', (_e, id, patch) => {
  const t = store.titles.find((x) => x.id === id)
  if (!t) return null
  for (const [k, v] of Object.entries(patch || {})) if (TITLE_KEYS.has(k)) t[k] = v
  saveStore()
  broadcast('library:update', libraryPayload())
  return t
})
/* Watched / unwatched for one file or a whole title. Unwatching also forgets
   the position, so it plays from the top — that's what "unwatched" means. */
ipcMain.handle('files:setWatched', (_e, fileIds, watched) => {
  const ids = new Set(fileIds || [])
  for (const f of store.files) {
    if (!ids.has(f.id)) continue
    f.completed = !!watched
    if (!watched) f.positionMs = 0
    else f.lastWatched = f.lastWatched || Date.now()
  }
  saveStore()
  broadcast('library:update', libraryPayload())
})
ipcMain.handle('files:reveal', (_e, fileId) => {
  const f = store.files.find((x) => x.id === fileId)
  if (f && f.path) shell.showItemInFolder(f.path)
})

// ---------- Player ----------
ipcMain.handle('player:now', () => nowPlaying())
/* Play a file from where you left it — from the top again if you finished it. */
ipcMain.handle('player:play', (_e, fileId, opts = {}) => {
  const f = store.files.find((x) => x.id === fileId)
  if (!f || !f.path || f.present === false)
    return { ok: false, error: 'This file isn’t on this PC — add its folder in Settings.' }
  const exe = findPotPlayerExe(store.settings.potplayerPath)
  if (!exe) return { ok: false, error: 'PotPlayer isn’t installed where we looked.' }
  launchPotPlayer(exe, f.path, f.completed || opts.fromStart ? 0 : f.positionMs)
  return { ok: true }
})

// ---------- Settings ----------
function publicSettings() {
  const s = store.settings
  return {
    theme: s.theme || 'midnight',
    accent: s.accent || null,
    accentRecents: Array.isArray(s.accentRecents) ? s.accentRecents : []
  }
}
const SETTING_KEYS = new Set(['theme', 'accent', 'accentRecents'])
ipcMain.handle('settings:get', () => publicSettings())
ipcMain.handle('settings:set', (_e, patch) => {
  for (const [k, v] of Object.entries(patch || {})) if (SETTING_KEYS.has(k)) store.settings[k] = v
  saveStore()
  scheduleDriveSync()
  return publicSettings()
})

ipcMain.handle('shell:openExternal', (_e, url) => {
  if (/^https?:\/\//i.test(String(url))) shell.openExternal(url)
})

// ---------- Window controls ----------
/* Maximize fills the work area by hand rather than calling maximize(): on a
   frameless window Windows' own maximize covers the taskbar edge. */
let restoreBounds = null
function isFauxMaximized() {
  if (!mainWindow) return false
  const wa = screen.getDisplayMatching(mainWindow.getBounds()).workArea
  const b = mainWindow.getBounds()
  return b.x === wa.x && b.y === wa.y && b.width === wa.width && b.height === wa.height
}
ipcMain.on('win:minimize', () => mainWindow && mainWindow.minimize())
ipcMain.on('win:maximize', () => {
  if (!mainWindow) return
  if (isFauxMaximized()) {
    if (restoreBounds) mainWindow.setBounds(restoreBounds)
    else mainWindow.unmaximize()
  } else {
    restoreBounds = mainWindow.getBounds()
    mainWindow.setBounds(screen.getDisplayMatching(mainWindow.getBounds()).workArea)
  }
})
ipcMain.on('win:close', () => mainWindow && mainWindow.close())

// ---------- App lifecycle ----------
// Dev runs get their own data folder so tinkering never touches the real library.
// Named outright rather than derived: the default follows package.json's
// productName, so setting that for the installer would have quietly moved dev
// onto an empty library. Installed builds use %APPDATA%\Video Library.
if (!app.isPackaged) app.setPath('userData', join(app.getPath('appData'), 'video-library-dev'))
registerArtScheme()

const gotLock = app.isPackaged ? app.requestSingleInstanceLock() : true
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
  app.whenReady().then(() => {
    app.setAppUserModelId('com.peter3324w.videolibrary')
    loadStore()
    initArtCache()
    // Before the first paint, so nothing renders under the old finished rule.
    recheckFinishedIfStale()
    createWindow()
    broadcast('library:update', libraryPayload())
    const changed = () => broadcast('library:update', libraryPayload())
    initMetadata(changed)
    initDrive({ showWindow, broadcast: changed })
    registerDrive()
    // A file the tracker has never seen gets matched to a title as soon as it shows up.
    startTracker(() => {
      changed()
      matchPending()
      // Debounced, so a session's worth of 15s position saves is one upload.
      scheduleDriveSync()
    })
    addDefaultFolders()
    /* Scan first, then sync: a file the backup knows and this PC has on disk
       then folds into the local record with its real path, instead of showing
       up as "Not on this PC" until the scan catches it. */
    rescan().then(() => {
      if (driveConnected()) driveSync()
    })
  })
}

app.on('before-quit', () => flushTracker())

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
