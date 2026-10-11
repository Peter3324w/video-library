import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft as IcBack, Play as IcPlay, TickCircle as IcTick } from 'iconsax-react'
import { coverGradient } from '../lib/util'
import { episodeLabel, onDisk } from '../lib/media'
import { Art } from '../components/common'
import { cleanName, pct } from '../components/rows'

const api = window.api

/* The watch page, web build only. On the desktop the video plays in PotPlayer
   and the tracker reads where it got to; in a browser the page is the player,
   so it reports its own position (api.watchTick) and the bridge keeps the same
   records the tracker would: resume position, finished at 85%, history.

   A working layout, not a designed one: player, what it is, what's next. */

const NEXT_COUNTDOWN = 8 // seconds the "Up next" card waits before it plays
const epOrder = (f) => (f.season || 0) * 10000 + (f.episode || 0)
const minutes = (ms) => (ms > 0 ? `${Math.round(ms / 60000)} min` : '')

export function WatchView({ fileId, fromStart, library, onBack, onPlay, onOpenTitle }) {
  const files = library.files || []
  const file = files.find((f) => f.id === fileId)
  const title = file ? (library.titles || []).find((t) => t.id === file.titleId) : null
  const isShow = !!(title && title.type === 'series')

  // The other episodes of this show that can be played, in order.
  const episodes = useMemo(
    () =>
      isShow
        ? files.filter((f) => f.titleId === title.id && f.path && onDisk(f)).sort((a, b) => epOrder(a) - epOrder(b))
        : [],
    [files, isShow, title]
  )
  const next = file ? episodes.find((f) => epOrder(f) > epOrder(file)) || null : null
  const epMeta = (f) =>
    (title && title.details && title.details.episodes ? title.details.episodes : []).find(
      (e) => e.season === (f.season ?? 1) && e.episode === f.episode
    ) || null
  const meta = file && isShow ? epMeta(file) : null

  // Films have no next episode; the rail offers the rest of the library instead.
  const others = useMemo(
    () =>
      isShow
        ? []
        : (library.titles || [])
            .filter((t) => (!title || t.id !== title.id) && files.some((f) => f.titleId === t.id && f.path && onDisk(f)))
            .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
            .slice(0, 8),
    [library.titles, files, isShow, title]
  )

  /* ---------------- The player ---------------- */
  const video = useRef(null)
  const [source, setSource] = useState(null) // { url } | { error }
  const [failed, setFailed] = useState(false)
  const [ended, setEnded] = useState(false)
  const [count, setCount] = useState(NEXT_COUNTDOWN)
  // Where to start, decided once: the library keeps moving while this plays.
  const startMs = useRef(file && !file.completed && !fromStart ? file.positionMs || 0 : 0)

  useEffect(() => {
    let alive = true
    api.watchSource(fileId).then((s) => alive && setSource(s || { error: 'This file has nothing to play.' }))
    return () => {
      alive = false
    }
  }, [fileId])

  const tick = () => {
    const v = video.current
    if (!v || !v.duration) return
    api.watchTick(fileId, {
      positionMs: Math.round(v.currentTime * 1000),
      durationMs: Math.round(v.duration * 1000),
      playing: !v.paused && !v.ended
    })
  }
  // Leaving the page, or the tab, ends the watch: that is what writes history.
  useEffect(() => {
    const end = () => api.watchEnd()
    window.addEventListener('pagehide', end)
    return () => {
      window.removeEventListener('pagehide', end)
      end()
    }
  }, [fileId])

  // Space and the arrows work wherever the focus is, as they do on any video site.
  useEffect(() => {
    const onKey = (e) => {
      const v = video.current
      if (!v || e.target === v || /^(INPUT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) return
      if (e.key === ' ' || e.key === 'k') v.paused ? v.play() : v.pause()
      else if (e.key === 'ArrowRight') v.currentTime = Math.min(v.duration || 0, v.currentTime + 10)
      else if (e.key === 'ArrowLeft') v.currentTime = Math.max(0, v.currentTime - 10)
      else if (e.key === 'f') document.fullscreenElement ? document.exitFullscreen() : v.requestFullscreen()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // The last episode finished: count down, then play the next one.
  useEffect(() => {
    if (!ended || !next) return
    if (count <= 0) {
      onPlay(next, { fromStart: true })
      return
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [ended, next, count, onPlay])

  if (!file) {
    return (
      <div className="page">
        <button className="btn-soft" onClick={onBack}>
          <IcBack size={16} color="currentColor" variant="Linear" /> Back
        </button>
      </div>
    )
  }

  const name = title ? title.name : cleanName(file.fileName)
  const epLine = isShow ? [episodeLabel(file), meta && meta.name].filter(Boolean).join(' · ') : ''
  const facts = [
    !isShow && title && title.year,
    title && (title.genres || []).slice(0, 3).join(' · '),
    minutes(file.durationMs) || (title && title.runtime),
    title && title.imdbRating && `IMDb ${title.imdbRating}`
  ].filter(Boolean)
  const about = (meta && meta.overview) || (title && title.description) || ''
  const error = (source && source.error) || (failed && 'This video didn’t play.')

  return (
    <div className="page vl-watch">
      <div className="vl-watch-main">
        <div className="vl-watch-stage" style={title && title.background ? {} : coverGradient(name)}>
          {source && source.url && !error && (
            <video
              ref={video}
              src={source.url}
              controls
              autoPlay
              playsInline
              onLoadedMetadata={(e) => {
                // Resume. Past the end of a re-encoded file, just start over.
                const at = startMs.current / 1000
                if (at > 0 && at < e.currentTarget.duration - 5) e.currentTarget.currentTime = at
              }}
              onTimeUpdate={tick}
              onPlay={() => {
                setEnded(false)
                tick()
              }}
              onPause={tick}
              onEnded={() => {
                tick()
                setCount(NEXT_COUNTDOWN)
                setEnded(true)
              }}
              onError={() => setFailed(true)}
            />
          )}
          {error && (
            <div className="vl-watch-note">
              <h3>{error}</h3>
              <p>
                A browser plays MP4 and WebM, and only some MKV, HEVC and surround-sound files. The
                desktop app hands every format to a real player.
              </p>
            </div>
          )}
          {ended && next && !error && (
            <div className="vl-watch-note">
              <div className="vl-watch-eyebrow">Up next in {count}</div>
              <h3>{[episodeLabel(next), (epMeta(next) || {}).name].filter(Boolean).join(' · ')}</h3>
              <div className="vl-watch-note-actions">
                <button className="btn-primary" onClick={() => onPlay(next, { fromStart: true })}>
                  <IcPlay size={18} color="currentColor" variant="Bold" /> Play now
                </button>
                <button className="btn-soft" onClick={() => setEnded(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="vl-watch-info">
          <button className="vl-watch-back" onClick={onBack} aria-label="Back">
            <IcBack size={18} color="currentColor" variant="Linear" />
          </button>
          <div className="vl-watch-heading">
            <h1 className="vl-watch-name">{name}</h1>
            {epLine && <div className="vl-watch-ep">{epLine}</div>}
            {facts.length > 0 && <div className="vl-title-meta">{facts.join('  ·  ')}</div>}
          </div>
          {title && (
            <button className="btn-soft" onClick={() => onOpenTitle(title.id)}>
              {isShow ? 'All episodes' : 'About this film'}
            </button>
          )}
        </div>
        {about && <p className="vl-title-desc">{about}</p>}
      </div>

      <aside className="vl-watch-rail">
        {isShow && episodes.length > 0 && (
          <>
            <div className="section-head">
              <h3>Episodes</h3>
            </div>
            <div className="vl-ep-list">
              {episodes.map((f) => {
                const m = epMeta(f)
                const current = f.id === file.id
                return (
                  <div
                    key={f.id}
                    className={`vl-ep ${current ? 'next' : ''}`}
                    onClick={current ? undefined : () => onPlay(f)}
                  >
                    <div className="vl-ep-thumb" style={coverGradient(name)}>
                      <span className="vl-ep-num">E{f.episode}</span>
                      <Art src={m && m.thumbnail} />
                      {f.positionMs > 0 && !f.completed && (
                        <div className="vl-poster-progress">
                          <div className="vl-progress-fill" style={{ width: `${pct(f.positionMs, f.durationMs)}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="vl-ep-body">
                      <div className="vl-ep-title">
                        <span>
                          {f.episode}. {(m && m.name) || cleanName(f.fileName)}
                        </span>
                        {f.completed && <IcTick size={16} color="currentColor" variant="Bold" className="vl-ep-done" />}
                      </div>
                      <div className="vl-ep-sub">
                        {[current ? 'Playing' : next && f.id === next.id ? 'Up next' : '', minutes(f.durationMs)]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
        {!isShow && others.length > 0 && (
          <>
            <div className="section-head">
              <h3>More in your library</h3>
            </div>
            <div className="vl-ep-list">
              {others.map((t) => (
                <div key={t.id} className="vl-ep" onClick={() => onOpenTitle(t.id)}>
                  <div className="vl-ep-thumb" style={coverGradient(t.name)}>
                    <Art src={t.background} />
                  </div>
                  <div className="vl-ep-body">
                    <div className="vl-ep-title">
                      <span>{t.name}</span>
                    </div>
                    <div className="vl-ep-sub">
                      {[t.type === 'series' ? 'Series' : 'Movie', t.year, t.runtime].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
