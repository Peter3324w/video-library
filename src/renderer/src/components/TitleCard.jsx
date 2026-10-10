import React from 'react'
import { coverGradient, initials } from '../lib/util'
import { pct } from './rows'
import { Art } from './common'

/* Poster card — the shared .poster, with a progress bar along the bottom of
   the art. Clicking it opens the title's page; there is
   deliberately no play button on the art, because one in the middle of the
   cover turned "open this" into "start playing". */
export function TitleCard({ name, poster, sub, progress, selected, live, gone, goneHint, onSelect }) {
  return (
    <div
      className={`poster ${live ? 'poster-active' : ''} ${selected ? 'poster-selected' : ''} ${
        gone ? 'poster-uninstalled' : ''
      }`}
      onClick={onSelect}
    >
      <div className="poster-frame">
        <div className="poster-art" style={coverGradient(name)}>
          <span>{initials(name)}</span>
          <Art src={poster} alt={name} />
          {gone && (
            <div className="poster-tag" title={goneHint}>
              Not on this PC
            </div>
          )}
          {live && (
            <div className="poster-live">
              <span className="pulse" />
            </div>
          )}
          {progress && progress.dur > 0 && (
            <div className="vl-poster-progress">
              <div className="vl-progress-fill" style={{ width: `${pct(progress.pos, progress.dur)}%` }} />
            </div>
          )}
        </div>
      </div>
      <div className="poster-meta">
        <div className="poster-name">{name}</div>
        {sub && <div className="poster-sub">{sub}</div>}
      </div>
    </div>
  )
}
