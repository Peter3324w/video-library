import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowDown2 as IcChevronDown,
  TickCircle as IcCheck,
  Add as IcAdd,
  FolderOpen as IcFolder,
  VideoPlay as IcVideo
} from 'iconsax-react'
import { artUrl } from '../lib/util'

// Shared listbox dropdown used by Library / Stats / Milestones filters.
export function Dropdown({ value, options, onChange, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const current = options.find((o) => o.value === value)
  return (
    <div className={`dd ${open ? 'open' : ''}`} ref={ref}>
      <button className="dd-trigger" onClick={() => setOpen((o) => !o)} aria-label={ariaLabel}>
        <span>{current ? current.label : ''}</span>
        <IcChevronDown size={15} color="currentColor" variant="Linear" className="dd-chevron" />
      </button>
      {open && (
        <div className="dd-pop">
          {options.map((o) => (
            <button
              key={o.value}
              className={`dd-opt ${o.value === value ? 'sel' : ''}`}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
            >
              {o.label}
              {o.value === value && (
                <IcCheck size={15} color="currentColor" variant="Bold" className="dd-check" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// App tile/logo mark — "Stack": posters fanned like a shelf you flick
// through. The same drawing as build/icon.svg, which the .exe icon comes from.
export function AppMark({ size = 42 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true">
      <defs>
        <linearGradient id="amTile" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0" stopColor="#232323" />
          <stop offset="1" stopColor="#060606" />
        </linearGradient>
      </defs>
      <rect width="256" height="256" rx="56" fill="url(#amTile)" />
      <rect x="6" y="6" width="244" height="118" rx="50" fill="rgba(255,255,255,.05)" />
      <rect x="1.5" y="1.5" width="253" height="253" rx="54.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="1.5" />
      <rect x="52" y="62" width="96" height="134" rx="14" fill="rgba(255,255,255,.22)" transform="rotate(-10 100 129)" />
      <rect x="76" y="58" width="96" height="134" rx="14" fill="rgba(255,255,255,.48)" transform="rotate(-3 124 125)" />
      <g transform="rotate(5 152 127)">
        <rect x="104" y="60" width="96" height="134" rx="14" fill="#fff" />
        <path d="M138.04 109 L170.44 127 L138.04 145 Z" fill="#0a0a0a" stroke="#0a0a0a" strokeWidth="5.04" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

// Blurred cover backdrop that cross-fades when the image changes.
export function BleedBg({ img, className }) {
  const [layers, setLayers] = useState(img ? [{ id: 1, img }] : [])
  const last = useRef(img)
  const counter = useRef(1)
  useEffect(() => {
    if (img === last.current) return
    last.current = img
    counter.current += 1
    setLayers((ls) => [...ls, { id: counter.current, img }].slice(-2))
  }, [img])
  return (
    <div className={`bleed ${className}`}>
      {layers.map((l) => (
        <div
          key={l.id}
          className="bleed-layer"
          style={{ backgroundImage: l.img ? `url("${artUrl(l.img)}")` : 'none' }}
        />
      ))}
    </div>
  )
}

// Add menu: scan a folder, or pick video files.
export function AddMenu({ onAddFile, onScan, label = 'Add' }) {
  const [open, setOpen] = useState(false)
  const [up, setUp] = useState(false)
  const ref = useRef(null)
  const popRef = useRef(null)
  // The menu opens downward by default, but the Add button sits partway down a
  // scrolling column — with three items the panel ran off the bottom and the
  // last one was simply unreachable. Measure before paint and flip above the
  // button when there isn't room below, but only if there's room above:
  // otherwise downward-and-clipped still beats upward-and-clipped, because the
  // first item stays visible.
  useLayoutEffect(() => {
    if (!open) return
    const btn = ref.current
    const pop = popRef.current
    if (!btn || !pop) return
    const r = btn.getBoundingClientRect()
    const h = pop.offsetHeight
    const GAP = 8
    const EDGE = 12 // never sit flush against the window edge
    const fitsBelow = r.bottom + GAP + h <= window.innerHeight - EDGE
    const fitsAbove = r.top - GAP - h >= EDGE
    setUp(!fitsBelow && fitsAbove)
  }, [open])
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const pick = (fn) => () => {
    setOpen(false)
    fn()
  }
  return (
    <div className="addmenu" ref={ref}>
      <button className="btn-primary" onClick={() => setOpen((o) => !o)}>
        <IcAdd size={18} color="currentColor" variant="Linear" /> {label}
      </button>
      {open && (
        <div className={`addmenu-pop ${up ? 'up' : ''}`} ref={popRef}>
          <button className="addmenu-item" onClick={pick(onAddFile)}>
            <span className="addmenu-ic">
              <IcVideo size={20} color="currentColor" variant="Linear" />
            </span>
            <span className="addmenu-tx">
              <span className="addmenu-t">Add file</span>
              <span className="addmenu-d">Pick one or more movies or episodes.</span>
            </span>
          </button>
          <button className="addmenu-item" onClick={pick(onScan)}>
            <span className="addmenu-ic">
              <IcFolder size={20} color="currentColor" variant="Linear" />
            </span>
            <span className="addmenu-tx">
              <span className="addmenu-t">Choose directory</span>
              <span className="addmenu-d">
                Scan a folder and its subfolders for movies and shows — rescanned every launch,
                so new downloads show up on their own.
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  )
}

// One card-shaped confirm for destructive actions.
//
// window.confirm() draws the OS alert: Windows chrome, Windows fonts and a
// Windows title bar in the middle of a frameless black app.
// It also blocks the renderer for as long as it is up. This is the same panel
// language as everything else, and it is a component rather than a
// promise-returning confirm() helper because either way something has to
// render — a helper would only hide where.
export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onClose
}) {
  const confirmRef = useRef(null)
  useEffect(() => {
    // Focus the confirming button so Enter commits and Tab stays in the card.
    confirmRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="confirm-pop"
        role="alertdialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-title">{title}</div>
        {body ? <p>{body}</p> : null}
        <div className="confirm-actions">
          <button className="btn-soft" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

/* Cover art and episode stills, drawn over the placeholder the parent already
   paints (gradient + initials). Hidden until it has actually loaded, so a slow
   image is the placeholder rather than a black box, and a failed one never
   shows Chromium's broken-image icon. Art comes from two CDNs (metahub, which
   redirects stills on to TMDB) over a connection that drops some of their
   addresses, so a failure is retried twice before giving up. An unaired
   episode's still is a real 404 — that one just stays the placeholder.
   Everything loads through the disk cache (artUrl), so this only ever
   matters the first time a picture is seen. */
const ART_RETRIES = 2
export function Art({ src, alt = '', className = '' }) {
  const [tries, setTries] = useState(0)
  const [state, setState] = useState('loading') // loading | loaded | failed
  useEffect(() => {
    setTries(0)
    setState('loading')
  }, [src])
  useEffect(() => {
    if (state !== 'retry') return
    const t = setTimeout(() => {
      setTries((n) => n + 1)
      setState('loading')
    }, 1500 * (tries + 1))
    return () => clearTimeout(t)
  }, [state, tries])
  if (!src || state === 'failed' || state === 'retry') return null
  // A fresh query string makes the retry a real request, not the cached error.
  // (The cache keys on `u` alone, so `r` never changes which file is saved.)
  const base = artUrl(src)
  const url = tries ? `${base}${base.includes('?') ? '&' : '?'}r=${tries}` : base
  return (
    <img
      key={url}
      src={url}
      alt={alt}
      loading="lazy"
      className={`vl-art ${state === 'loaded' ? 'loaded' : ''} ${className}`}
      onLoad={() => setState('loaded')}
      onError={() => setState(tries < ART_RETRIES ? 'retry' : 'failed')}
    />
  )
}
