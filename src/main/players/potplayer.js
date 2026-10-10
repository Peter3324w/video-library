import { existsSync } from 'fs'
import { spawn } from 'child_process'

/* PotPlayer adapter.

   PotPlayer is closed-source freeware with no official API, but it answers
   Windows messages sent to its main window. Verified on 2026-09-23 against
   PotPlayerMini64 (see docs/PLAN.md):

     SendMessage(hwnd, WM_USER, 0x5006, 0) → -1 stopped · 1 paused · 2 playing
     SendMessage(hwnd, WM_USER, 0x5002, 0) → duration, ms
     SendMessage(hwnd, WM_USER, 0x5004, 0) → position, ms

   The call goes through koffi (a prebuilt FFI, no compiler) straight into
   user32 — no helper process sitting in memory while you watch. The file name
   comes from the window title, "<file> - PotPlayer". */

const WM_USER = 0x0400
const GET_STATUS = 0x5006
const GET_DURATION = 0x5002
const GET_POSITION = 0x5004
const WINDOW_CLASSES = ['PotPlayer64', 'PotPlayer']
const STATUS = { '-1': 'stopped', 1: 'paused', 2: 'playing' }

// Where the installer puts it. The user can point Settings elsewhere later.
export const DEFAULT_PATHS = [
  'C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe',
  'C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini.exe',
  'C:\\Program Files\\PotPlayer\\PotPlayerMini64.exe'
]

let user32 = null
function bind() {
  if (user32) return user32
  // Loaded on first use so a non-Windows dev box (or a broken koffi) never
  // takes the whole app down at import time.
  const koffi = require('koffi')
  const lib = koffi.load('user32.dll')
  user32 = {
    FindWindowW: lib.func('void* __stdcall FindWindowW(str16 cls, str16 title)'),
    SendMessageW: lib.func('intptr __stdcall SendMessageW(void* hwnd, uint32 msg, uintptr w, intptr l)'),
    GetWindowTextW: lib.func('int __stdcall GetWindowTextW(void* hwnd, _Out_ uint16_t* buf, int max)')
  }
  return user32
}

function findWindow(u) {
  for (const cls of WINDOW_CLASSES) {
    const h = u.FindWindowW(cls, null)
    if (h) return h
  }
  return null
}

function windowTitle(u, hwnd) {
  const buf = new Uint16Array(512)
  const n = u.GetWindowTextW(hwnd, buf, buf.length)
  return n > 0 ? String.fromCharCode(...buf.subarray(0, n)) : ''
}

/* One snapshot of what PotPlayer is doing, or null when it isn't open.
   `fileName` is null when the window is open with nothing loaded — its title
   is then just "PotPlayer". */
export function readPotPlayer() {
  let u
  try {
    u = bind()
  } catch {
    return null
  }
  const hwnd = findWindow(u)
  if (!hwnd) return null
  const ask = (code) => Number(u.SendMessageW(hwnd, WM_USER, code, 0))
  const title = windowTitle(u, hwnd)
  const m = title.match(/^(.*) - PotPlayer$/)
  return {
    status: STATUS[ask(GET_STATUS)] || 'stopped',
    positionMs: Math.max(0, ask(GET_POSITION)),
    durationMs: Math.max(0, ask(GET_DURATION)),
    fileName: m ? m[1] : null
  }
}

export function findPotPlayerExe(custom) {
  return [custom, ...DEFAULT_PATHS].find((p) => p && existsSync(p)) || null
}

/* Open a file, starting at `fromMs`. PotPlayer's own /seek switch takes
   hh:mm:ss. With PotPlayer's single-instance setting on (the default), this
   hands the file to the window already open rather than starting a second. */
export function launchPotPlayer(exe, file, fromMs = 0) {
  const args = [file]
  if (fromMs > 5000) {
    const s = Math.floor(fromMs / 1000)
    const pad = (n) => String(n).padStart(2, '0')
    args.push(`/seek=${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`)
  }
  const child = spawn(exe, args, { detached: true, stdio: 'ignore' })
  child.unref()
}
