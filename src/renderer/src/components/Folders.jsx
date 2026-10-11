import React, { useEffect, useState } from 'react'
import {
  FolderAdd as IcFolderAdd,
  Folder2 as IcFolder,
  Refresh as IcRefresh,
  Trash as IcTrash
} from 'iconsax-react'

import { WEB } from '../lib/platform'

const api = window.api

// "Found 106 videos · 2 new · 3 gone", leaving out whatever is zero.
const scanMsg = (r) =>
  r
    ? [
        `Found ${r.found} video${r.found === 1 ? '' : 's'}`,
        r.added && `${r.added} new`,
        r.back && `${r.back} back`,
        r.gone && `${r.gone} gone`
      ]
        .filter(Boolean)
        .join(' · ')
    : ''

/* Rescan with its answer beside it. The library already rescans on every
   launch; this is for the file you just downloaded or deleted. The result
   fades after a few seconds, since it's only true for a moment. */
export function RescanButton() {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    if (!msg || busy) return
    const t = setTimeout(() => setMsg(''), 6000)
    return () => clearTimeout(t)
  }, [msg, busy])
  return (
    <>
      {msg && <span className="page-sub vl-scan-msg">{msg}</span>}
      <button
        className="btn-soft"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          setMsg('Scanning…')
          try {
            setMsg(scanMsg(await api.rescan()))
          } catch {
            setMsg('Couldn’t scan — try again')
          } finally {
            setBusy(false)
          }
        }}
      >
        <IcRefresh size={16} color="currentColor" variant="Linear" className={busy ? 'vl-spin' : ''} />{' '}
        {busy ? 'Scanning…' : 'Rescan'}
      </button>
    </>
  )
}

// "Add a folder" — used on the empty screens, where it is the whole next step.
export function AddFolderButton({ label = 'Add a folder' }) {
  const [busy, setBusy] = useState(false)
  if (WEB && !api.canAddFolder) return null // a phone browser can't hand over a folder
  return (
    <button
      className="btn-primary"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await api.addFolder()
        } finally {
          setBusy(false)
        }
      }}
    >
      <IcFolderAdd size={18} color="currentColor" variant="Linear" /> {busy ? 'Scanning…' : label}
    </button>
  )
}

// Settings › Library folders: the list, add, remove, rescan.
export function FoldersCard() {
  const [folders, setFolders] = useState([])
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.getFolders().then((f) => setFolders(f || []))
  }, [])
  // Web: the demo library is listed as a folder, and can be brought back.
  const hasDemo = folders.includes('Demo library')
  const run = async (fn) => {
    setBusy(true)
    setMsg('Scanning…')
    try {
      const r = await fn()
      setMsg(scanMsg(r))
    } finally {
      setBusy(false)
    }
  }
  const add = () =>
    run(async () => {
      const r = await api.addFolder()
      setFolders(r.folders || [])
      return r.scan
    })
  return (
    <div className="settings-card">
      <div className="setting-row stack">
        <div>
          <div className="setting-title">Library folders</div>
          <div className="page-sub">
            {!WEB
              ? 'Where your movies and shows live. Subfolders are included. Scanned every time the app starts, so new downloads show up on their own.'
              : !api.canAddFolder
                ? 'This browser can’t open a folder, so the library here is the demo one. On a computer you can add your own.'
                : api.keepsFolders
                  ? 'Add a folder of movies or shows from this computer. Nothing is uploaded: the files are read and played right here in the browser. Subfolders are included.'
                  : 'Add a folder of movies or shows from this computer. Nothing is uploaded: the files are read and played right here in the browser. This browser forgets the folder when the tab closes, so it is picked again next visit; Chrome and Edge remember it.'}
          </div>
        </div>
        {folders.length > 0 && (
          <div className="vl-folders">
            {folders.map((p) => (
              <div className="vl-folder" key={p}>
                <IcFolder size={16} color="currentColor" variant="Linear" />
                <span className="vl-folder-path" title={p}>
                  {p}
                </span>
                <button
                  className="vl-folder-remove"
                  title="Remove from library"
                  aria-label={`Remove ${p}`}
                  onClick={async () => setFolders(await api.removeFolder(p))}
                >
                  <IcTrash size={15} color="currentColor" variant="Linear" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="vl-folder-actions">
          {(!WEB || api.canAddFolder) && (
            <button className="btn-primary" onClick={add} disabled={busy}>
              <IcFolderAdd size={16} color="currentColor" variant="Linear" /> Add folder
            </button>
          )}
          {folders.length > 0 && (
            <button className="btn-soft" onClick={() => run(() => api.rescan())} disabled={busy}>
              <IcRefresh size={16} color="currentColor" variant="Linear" /> Rescan
            </button>
          )}
          {WEB && !hasDemo && (
            <button className="btn-soft" onClick={async () => setFolders(await api.restoreDemo())} disabled={busy}>
              Bring back the demo library
            </button>
          )}
          {msg && <span className="page-sub">{msg}</span>}
        </div>
      </div>
    </div>
  )
}

/* Web only. Folders added on an earlier visit come back unreadable: the
   browser wants a click before it hands them over again. Until then their
   titles sit on the "Not on this PC" shelf, so this says why and fixes it. */
export function ReconnectBar({ library }) {
  const [names, setNames] = useState([])
  const [busy, setBusy] = useState(false)
  // Asked again whenever the library changes: a scan is what changes the answer.
  useEffect(() => {
    let alive = true
    api.foldersNeedingAccess().then((n) => alive && setNames(n || []))
    return () => {
      alive = false
    }
  }, [library])
  if (!names.length) return null
  return (
    <div className="vl-reconnect">
      <IcFolder size={18} color="currentColor" variant="Linear" />
      <span className="vl-reconnect-text">
        {names.length === 1 ? (
          <>
            Your folder <b>{names[0]}</b> needs reconnecting.
          </>
        ) : (
          <>
            <b>{names.length} of your folders</b> need reconnecting.
          </>
        )}{' '}
        A browser asks again each visit before a page can read your files.
      </span>
      <button
        className="btn-primary sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await api.reconnectFolders()
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Reconnecting…' : 'Reconnect'}
      </button>
    </div>
  )
}
