import { app, ipcMain, shell } from 'electron'
import { createServer } from 'http'
import { randomBytes } from 'crypto'
import { store, saveStore } from './store'
import { backupReceipt, localPayload, mergeRemote } from './sync'
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from './google-config'

/* ── Google Drive backup (bring-your-own-cloud, hidden appData folder) ───────
   The awkward parts of desktop OAuth are explained by the two comments
   inside connectDrive().
   This module owns the token and the transport; sync.js owns what a merge
   means. The only things injected are the two that live in index.js. */

let showWindow = () => {}
let broadcast = () => {}
export function initDrive(deps) {
  showWindow = deps.showWindow || showWindow
  broadcast = deps.broadcast || broadcast
}

const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
/* Dev backs up to its OWN file. userData is already split (dev runs on
   %APPDATA%\video-library-dev so tinkering never touches the real library) and
   the Drive name has to be split the same way. With both profiles on one file,
   connecting Drive in dev would put a
   scratch library one sync away from the real backup. */
const DRIVE_FILE_NAME = app.isPackaged ? 'videolibrary.json' : 'videolibrary-dev.json'
let driveAccess = { token: null, expires: 0 }

function googleCreds() {
  // Baked-in app credentials (google-config.js, git-ignored) — users never see these.
  return { id: GOOGLE_CLIENT_ID, secret: GOOGLE_CLIENT_SECRET }
}
function driveStatus() {
  const { id, secret } = googleCreds()
  return {
    connected: !!store.settings.googleRefreshToken,
    lastSync: store.settings.driveLastSync || null,
    lastBackup: store.settings.driveLastBackup || null,
    hasCreds: !!(id && secret && !/^YOUR_/.test(id))
  }
}
async function googleAccessToken() {
  if (driveAccess.token && Date.now() < driveAccess.expires - 30000) return driveAccess.token
  const { id, secret } = googleCreds()
  const rt = store.settings.googleRefreshToken
  if (!id || !secret || !rt) return null
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: id,
        client_secret: secret,
        refresh_token: rt,
        grant_type: 'refresh_token'
      })
    })
    if (!res.ok) return null
    const t = await res.json()
    driveAccess = { token: t.access_token, expires: Date.now() + (t.expires_in || 3600) * 1000 }
    return driveAccess.token
  } catch {
    return null
  }
}

function connectDrive() {
  const { id, secret } = googleCreds()
  if (!driveStatus().hasCreds)
    return Promise.resolve({ ok: false, error: 'Drive backup isn’t configured in this build.' })
  return new Promise((resolve) => {
    const state = randomBytes(16).toString('hex')
    let settled = false
    let handled = false
    const finish = (r) => {
      if (!settled) {
        settled = true
        resolve(r)
      }
    }
    const server = createServer(async (req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1')
      const code = url.searchParams.get('code')
      const gotState = url.searchParams.get('state')
      const err = url.searchParams.get('error')
      /* Only the callback gets to decide how this ends. The browser asks for
         /favicon.ico the moment the page below renders, over the same
         keep-alive socket server.close() cannot take away, and that request
         carries no code and no state — handled naively it lands in the cancel
         branch and resolved the connection as cancelled while the token
         exchange was still in flight. No OAuth parameters, not the callback. */
      if (!code && !err && !gotState) {
        res.writeHead(204, { Connection: 'close' })
        return res.end()
      }
      if (handled) {
        res.writeHead(204, { Connection: 'close' })
        return res.end()
      }
      handled = true
      // And the page tells the truth: it used to say "Signed in" before
      // anything had been checked, so cancelling at Google's screen still left
      // a tab congratulating you.
      const bad = err || !code || gotState !== state
      const line = bad
        ? 'Sign-in didn’t complete. You can close this tab and try again from Video Library.'
        : 'Signed in — you can close this tab.'
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', Connection: 'close' })
      res.end(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="icon" href="data:,">` +
          `<title>Video Library — ${bad ? 'sign-in cancelled' : 'signed in'}</title></head>` +
          `<body style="font-family:system-ui;background:#0c0c0c;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">` +
          `<div style="text-align:center"><h2>Video Library</h2><p>${line}</p></div></body></html>`
      )
      try {
        server.close()
      } catch {
        /* noop */
      }
      if (bad) return finish({ ok: false, error: 'Sign-in cancelled.' })
      try {
        const tr = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: id,
            client_secret: secret,
            redirect_uri: `http://127.0.0.1:${server.__port}`,
            grant_type: 'authorization_code'
          })
        })
        const t = await tr.json()
        if (!t.refresh_token) return finish({ ok: false, error: 'No refresh token — try again.' })
        store.settings.googleRefreshToken = t.refresh_token
        driveAccess = { token: t.access_token, expires: Date.now() + (t.expires_in || 3600) * 1000 }
        saveStore()
        const r = await driveSync()
        showWindow()
        finish({ ok: true, ...driveStatus(), merged: r.merged || null })
      } catch {
        finish({ ok: false, error: 'Sign-in failed.' })
      }
    })
    server.listen(0, '127.0.0.1', () => {
      server.__port = server.address().port
      shell.openExternal(
        'https://accounts.google.com/o/oauth2/v2/auth?' +
          new URLSearchParams({
            client_id: id,
            redirect_uri: `http://127.0.0.1:${server.__port}`,
            response_type: 'code',
            scope: GOOGLE_SCOPE,
            access_type: 'offline',
            prompt: 'consent',
            state
          }).toString()
      )
    })
    setTimeout(() => {
      try {
        server.close()
      } catch {
        /* noop */
      }
      finish({ ok: false, error: 'Sign-in timed out.' })
    }, 180000)
  })
}

