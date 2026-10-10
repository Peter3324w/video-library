import React, { useEffect, useState } from 'react'
import { CloudPlus as IcCloudPlus, Refresh as IcRefresh } from 'iconsax-react'
import { formatTime, relativeDay } from '../lib/util'

const api = window.api

/* Settings › Back up and sync. Deliberately plain about what it carries and
   what it doesn't: library folders are absolute paths, so they stay on the PC
   that owns them, and a card that implied otherwise would have you wondering
   why the other machine scans nothing. */
export function BackupCard() {
  const [drive, setDrive] = useState({ connected: false, hasCreds: false })
  const [msg, setMsg] = useState('')
  const [bad, setBad] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.drive.status().then(setDrive)
  }, [])

  const run = async (fn, working) => {
    setBusy(true)
    setBad(false)
    setMsg(working)
    try {
      const r = await fn()
      if (r && r.ok === false) {
        setBad(true)
        setMsg(r.error || 'Something went wrong.')
      } else {
        setMsg(mergedLine(r))
      }
    } finally {
      setDrive(await api.drive.status())
      setBusy(false)
    }
  }
  const connect = () => run(() => api.drive.connect(), 'Waiting for Google in your browser…')
  const sync = () => run(() => api.drive.sync(), 'Syncing…')
  const disconnect = async () => {
    setDrive(await api.drive.disconnect())
    setMsg('Disconnected. Your backup is still in Drive.')
    setBad(false)
  }

  const b = drive.lastBackup
  return (
    <div className="settings-card">
      <h3>Google Drive</h3>
      <p className="page-sub">
        What you&apos;ve watched, where you stopped, your history and your favourites — backed up to
        your <strong>own</strong> Google Drive, in a private app folder only Video Library can see.
        If you use a second PC, whichever one watched an episode last is the one that decides where
        it resumes.
      </p>
      <p className="page-sub">
        Library folders stay on this PC. They&apos;re paths on this drive, so the other machine keeps
        its own — nothing about your files leaves here, only the fact that you watched them.
      </p>
      <div className="key-row" style={{ marginTop: 12 }}>
        {drive.connected ? (
          <>
            <button className="btn-soft" onClick={sync} disabled={busy}>
              <IcRefresh size={16} color="currentColor" variant="Linear" /> Sync now
            </button>
            <button className="btn-soft" onClick={disconnect} disabled={busy}>
              Disconnect
            </button>
          </>
        ) : (
          <button className="btn-primary" onClick={connect} disabled={!drive.hasCreds || busy}>
            <IcCloudPlus size={16} color="currentColor" variant="Linear" /> Connect Google Drive
          </button>
        )}
      </div>
      {!drive.hasCreds ? (
        <div className="key-status bad">Drive backup isn’t configured in this build yet.</div>
      ) : null}
      {drive.connected && drive.lastSync ? (
        <div className="key-status">Connected · last synced {relativeDay(drive.lastSync)}.</div>
      ) : null}
      {/* Counted as it went up, not re-counted from the library now — a summary
          that quietly describes the CURRENT library reassures you about a file
          it never read. */}
      {drive.connected && b ? (
        <p className="page-sub">
          In your backup: <strong>{b.titles}</strong> title{b.titles === 1 ? '' : 's'} ·{' '}
          <strong>{b.watched}</strong> finished · {b.history} watch
          {b.history === 1 ? '' : 'es'}
          {b.seconds ? ` · ${formatTime(b.seconds)} watched` : ''}.
        </p>
      ) : null}
      {msg ? <div className={bad ? 'key-status bad' : 'key-status'}>{msg}</div> : null}
    </div>
  )
}

// "Nothing new" is worth saying out loud — silence after a sync reads as a failure.
function mergedLine(r) {
  const m = r && r.merged
  if (!m) return 'Backed up.'
  const bits = []
  if (m.titles) bits.push(`${m.titles} title${m.titles === 1 ? '' : 's'}`)
  if (m.files) bits.push(`${m.files} episode${m.files === 1 ? '' : 's'} from another PC`)
  if (m.folded) bits.push(`${m.folded} position${m.folded === 1 ? '' : 's'} updated`)
  if (m.history) bits.push(`${m.history} watch${m.history === 1 ? '' : 'es'}`)
  return bits.length ? `Backed up · brought in ${bits.join(', ')}.` : 'Backed up · nothing new.'
}
