import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft as IcBack,
  Play as IcPlay,
  RotateLeft as IcRestart,
  Star1 as IcStar,
  TickCircle as IcTick,
  VideoSquare as IcTrailer,
  InfoCircle as IcInfo,
  FolderOpen as IcFolder
} from 'iconsax-react'
import { artUrl, coverGradient, relativeDay } from '../lib/util'
import { episodeLabel, nextFileFor } from '../lib/media'
import { Art, Dropdown } from '../components/common'
import { cleanName, pct } from '../components/rows'
import { WEB } from '../lib/platform'

const api = window.api

const seasonLabel = (n) => (n === 0 ? 'Specials' : `Season ${n}`)
const minutes = (ms) => (ms > 0 ? `${Math.round(ms / 60000)} min` : '')

/* Episodes of one season: Cinemeta's list (so the ones you haven't
   downloaded still show, dimmed) merged with the files on disk (so an
   episode Cinemeta numbers differently still shows, under its file name). */
function seasonRows(details, files, season) {
  const rows = new Map()
  for (const e of (details && details.episodes) || [])
    if (e.season === season) rows.set(e.episode, { ...e, file: null })
  for (const f of files) {
    if ((f.season ?? 1) !== season || f.episode == null) continue
    const r = rows.get(f.episode) || { season, episode: f.episode, name: '', overview: '', thumbnail: null }
    // Prefer the copy that's on this PC when there are two.
    if (!r.file || (r.file.present === false && f.present !== false)) r.file = f
    rows.set(f.episode, r)
  }
  return [...rows.values()].sort((a, b) => a.episode - b.episode)
}

/* One tool in the row under the title — the icon-over-label buttons Netflix,
   Prime and Disney+ line up beside Play. */
function Tool({ Icon, label, on, onClick, disabled, variant }) {
  return (
    <button className={`vl-tool ${on ? 'on' : ''}`} onClick={onClick} disabled={disabled}>
      <span className="vl-tool-ic">
        <Icon size={20} color="currentColor" variant={on ? 'Bold' : variant || 'Linear'} />
      </span>
      <span className="vl-tool-label">{label}</span>
    </button>
  )
}

function Fact({ label, children }) {
  if (!children || (Array.isArray(children) && !children.length)) return null
  return (
    <div className="vl-fact">
      <div className="vl-fact-label">{label}</div>
      <div className="vl-fact-val">{Array.isArray(children) ? children.join(', ') : children}</div>
    </div>
  )
}

