import React from 'react'
import { Play as IcPlay } from 'iconsax-react'
import { coverGradient, formatClock, initials } from '../lib/util'
import { Art } from './common'

// "Youjo_Senki_-_01_BD_1080p.mp4" → "Youjo Senki - 01 BD 1080p". A stand-in
// until files are matched to real titles (TMDB) and get proper names.
export function cleanName(fileName) {
  return String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const pct = (pos, dur) => (dur > 0 ? Math.min(100, (pos / dur) * 100) : 0)

// Minutes-and-seconds for a position, without a leading 0: for short videos.
export function formatPos(ms) {
  const c = formatClock((ms || 0) / 1000)
  return c.startsWith('0:') ? c.slice(2) : c
}

// One file as a list row: cover, name, a line of detail, and where you stopped.
export function FileRow({ file, poster, name: nameProp, sub, positionMs, durationMs, onPlay, live }) {
  const name = nameProp || cleanName(file.fileName)
  const pos = positionMs != null ? positionMs : file.positionMs
  const dur = durationMs != null ? durationMs : file.durationMs
  return (
    <div className="lib-row vl-row" onClick={onPlay ? () => onPlay(file) : undefined}>
      <div className="lr-cover" style={coverGradient(name)}>
        <span>{initials(name)}</span>
        <Art src={poster} />
      </div>
      <div className="lr-main">
        <div className="lr-name">
          {live && <span className="pulse" />}
          <span>{name}</span>
          {file.present === false && <span className="lr-tag">Not on this PC</span>}
        </div>
        <div className="lr-sub">{sub}</div>
        {dur > 0 && (
          <div className="vl-progress" title={`${formatPos(pos)} / ${formatPos(dur)}`}>
            <div className="vl-progress-fill" style={{ width: `${pct(pos, dur)}%` }} />
          </div>
        )}
      </div>
      {onPlay && file.path && file.present !== false && (
        <button
          className="lr-play vl-row-play"
          onClick={(e) => {
            e.stopPropagation()
            onPlay(file)
          }}
        >
          <IcPlay size={15} color="currentColor" variant="Bold" /> Play
        </button>
      )}
    </div>
  )
}
