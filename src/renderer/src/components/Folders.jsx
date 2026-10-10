import React, { useEffect, useState } from 'react'
import {
  FolderAdd as IcFolderAdd,
  Folder2 as IcFolder,
  Refresh as IcRefresh,
  Trash as IcTrash
} from 'iconsax-react'

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
            Where your movies and shows live. Subfolders are included. Scanned every time the app
            starts, so new downloads show up on their own.
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
          <button className="btn-primary" onClick={add} disabled={busy}>
            <IcFolderAdd size={16} color="currentColor" variant="Linear" /> Add folder
          </button>
          {folders.length > 0 && (
            <button className="btn-soft" onClick={() => run(() => api.rescan())} disabled={busy}>
              <IcRefresh size={16} color="currentColor" variant="Linear" /> Rescan
            </button>
          )}
          {msg && <span className="page-sub">{msg}</span>}
        </div>
      </div>
    </div>
  )
}
