import React, { useEffect, useRef, useState } from 'react'
import {
  User as IcUser,
  Refresh as IcRefresh,
  Setting2 as IcSettings,
  LogoutCurve as IcSignOut,
  CloseCircle as IcClose,
  Eye as IcEye,
  EyeSlash as IcEyeOff
} from 'iconsax-react'
import { formatTime, initials, relativeDay } from '../lib/util'
import { ConfirmDialog } from './common'

/* Accounts, web build only (src/web/cloud.js). An account is optional: the
   library works without one, and signing in adds a synced copy of the records
   so another browser can pick them up. Three pieces share one source of truth,
   the bridge's `account.status()`:
     AuthDialog       log in, sign up, reset a password
     SidebarAccount   the entry in the sidebar footer
     AccountCard      Settings › Account and sync */

const account = () => window.api.account

export function useAccount() {
  const [status, setStatus] = useState(() => account().status())
  useEffect(() => {
    setStatus(account().status())
    return account().onChange(setStatus)
  }, [])
  return status
}

// Anything can ask for the dialog; the one mounted in App answers.
export const openAuth = (mode = 'login') => window.dispatchEvent(new CustomEvent('vl-auth', { detail: mode }))

const MIN_PASSWORD = 8

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

const TITLES = {
  login: 'Log in',
  signup: 'Create your account',
  forgot: 'Reset your password',
  newpass: 'Choose a new password',
  sent: 'Check your email'
}