async function driveFindFile(token) {
  const q = encodeURIComponent(`name='${DRIVE_FILE_NAME}'`)
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!res.ok) return null
  const d = await res.json()
  return d.files && d.files[0] ? d.files[0] : null
}
async function driveDownload(token, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) return null
  try {
    return await res.json()
  } catch {
    return null // a half-written or hand-edited file is not worth merging
  }
}
async function driveUpload(token, payload, fileId) {
  const body = JSON.stringify(payload)
  const type = 'application/json'
  // A remembered id can be stale — the file may have been cleared from Drive —
  // so a failed PATCH falls through to creating it again rather than giving up.
  if (fileId) {
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      { method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': type }, body }
    )
    if (res.ok) return fileId
  }
  const boundary = 'vl' + randomBytes(8).toString('hex')
  const meta = JSON.stringify({ name: DRIVE_FILE_NAME, parents: ['appDataFolder'] })
  const multipart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n` +
    `--${boundary}\r\nContent-Type: ${type}\r\n\r\n${body}\r\n--${boundary}--`
  const res = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: multipart
    }
  )
  if (!res.ok) return null
  const d = await res.json()
  return d.id || null
}

export const driveConnected = () => !!store.settings.googleRefreshToken

let driveSyncing = false
export async function driveSync() {
  if (driveSyncing) return { ok: false, error: 'Already syncing.' }
  driveSyncing = true
  try {
    const token = await googleAccessToken()
    if (!token) return { ok: false, error: 'Not connected.' }
    // Down first, then up: whatever the other PC watched is part of what we
    // back up, so one round trip leaves both sides holding the same library.
    const file = await driveFindFile(token)
    let merged = null
    if (file) {
      merged = mergeRemote(await driveDownload(token, file.id))
      store.settings.driveFileId = file.id
    }
    const payload = localPayload()
    const fid = await driveUpload(token, payload, file ? file.id : store.settings.driveFileId)
    if (!fid) return { ok: false, error: 'Upload failed.' }
    store.settings.driveFileId = fid
    store.settings.driveLastBackup = backupReceipt(payload)
    store.settings.driveLastSync = Date.now()
    saveStore()
    broadcast()
    return { ok: true, lastSync: store.settings.driveLastSync, merged }
  } catch {
    return { ok: false, error: 'Sync failed.' }
  } finally {
    driveSyncing = false
  }
}

function driveDisconnect() {
  // The Drive file is left alone on purpose: disconnecting is not deleting a
  // backup, and reconnecting should find it again.
  delete store.settings.googleRefreshToken
  delete store.settings.driveFileId
  delete store.settings.driveLastSync
  delete store.settings.driveLastBackup
  driveAccess = { token: null, expires: 0 }
  saveStore()
  return driveStatus()
}

// Debounced auto-backup — coalesces a burst of tracker ticks into one upload.
let driveSyncTimer = null
export function scheduleDriveSync(delay = 20000) {
  if (!store.settings.googleRefreshToken) return
  clearTimeout(driveSyncTimer)
  driveSyncTimer = setTimeout(() => driveSync(), delay)
}

export function registerDrive() {
  ipcMain.handle('drive:connect', () => connectDrive())
  ipcMain.handle('drive:sync', () => driveSync())
  ipcMain.handle('drive:disconnect', () => driveDisconnect())
  ipcMain.handle('drive:status', () => driveStatus())
}
