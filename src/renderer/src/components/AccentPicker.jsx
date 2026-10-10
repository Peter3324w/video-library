import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Add as IcAdd, TickCircle as IcTick } from 'iconsax-react'
import {
  ACCENT_POPULAR,
  accentSwatch,
  applyAccent,
  hexToRgb,
  hsvToRgb,
  rgbToHex,
  rgbToHsv
} from '../lib/util'

const CHANNELS = [
  ['R', 0],
  ['G', 1],
  ['B', 2]
]

/* Accent picker — Windows' shape, because it is the right one: the colours you
   have actually used sit on top where a second click reaches them, and making a
   new one is a thing you go and do.

   Recents are the row. Nobody wants a palette of forty swatches; they want the
   four they keep going back to. Until there is any history the row is filled
   with four spread around the wheel, so it reads as "pick a colour" rather than
   as "here are four blues".

   The whole panel previews live on the real app behind it, which is the only
   way to judge an accent — a 40px preview square tells you nothing about what
   the sidebar's selected row is going to look like. Cancel puts back whatever
   was saved. */

const CLAMP = (n) => Math.max(0, Math.min(1, n))

// A pointer surface that reports where it was pressed or dragged, in 0..1.
// Capture matters: without it a fast drag off the edge of the square leaves the
// handle stuck wherever the pointer last happened to be inside it.
function useDragArea(onMove) {
  const ref = useRef(null)
  const emit = useCallback(
    (e) => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      onMove(CLAMP((e.clientX - r.left) / r.width), CLAMP((e.clientY - r.top) / r.height))
    },
    [onMove]
  )
  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    emit(e)
  }
  const onPointerMove = (e) => {
    if (e.buttons === 1) emit(e)
  }
  return { ref, onPointerDown, onPointerMove }
}

export function AccentPicker({ value, recents, onChange }) {
  const [open, setOpen] = useState(false)
  const [hsv, setHsv] = useState([210, 0.75, 0.95])
  const rgb = hsvToRgb(hsv[0], hsv[1], hsv[2]).map(Math.round)
  const hex = rgbToHex(rgb)
  /* What is being typed into HEX, while it is being typed. Bound straight to
     `hex`, every partial keystroke ("#", "#3b8") was thrown away because it
     didn't parse yet, so a colour could only ever be pasted. Null = show hex. */
  const [hexDraft, setHexDraft] = useState(null)

  // Typing in one channel rebuilds the whole colour, so the square and the
  // slider follow the number rather than the other way round.
  const setChannel = (i, raw) => {
    const n = Math.max(0, Math.min(255, parseInt(raw, 10)))
    if (!Number.isFinite(n)) return
    const next = [...rgb]
    next[i] = n
    setHsv(rgbToHsv(next))
  }

  // The row: what you have used, padded out to four so it never looks broken.
  const row = [...(recents || [])]
  for (const p of ACCENT_POPULAR) {
    if (row.length >= 4) break
    if (!row.includes(p)) row.push(p)
  }

  // Opening seeds the square from the accent that is on, so the first thing you
  // see is where you already are rather than an arbitrary blue.
  useEffect(() => {
    if (!open) return
    const rgb = hexToRgb(value || row[0])
    if (rgb) setHsv(rgbToHsv(rgb))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Live preview while the panel is open; the saved value goes back on close.
  useEffect(() => {
    if (open) applyAccent(hex)
  }, [open, hex])
  const close = () => {
    applyAccent(value || null)
    setOpen(false)
  }
  /* Leaving Settings mid-preview must not strand a colour nobody chose. The
     saved value rides a ref because the cleanup runs once, on unmount, and
     would otherwise close over whatever `value` was on the first render. */
  const savedRef = useRef(value)
  savedRef.current = value
  useEffect(() => () => applyAccent(savedRef.current || null), [])

  /* Applying is this component's job, not the caller's. It was left to
     onChange, and the settings row only PERSISTED — so a swatch click saved
     the colour, moved the tick and changed nothing on screen, which reads as a
     dead button. Save looked fine only because the live preview had already
     painted that colour and nothing reverted it on the way out.

     Closing the panel is part of the same beat: otherwise the preview keeps
     painting the draft over the colour just chosen. */
  const pick = (c) => {
    setOpen(false)
    applyAccent(c)
    onChange(c)
  }

  const sv = useDragArea((x, y) => setHsv(([h]) => [h, x, 1 - y]))
  const hue = useDragArea((x) => setHsv(([, s, v]) => [x * 360, s, v]))

  return (
    <div className="accent-picker">
      <div className="accent-row">
        <button
          className={`accent-chip accent-auto ${!value ? 'on' : ''}`}
          onClick={() => pick(null)}
          title="Use the theme's own accent"
        >
          Auto
        </button>
        {row.map((c) => (
          <button
            key={c}
            className={`accent-chip ${value === c ? 'on' : ''}`}
            style={{ background: accentSwatch(c) }}
            onClick={() => pick(c)}
            title={c}
          >
            {value === c && <IcTick size={13} color="currentColor" variant="Bold" />}
          </button>
        ))}
        {/* Spelled out, not a bare "+". Windows calls this button "Custom
            color" and it is right to: a person hunting for a colour that isn't
            in the row is looking for words, and a 26px plus in a line of
            swatches reads as "one more swatch".

            The wheel does the other half. A plus means "add one more of these";
            a rainbow means "any colour you like", which is the actual offer,
            and it reads at a glance in a row where everything else is a single
            flat hue. The plus stays, tucked into the middle of it. */}
        <button
          className={`accent-custom ${open ? 'on' : ''}`}
          onClick={() => (open ? close() : setOpen(true))}
          aria-expanded={open}
        >
          <span className="accent-wheel">
            <IcAdd size={11} color="currentColor" variant="Linear" />
          </span>
          Custom colour
        </button>
      </div>

      {open && (
        <div className="accent-panel">
          <div
            className="accent-sv"
            ref={sv.ref}
            onPointerDown={sv.onPointerDown}
            onPointerMove={sv.onPointerMove}
            style={{ '--hue': `hsl(${hsv[0]} 100% 50%)` }}
          >
            <span
              className="accent-dot"
              style={{ left: `${hsv[1] * 100}%`, top: `${(1 - hsv[2]) * 100}%` }}
            />
          </div>
          <div
            className="accent-hue"
            ref={hue.ref}
            onPointerDown={hue.onPointerDown}
            onPointerMove={hue.onPointerMove}
          >
            <span className="accent-dot" style={{ left: `${(hsv[0] / 360) * 100}%` }} />
          </div>
          {/* Hex and RGB both, because people arrive with one or the other:
              a hex off a brand page, or a red they want two points warmer. */}
          <div className="accent-fields">
            <span className="accent-preview" style={{ background: accentSwatch(hex) }} />
            <label className="accent-field accent-field-hex">
              <span>HEX</span>
              <input
                value={hexDraft != null ? hexDraft : hex}
                spellCheck={false}
                onChange={(e) => {
                  setHexDraft(e.target.value)
                  const parsed = hexToRgb(e.target.value)
                  if (parsed) setHsv(rgbToHsv(parsed))
                }}
                onBlur={() => setHexDraft(null)}
              />
            </label>
            {CHANNELS.map(([label, i]) => (
              <label className="accent-field" key={label}>
                <span>{label}</span>
                <input
                  type="number"
                  min="0"
                  max="255"
                  value={rgb[i]}
                  onChange={(e) => setChannel(i, e.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="accent-foot">
            <button className="btn-soft" onClick={close}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => pick(hex)}>
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