export function AuthDialog() {
  const status = useAccount()
  const [mode, setMode] = useState(null) // null = closed
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState('') // what the "check your email" page says
  const first = useRef(null)

  const open = (m) => {
    setMode(m)
    setError('')
    setPassword('')
    setShow(false)
  }
  const close = () => {
    if (mode === 'newpass') account().dismissRecovery()
    setMode(null)
  }
  useEffect(() => {
    const onOpen = (e) => open(e.detail || 'login')
    window.addEventListener('vl-auth', onOpen)
    return () => window.removeEventListener('vl-auth', onOpen)
  }, [])
  // Arriving from a reset email: the link signed them in, the dialog finishes the job.
  useEffect(() => {
    if (status.recovery) open('newpass')
  }, [status.recovery])
  useEffect(() => {
    if (!mode) return
    first.current?.focus()
    const onKey = (e) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  if (!mode) return null

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setError('')
    if ((mode === 'signup' || mode === 'newpass') && password.length < MIN_PASSWORD)
      return setError(`Use at least ${MIN_PASSWORD} characters for the password.`)
    setBusy(true)
    try {
      const a = account()
      const r =
        mode === 'login'
          ? await a.signIn(email.trim(), password)
          : mode === 'signup'
            ? await a.signUp(email.trim(), password)
            : mode === 'forgot'
              ? await a.requestPasswordReset(email.trim())
              : await a.setPassword(password)
      if (!r.ok) return setError(r.error)
      if (mode === 'signup' && r.confirm) {
        setSent(`We sent a link to ${email.trim()}. Open it to finish creating your account, then come back here.`)
        return setMode('sent')
      }
      if (mode === 'forgot') {
        setSent(`If ${email.trim()} has an account, a link to reset its password is on the way.`)
        return setMode('sent')
      }
      setMode(null)
    } finally {
      setBusy(false)
    }
  }
  const google = async () => {
    setError('')
    const r = await account().signInWithGoogle()
    if (!r.ok) setError(r.error)
  }

  const entering = mode === 'login' || mode === 'signup'
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal vl-auth" role="dialog" aria-modal="true" aria-label={TITLES[mode]} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{TITLES[mode]}</h3>
          <button className="modal-close" onClick={close} aria-label="Close">
            <IcClose size={16} color="currentColor" variant="Linear" />
          </button>
        </div>

        {mode === 'sent' ? (
          <div className="vl-auth-body">
            <p className="page-sub">{sent}</p>
            <button className="btn-primary vl-auth-submit" onClick={() => open('login')}>
              Back to log in
            </button>
          </div>
        ) : (
          <form className="vl-auth-body" onSubmit={submit}>
            {entering && (
              <div className="vl-auth-tabs">
                <button type="button" className={`modal-tab ${mode === 'login' ? 'on' : ''}`} onClick={() => open('login')}>
                  Log in
                </button>
                <button type="button" className={`modal-tab ${mode === 'signup' ? 'on' : ''}`} onClick={() => open('signup')}>
                  Sign up
                </button>
              </div>
            )}
            <p className="page-sub">
              {mode === 'login' && 'Your history, where you stopped and your favourites, on any browser you sign in on.'}
              {mode === 'signup' &&
                'An account keeps a copy of what you’ve watched and where you stopped, so another browser can pick it up. Your video files stay on this computer.'}
              {mode === 'forgot' && 'Enter the email you signed up with and we’ll send a link to choose a new password.'}
              {mode === 'newpass' && `Signed in as ${status.email || 'you'}. Pick the password you’ll use from now on.`}
            </p>

            {mode !== 'newpass' && (
              <label className="vl-auth-field">
                <span>Email</span>
                <input
                  ref={first}
                  className="key-input"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            )}
            {mode !== 'forgot' && (
              <label className="vl-auth-field">
                <span>{mode === 'newpass' ? 'New password' : 'Password'}</span>
                <span className="pw-field">
                  <input
                    ref={mode === 'newpass' ? first : undefined}
                    className="key-input"
                    type={show ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'login' ? 'Your password' : `At least ${MIN_PASSWORD} characters`}
                  />
                  <button
                    type="button"
                    className="pw-eye"
                    onClick={() => setShow((s) => !s)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                  >
                    {show ? (
                      <IcEyeOff size={16} color="currentColor" variant="Linear" />
                    ) : (
                      <IcEye size={16} color="currentColor" variant="Linear" />
                    )}
                  </button>
                </span>
              </label>
            )}

            {error && <div className="key-status bad">{error}</div>}

            <button className="btn-primary vl-auth-submit" type="submit" disabled={busy}>
              {busy
                ? 'One moment…'
                : mode === 'login'
                  ? 'Log in'
                  : mode === 'signup'
                    ? 'Create account'
                    : mode === 'forgot'
                      ? 'Send reset link'
                      : 'Save password'}
            </button>

            {entering && status.google && (
              <>
                <div className="vl-auth-or">
                  <span>or</span>
                </div>
                <button type="button" className="btn-soft vl-auth-submit" onClick={google} disabled={busy}>
                  <GoogleMark /> Continue with Google
                </button>
              </>
            )}

            {mode === 'login' && (
              <button type="button" className="home-link vl-auth-link" onClick={() => open('forgot')}>
                Forgot your password?
              </button>
            )}
            {mode === 'forgot' && (
              <button type="button" className="home-link vl-auth-link" onClick={() => open('login')}>
                Back to log in
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  )
}

// A round picture, or the first letters when there isn't one.
function Avatar({ status, size = 22 }) {
  const label = status.name || status.email || '?'
  return status.avatar ? (
    <img className="vl-avatar" src={status.avatar} alt="" width={size} height={size} referrerPolicy="no-referrer" />
  ) : (
    <span className="vl-avatar" style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initials(label.replace(/@.*/, '').replace(/[._-]+/g, ' ')).slice(0, 2)}
    </span>
  )
}

// "Nothing new" is worth saying out loud — silence after a sync reads as a failure.
function syncLine(r) {
  const m = r && r.merged
  if (!m) return 'Synced.'
  const bits = []
  if (m.titles) bits.push(`${m.titles} title${m.titles === 1 ? '' : 's'}`)
  if (m.files) bits.push(`${m.files} episode${m.files === 1 ? '' : 's'} from another browser`)
  if (m.folded) bits.push(`${m.folded} position${m.folded === 1 ? '' : 's'} updated`)
  if (m.history) bits.push(`${m.history} watch${m.history === 1 ? '' : 'es'}`)
  return bits.length ? `Synced · brought in ${bits.join(', ')}.` : 'Synced · nothing new.'
}

/* The sidebar footer's account entry, above Theme. Signed out it is "Sign in";
   signed in it is you, opening a small menu upward like Theme's does. */
export function SidebarAccount({ collapsed, openSettings }) {
  const status = useAccount()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])
  if (!status.available) return null

  if (!status.signedIn)
    return (
      <button className="nav-item nav-account" onClick={() => openAuth('login')} title={collapsed ? 'Sign in' : undefined}>
        <IcUser size={18} color="currentColor" variant="Linear" className="nav-icon" />
        <span className="nav-label">Sign in</span>
      </button>
    )

  const name = status.name || status.email
  return (
    <div className={`nav-theme-wrap ${open ? 'open' : ''}`} ref={ref}>
      <button
        className={`nav-item nav-account ${open ? 'active' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title={collapsed ? name : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar status={status} />
        <span className="nav-label vl-account-name">{name}</span>
      </button>
      {open && (
        <div className="acct-pop">
          <div className="vl-account-head">
            <div className="vl-account-email">{status.email}</div>
            <div className="vl-account-sub">
              {status.syncing ? 'Syncing…' : status.lastSync ? `Synced ${relativeDay(status.lastSync).toLowerCase()}` : 'Not synced yet'}
            </div>
          </div>
          <div className="theme-pop-sep" />
          <button
            className="acct-opt"
            disabled={status.syncing}
            onClick={() => {
              setOpen(false)
              account().sync()
            }}
          >
            <IcRefresh size={16} color="currentColor" variant="Linear" /> Sync now
          </button>
          <button
            className="acct-opt"
            onClick={() => {
              setOpen(false)
              openSettings()
            }}
          >
            <IcSettings size={16} color="currentColor" variant="Linear" /> Account settings
          </button>
          <button
            className="acct-opt danger"
            onClick={() => {
              setOpen(false)
              account().signOut()
            }}
          >
            <IcSignOut size={16} color="currentColor" variant="Linear" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

/* Settings › Account and sync. Plain about what an account carries and what
   it doesn't, as the desktop's Drive card is: the files stay where they are. */
export function AccountCard() {
  const status = useAccount()
  const [msg, setMsg] = useState('')
  const [bad, setBad] = useState(false)
  const [confirming, setConfirming] = useState(false)
  if (!status.available) return null

  const sync = async () => {
    setBad(false)
    setMsg('Syncing…')
    const r = await account().sync()
    setBad(!r.ok)
    setMsg(r.ok ? syncLine(r) : r.error)
  }
  const b = status.lastBackup
  return (
    <div className="settings-card">
      <h3>{status.signedIn ? 'Your account' : 'Account'}</h3>
      {status.signedIn ? (
        <div className="vl-account-row">
          <Avatar status={status} size={36} />
          <div>
            {status.name && <div className="setting-title">{status.name}</div>}
            <div className="page-sub">{status.email}</div>
          </div>
        </div>
      ) : null}
      <p className="page-sub">
        {status.signedIn
          ? 'What you’ve watched, where you stopped, your history and your favourites are kept with your account. Sign in on another browser and they are there too; whichever one watched an episode last decides where it resumes.'
          : 'The library works without an account. Signing in keeps a copy of what you’ve watched, where you stopped, your history and your favourites, so another browser you sign in on picks them up.'}
      </p>
      <p className="page-sub">
        Your folders and video files stay on this computer. Nothing about your files is uploaded, only
        the fact that you watched them.
      </p>
      <div className="key-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        {status.signedIn ? (
          <>
            <button className="btn-soft" onClick={sync} disabled={status.syncing}>
              <IcRefresh size={16} color="currentColor" variant="Linear" className={status.syncing ? 'vl-spin' : ''} /> Sync now
            </button>
            <button className="btn-soft" onClick={() => account().signOut()}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <button className="btn-primary" onClick={() => openAuth('login')}>
              Log in
            </button>
            <button className="btn-soft" onClick={() => openAuth('signup')}>
              Create an account
            </button>
          </>
        )}
      </div>
      {status.signedIn && status.lastSync ? (
        <div className="key-status">Last synced {relativeDay(status.lastSync).toLowerCase()}.</div>
      ) : null}
      {/* Counted as it went up, not re-counted from the library now. */}
      {status.signedIn && b ? (
        <p className="page-sub">
          With your account: <strong>{b.titles}</strong> title{b.titles === 1 ? '' : 's'} ·{' '}
          <strong>{b.watched}</strong> finished · {b.history} watch{b.history === 1 ? '' : 'es'}
          {b.seconds ? ` · ${formatTime(b.seconds)} watched` : ''}.
        </p>
      ) : null}
      {msg ? <div className={bad ? 'key-status bad' : 'key-status'}>{msg}</div> : null}
      {status.signedIn && (
        <button className="home-link vl-account-delete" onClick={() => setConfirming(true)}>
          Delete the copy kept with my account
        </button>
      )}
      {confirming && (
        <ConfirmDialog
          title="Delete your synced copy?"
          body="This removes what is kept with your account and signs you out. The library in this browser stays exactly as it is."
          confirmLabel="Delete and sign out"
          danger
          onClose={() => setConfirming(false)}
          onConfirm={async () => {
            setConfirming(false)
            const r = await account().deleteCloudCopy()
            setBad(!r.ok)
            setMsg(r.ok ? 'Deleted. You’re signed out.' : r.error)
          }}
        />
      )}
    </div>
  )
}
