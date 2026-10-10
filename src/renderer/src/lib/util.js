// Shared pure helpers used across multiple views.

export function formatTime(totalSeconds) {
  const s = Math.floor(totalSeconds || 0)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  // Under a minute is still watched. A 40-second peek read "Not
  // watched yet" beside "Today".
  if (h === 0 && m === 0) return s > 0 ? '<1m' : 'Not watched yet'
  if (h === 0) return `${m}m`
  return `${h}h ${m}m`
}



export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return `${h}:${pad(m)}:${pad(sec)}`
}

/* Calendar days, not 24-hour gaps. Counted in gaps, a game played at 23:30
   read "Today" at nine the next morning. Rounded, because a day across a
   daylight-saving change is 23 or 25 hours long. */
/* Art goes through main's disk cache (src/main/artcache.js): downloaded once,
   then served from disk forever after, whatever the connection is doing. */
export const artUrl = (src) =>
  src && /^https?:\/\//i.test(src) ? `vlart://art/?u=${encodeURIComponent(src)}` : src

export function relativeDay(ts) {
  if (!ts) return 'Never'
  const midnight = (t) => new Date(t).setHours(0, 0, 0, 0)
  const days = Math.round((midnight(Date.now()) - midnight(ts)) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

export function initials(name) {
  return (name || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}


export function coverGradient(name) {
  let h = 0
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return {
    background: `linear-gradient(135deg, hsl(${h}, 55%, 32%), hsl(${(h + 40) % 360}, 50%, 18%))`
  }
}






/* ---------------- Themes ----------------
   The whole feature, from the renderer's side: a data-theme attribute on <html>
   that the token blocks at the top of 00-base.css key off. Nothing else in the
   app needs to know which theme is on, which is the point — a component that
   asks would be a component that can get it wrong.

   `dot` is the theme's accent, and it is the whole swatch. It used to be three
   bands — floor, raised surface, text — which was honest about what a theme
   moves and useless to look at: two of the three bands are near-black, so at
   16px every chip read as a dark smudge with a sliver of light on one edge.
   The accent is the one value a person can actually name the theme by. Deep is
   the blue one.

   It has to be repeated here rather than read from the CSS, because the theme
   blocks aren't loaded per-theme; --accent in 00-base.css and this must move
   together, which is only when a theme is added. */
export const THEMES = [
  { id: 'midnight', label: 'Midnight', dot: '#ffffff' },
  { id: 'graphite', label: 'Graphite', dot: '#e8b075' },
  { id: 'deep', label: 'Deep', dot: '#7c9cff' },
  { id: 'moss', label: 'Moss', dot: '#8ce563' },
  { id: 'rose', label: 'Rose', dot: '#f472b6' }
]

// Midnight is the default and carries no attribute, so an unknown or missing
// value falls back to it rather than leaving the app half-themed.
function setThemeAttr(id) {
  const known = THEMES.some((t) => t.id === id)
  if (!known || id === 'midnight') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = id
}

/* Switching theme re-derives the accent, and has to. The accent's companions
   are computed against the theme's own green and red — a hue that crowded
   Deep's mint may sit clear of Moss's, and the nudge has to be recalculated
   against whichever ground is now underneath. The accent survives the switch
   because it is parked on the element rather than held in a component. */
export function applyTheme(id) {
  setThemeAttr(id)
  applyAccent(document.documentElement.dataset.accent || null)
}

/* ---------------- Custom accent ----------------
   A theme is the ground; the accent is the one colour on top of it. Splitting
   them is what lets any accent ride any theme instead of needing five variants
   of each, and it is the split Windows itself uses.

   Everything below derives from ONE hex, deliberately. The moment a person can
   set --on-accent by hand, someone ships white text on a pale yellow pill; the
   companions have to be computed from the accent or they will eventually be
   wrong. */

export function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '').trim()
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const hex2 = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
export const rgbToHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`

export function rgbToHsl([r, g, b]) {
  const R = r / 255, G = g / 255, B = b / 255
  const max = Math.max(R, G, B), min = Math.min(R, G, B)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0)) : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  return [h * 60, s, l]
}

export function hslToRgb(h, s, l) {
  const H = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((H / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] =
    H < 60 ? [c, x, 0] : H < 120 ? [x, c, 0] : H < 180 ? [0, c, x]
    : H < 240 ? [0, x, c] : H < 300 ? [x, 0, c] : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

// HSV is what a saturation/value square speaks; HSL is what the tokens speak,
// so the picker converts at its own edge and nothing else has to know.
export function rgbToHsv(rgb) {
  const [h, sl, l] = rgbToHsl(rgb)
  const v = l + sl * Math.min(l, 1 - l)
  return [h, v === 0 ? 0 : 2 * (1 - l / v), v]
}

export function hsvToRgb(h, s, v) {
  const l = v * (1 - s / 2)
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l)
  return hslToRgb(h, sl, l)
}

// WCAG relative luminance — the only honest way to decide whether what sits on
// this fill has to be dark or light.
function luminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

const normHue = (x) => ((x % 360) + 360) % 360
const shortestHueGap = (a, b) => {
  const d = Math.abs(((a - b) % 360) + 360) % 360
  return d > 180 ? 360 - d : d
}
const inBand = (h, [lo, hi]) => (lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi)

/* Green means alive in this app and red means danger, in every theme. A person
   picking an accent can land on either, and then "selected" and "playing" — or
   "selected" and "delete" — become the same colour. Moss and Rose each needed
   this separation done by hand; here it happens on its own, so a hue that
   crowds one of them pushes THAT one aside rather than the accent the person
   actually chose.

   Two things have to hold at once, and the first version only tried for one.
   It picked a direction relative to the OPPOSITE colour rather than to the
   accent, so a pink accent moved danger from 350° to 302° — 28° away, still
   crowded, and magenta besides. So: land on whichever side of the accent is
   nearer the colour's own hue, and stay inside a band where it still reads as
   what it means. Red that has become purple has not been rescued. */
function nudgeAway(rgbTriplet, accentHue, minGap, band) {
  const [h, s, l] = rgbToHsl(rgbTriplet)
  if (shortestHueGap(h, accentHue) >= minGap) return null
  const span = minGap * 1.35
  const sides = [normHue(accentHue + span), normHue(accentHue - span)].filter((x) =>
    inBand(x, band)
  )
  // Both sides outside the band means the accent is sitting on top of it; the
  // far edge is the most separation the band can give.
  const target = sides.length
    ? sides.sort((a, b) => shortestHueGap(a, h) - shortestHueGap(b, h))[0]
    : [...band].sort((a, b) => shortestHueGap(b, accentHue) - shortestHueGap(a, accentHue))[0]
  return hslToRgb(target, s, l)
}

// Where each meaning is still itself. Outside these a red stops reading as
// danger and a green stops reading as alive, which is the thing being defended.
const GREEN_BAND = [75, 190]
const DANGER_BAND = [330, 35]

const readTriplet = (name) => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  const p = raw.split(/[\s,]+/).map(Number)
  return p.length === 3 && p.every((n) => Number.isFinite(n)) ? p : null
}

/* Every custom property a picked accent owns. Two clamps keep an arbitrary
   choice usable on this app's dark grounds:
   - the accent itself can't go below 38% lightness, or a selected pill
     disappears into the page;
   - the DATA colour can't go below 52%, because a chart is thin marks on a
     dark ground and needs more light than a filled pill does. Windows makes
     the same call by refusing very dark accents in dark mode. */
export function deriveAccent(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const [h, s0, l0] = rgbToHsl(rgb)
  /* A grey has no hue — rgbToHsl reports 0, which is red — so flooring its
     saturation turned #808080 into dusty rose, and nudging green and danger
     away from "red" turned the danger colour orange under a white accent. A
     grey keeps its greyness and moves nothing else. */
  const grey = s0 < 0.04
  const s = grey ? s0 : Math.max(s0, 0.22)
  const accent = hslToRgb(h, s, Math.max(l0, 0.38))
  const hover = hslToRgb(h, s, Math.min(Math.max(l0, 0.38) + 0.1, 0.92))
  const data = hslToRgb(h, s, Math.max(l0, 0.52))
  const dark = luminance(accent) > 0.32
  const on = dark ? hslToRgb(h, 0.55, 0.07) : hslToRgb(h, 0.18, 0.96)
  const mute = on.map((c, i) => c + (accent[i] - c) * 0.45)

  const vars = {
    '--accent': rgbToHex(accent),
    '--accent-2': rgbToHex(accent),
    '--accent-hover': rgbToHex(hover),
    '--on-accent': rgbToHex(on),
    '--on-accent-soft': `rgba(${on.map((c) => Math.round(c)).join(', ')}, 0.62)`,
    '--on-accent-mute': rgbToHex(mute),
    '--data': rgbToHex(data),
    '--data-rgb': data.map((c) => Math.round(c)).join(' ')
  }
  const green = readTriplet('--green-rgb')
  const danger = readTriplet('--danger-rgb')
  const g = !grey && green && nudgeAway(green, h, 38, GREEN_BAND)
  const d = !grey && danger && nudgeAway(danger, h, 34, DANGER_BAND)
  if (g) vars['--green-rgb'] = g.map((c) => Math.round(c)).join(' ')
  if (d) vars['--danger-rgb'] = d.map((c) => Math.round(c)).join(' ')
  return vars
}

/* What a picked hex actually becomes once the lightness floor is applied. The
   swatches and the preview draw THIS, not the raw pick: choosing a near-black
   and being shown a near-black while the app lit up in a lifted version of it
   is a small lie, and the picker is the one place it would be noticed. */
export function accentSwatch(hex) {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [h, s, l] = rgbToHsl(rgb)
  return rgbToHex(hslToRgb(h, s < 0.04 ? s : Math.max(s, 0.22), Math.max(l, 0.38)))
}

const ACCENT_VARS = [
  '--accent', '--accent-2', '--accent-hover', '--on-accent',
  '--on-accent-soft', '--on-accent-mute', '--data', '--data-rgb',
  '--green-rgb', '--danger-rgb'
]

/* Cleared before deriving, always: nudgeAway reads the CURRENT --green-rgb, so
   leaving the last accent's nudge in place would rotate an already-rotated
   green and walk it around the wheel one pick at a time. */
export function applyAccent(hex) {
  const root = document.documentElement
  ACCENT_VARS.forEach((v) => root.style.removeProperty(v))
  const vars = hex ? deriveAccent(hex) : null
  if (vars) {
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v))
    root.dataset.accent = hex
  } else {
    delete root.dataset.accent
  }
}

// The theme has to land before the accent does — the nudge reads the theme's
// own green and red to decide whether the accent is crowding them.
export function applyAppearance(themeId, accentHex) {
  setThemeAttr(themeId)
  applyAccent(accentHex || null)
}

/* Capped at four because every row that shows it shows four. A longer history
   would mean the colour you used yesterday is somewhere you can't see, which is
   the same as not having it. */
export function nextAccentRecents(list, hex) {
  return hex ? [hex, ...(list || []).filter((c) => c !== hex)].slice(0, 4) : list || []
}

// Shown when someone has no history yet. Spread around the wheel on purpose:
// four blues would make the row look like one choice.
export const ACCENT_POPULAR = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7']