export function TitleView({ titleId, library, onPlay, onBack }) {
  const title = (library.titles || []).find((t) => t.id === titleId)
  // Fetch details (cast, trailers, episode list) the first time a page opens.
  useEffect(() => {
    if (title && !title.details) api.titleDetails(title.id)
  }, [title])

  const files = useMemo(
    () => (library.files || []).filter((f) => f.titleId === titleId),
    [library.files, titleId]
  )
  const next = title ? nextFileFor(title, library.files || []) : null
  const d = title && title.details
  const isShow = title && title.type === 'series'

  const seasons = useMemo(() => {
    const set = new Set()
    for (const e of (d && d.episodes) || []) set.add(e.season)
    for (const f of files) if (f.episode != null) set.add(f.season ?? 1)
    // Specials last, as every streaming app lists them.
    return [...set].sort((a, b) => (a === 0) - (b === 0) || a - b)
  }, [d, files])
  const [season, setSeason] = useState(null)
  const shownSeason = season ?? (next && next.season != null ? next.season : seasons.find((s) => s > 0) ?? seasons[0])
  const rows = isShow && shownSeason != null ? seasonRows(d, files, shownSeason) : []

  const [moreOpen, setMoreOpen] = useState(false)
  if (!title) {
    return (
      <div className="page">
        <button className="btn-soft" onClick={onBack}>
          <IcBack size={16} color="currentColor" variant="Linear" /> Back
        </button>
      </div>
    )
  }

  const present = files.filter((f) => f.path && f.present !== false)
  /* Deleted: the page stays as a record — cover, episodes, what you finished
     and when — the way a launcher keeps an uninstalled game's hours. */
  const gone = files.length > 0 && !files.some((f) => f.present !== false)
  const lastWatched = Math.max(0, ...files.map((f) => f.lastWatched || 0))
  const doneCount = files.filter((f) => f.completed).length
  const goneLine = [
    isShow ? `You watched ${doneCount} episode${doneCount === 1 ? '' : 's'}` : doneCount ? 'You watched it' : '',
    lastWatched && `last ${relativeDay(lastWatched).toLowerCase()}`,
    'put it back in a library folder and Rescan to watch again'
  ]
    .filter(Boolean)
    .join(' · ')
  const allWatched = present.length > 0 && present.every((f) => f.completed)
  const resuming = next && next.positionMs > 0 && !next.completed
  const playLabel = !next
    ? 'Not on this PC'
    : `${resuming ? 'Resume' : 'Play'}${isShow && next.episode != null ? ` ${episodeLabel(next)}` : ''}`
  const meta = [
    title.year,
    (title.genres || []).slice(0, 3).join(' · '),
    title.runtime,
    title.imdbRating && `IMDb ${title.imdbRating}`
  ].filter(Boolean)
  const trailer = d && d.trailers && d.trailers[0]

  return (
    <div className="vl-title">
      <div className="vl-title-hero" style={title.background ? {} : coverGradient(title.name)}>
        {title.background && <img src={artUrl(title.background)} alt="" />}
        <div className="vl-title-scrim" />
        <button className="vl-back" onClick={onBack} aria-label="Back">
          <IcBack size={18} color="currentColor" variant="Linear" />
        </button>
        {title.logo && <img className="vl-title-logo" src={artUrl(title.logo)} alt={title.name} />}
      </div>

      <div className="page vl-title-body">
        <h1 className="vl-title-name">{title.name}</h1>
        {meta.length > 0 && <div className="vl-title-meta">{meta.join('  ·  ')}</div>}
        {title.description && <p className="vl-title-desc">{title.description}</p>}
        {gone && (
          <div className="vl-gone-note">
            <span className="lr-tag">Not on this PC</span>
            <span>{goneLine}</span>
          </div>
        )}

        <div className="vl-actions">
          <button className="btn-primary vl-play" disabled={!next} onClick={() => onPlay(next)}>
            <IcPlay size={20} color="currentColor" variant="Bold" /> {playLabel}
          </button>
          <div className="vl-tools">
            <Tool
              Icon={IcRestart}
              label="Start over"
              disabled={!next}
              onClick={() => onPlay(next, { fromStart: true })}
            />
            <Tool
              Icon={IcStar}
              label={title.favorite ? 'Favourited' : 'Favourite'}
              on={title.favorite}
              onClick={() => api.updateTitle(title.id, { favorite: !title.favorite })}
            />
            <Tool
              Icon={IcTick}
              label={allWatched ? 'Watched' : 'Mark watched'}
              on={allWatched}
              disabled={!present.length}
              onClick={() => api.setWatched(present.map((f) => f.id), !allWatched)}
            />
            <Tool
              Icon={IcTrailer}
              label="Trailer"
              disabled={!trailer}
              onClick={() => api.openExternal(`https://www.youtube.com/watch?v=${trailer}`)}
            />
            <Tool Icon={IcInfo} label="More info" on={moreOpen} variant="Linear" onClick={() => setMoreOpen((o) => !o)} />
            {!WEB && (
              <Tool
                Icon={IcFolder}
                label="Open folder"
                disabled={!next}
                onClick={() => api.revealFile(next.id)}
              />
            )}
          </div>
        </div>

        {moreOpen && (
          <div className="vl-more">
            {!d && <div className="page-sub">Loading details…</div>}
            {d && (
              <>
                <Fact label="Cast">{d.cast}</Fact>
                <Fact label="Director">{d.director}</Fact>
                <Fact label="Writer">{d.writer}</Fact>
                <Fact label="Genres">{title.genres}</Fact>
                <Fact label="Country">{d.country}</Fact>
                <Fact label="Released">{d.released && new Date(d.released).toLocaleDateString()}</Fact>
                <Fact label="Awards">{d.awards}</Fact>
                <button className="home-link" onClick={() => api.openExternal(`https://www.imdb.com/title/${title.imdbId}/`)}>
                  Full cast &amp; crew on IMDb →
                </button>
              </>
            )}
          </div>
        )}

        {isShow && seasons.length > 0 && (
          <section className="vl-section vl-episodes">
            <div className="section-head">
              <h3>Episodes</h3>
              {seasons.length > 1 && (
                <Dropdown
                  value={shownSeason}
                  options={seasons.map((n) => ({ value: n, label: seasonLabel(n) }))}
                  onChange={setSeason}
                  ariaLabel="Season"
                />
              )}
            </div>
            <div className="vl-ep-list">
              {rows.map((r) => {
                const f = r.file
                const playable = f && f.path && f.present !== false
                const isNext = next && f && f.id === next.id
                return (
                  <div
                    key={r.episode}
                    className={`vl-ep ${playable ? '' : 'missing'} ${isNext ? 'next' : ''}`}
                    onClick={playable ? () => onPlay(f) : undefined}
                  >
                    <div className="vl-ep-thumb" style={coverGradient(title.name)}>
                      <span className="vl-ep-num">E{r.episode}</span>
                      <Art src={r.thumbnail} />
                      {playable && (
                        <span className="vl-ep-play">
                          <IcPlay size={18} color="#fff" variant="Bold" />
                        </span>
                      )}
                      {f && f.positionMs > 0 && !f.completed && (
                        <div className="vl-poster-progress">
                          <div className="vl-progress-fill" style={{ width: `${pct(f.positionMs, f.durationMs)}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="vl-ep-body">
                      <div className="vl-ep-title">
                        <span>
                          {r.episode}. {r.name || (f ? cleanName(f.fileName) : `Episode ${r.episode}`)}
                        </span>
                        {f && f.completed && (
                          <IcTick size={16} color="currentColor" variant="Bold" className="vl-ep-done" />
                        )}
                      </div>
                      <div className="vl-ep-sub">
                        {[
                          isNext ? (f.positionMs > 0 && !f.completed ? 'Up next · in progress' : 'Up next') : '',
                          f && f.durationMs ? minutes(f.durationMs) : '',
                          f && f.lastWatched ? `Watched ${relativeDay(f.lastWatched).toLowerCase()}` : '',
                          !f ? 'Not downloaded' : f.present === false ? 'Not on this PC' : '',
                          r.released && new Date(r.released).getFullYear()
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                      {r.overview && <p className="vl-ep-overview">{r.overview}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {!isShow && files.length > 1 && (
          <section className="vl-section">
            <div className="section-head">
              <h3>Files</h3>
            </div>
            <div className="vl-ep-list">
              {files.map((f) => (
                <div key={f.id} className={`vl-ep ${f.present === false ? 'missing' : ''}`} onClick={() => onPlay(f)}>
                  <div className="vl-ep-body">
                    <div className="vl-ep-title">
                      <span>{cleanName(f.fileName)}</span>
                    </div>
                    <div className="vl-ep-sub">{f.path}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
