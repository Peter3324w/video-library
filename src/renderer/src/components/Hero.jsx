import React from 'react'
import {
  ArrowDown2 as IcChevronDown,
  Play as IcPlay,
  Calendar as IcCalendar,
  Timer1 as IcTimer,
  Star1 as IcStar
} from 'iconsax-react'
import { artUrl, coverGradient, relativeDay } from '../lib/util'
import { episodeLabel, itemName, leftLabel, progressOf } from '../lib/media'
import { formatPos, pct } from './rows'

// Home hero: cover art, a tag and the show's name, where you stopped below.
export function Hero({ item, list, now, onPlay, onSelect, onOpen }) {
  if (!item) return null
  const t = item.title
  const name = itemName(item)
  const bg = t && t.background
  const p = progressOf(item, now)
  const idx = list.findIndex((x) => x.key === item.key)
  const go = (e, d) => {
    e.stopPropagation()
    if (list.length < 2) return
    onSelect(list[(idx + d + list.length) % list.length])
  }
  const live = item.isNow && now
  const ep = episodeLabel(item.file)
  return (
    <div className="hero">
      {/* The art itself is the way to the title page. */}
      <div
        className={`hero-art vl-hero-art ${onOpen ? 'clickable' : ''}`}
        style={bg ? {} : coverGradient(name)}
        onClick={onOpen}
        title={onOpen ? `Open ${name}` : undefined}
      >
        {bg && <img src={artUrl(bg)} alt={name} />}
        <div className="hero-scrim" />
        {live && (
          <div className="badge-playing hero-badge">
            <span className="pulse" /> {now.status === 'paused' ? 'Paused' : 'Playing'} ·{' '}
            {formatPos(p.pos)}
          </div>
        )}
        {/* Tag, then the show's name as text — no logo art, which comes in too
            small and too faint to read. Shows you're partway through name the
            episode in the tag. */}
        <div className="hero-info">
          <div className="hero-eyebrow">
            {item.fresh ? 'Recently added' : `Continue watching${ep ? ` · ${ep}` : ''}`}
          </div>
          <h2 className="hero-title">{name}</h2>
        </div>
        {list.length > 1 && (
          <div className="hero-pager">
            <button className="hero-arrow" onClick={(e) => go(e, -1)} aria-label="Previous">
              <IcChevronDown size={16} color="currentColor" variant="Linear" style={{ transform: 'rotate(90deg)' }} />
            </button>
            <div className="hero-dots">
              {list.map((x) => (
                <button
                  key={x.key}
                  className={`hero-dot ${x.key === item.key ? 'on' : ''}`}
                  title={itemName(x)}
                  aria-label={itemName(x)}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelect(x)
                  }}
                />
              ))}
            </div>
            <button className="hero-arrow" onClick={(e) => go(e, 1)} aria-label="Next">
              <IcChevronDown size={16} color="currentColor" variant="Linear" style={{ transform: 'rotate(-90deg)' }} />
            </button>
          </div>
        )}
      </div>
      <div className="hero-actions">
        {p.dur > 0 && (
          <div className="vl-hero-progress">
            <div className="vl-hero-progress-fill" style={{ width: `${pct(p.pos, p.dur)}%` }} />
          </div>
        )}
        <button className="hero-widget hero-widget-play" onClick={() => onPlay(item.file)}>
          <IcPlay size={26} color="#000" variant="Bold" />
          <span>{item.file.completed ? 'Play again' : p.pos > 0 ? 'Resume' : 'Play'}</span>
        </button>
        <div className="hero-widget">
          <div className="hw-top">
            <IcTimer size={14} color="currentColor" variant="Linear" /> {ep || 'Progress'}
          </div>
          <div className="hw-val">{leftLabel(p, item.file) || (t && t.runtime) || '—'}</div>
        </div>
        <div className="hero-widget">
          <div className="hw-top">
            <IcCalendar size={14} color="currentColor" variant="Linear" />{' '}
            {item.file.lastWatched || live ? 'Last watched' : 'Added'}
          </div>
          <div className="hw-val">
            {live
              ? 'Now'
              : item.file.lastWatched
                ? relativeDay(item.file.lastWatched)
                : relativeDay(item.file.addedAt || (t && t.addedAt))}
          </div>
        </div>
        <div className="hero-widget">
          <div className="hw-top">
            <IcStar size={14} color="currentColor" variant="Linear" /> IMDb
          </div>
          <div className="hw-val">{t && t.imdbRating ? t.imdbRating : '—'}</div>
        </div>
      </div>
    </div>
  )
}
