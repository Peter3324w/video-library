import React from 'react'
import { TitleCard } from '../components/TitleCard'
import { AddFolderButton, RescanButton } from '../components/Folders'
import { onDisk } from '../lib/media'
import { relativeDay } from '../lib/util'

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

/* The hover text on a "Not on this PC" cover: when it went, that nothing you
   watched went with it, and how to get it back. */
function goneHint(mine) {
  const went = Math.max(0, ...mine.map((f) => f.missingAt || 0))
  const when = went ? ` ${relativeDay(went).toLowerCase()}` : ''
  const where = mine.find((f) => f.path)
  return (
    `Deleted${when} — what you watched is kept.` +
    `\nPut it back in a library folder and it reconnects on the next scan.` +
    (where ? `\nLast seen at ${where.path}` : '')
  )
}

/* One view for every library (Movies, TV Shows, later Anime and Cartoons) —
   the category decides which titles show, not which component renders.
   Titles with nothing left on this PC drop to a "Not on this PC" shelf at the
   bottom, cover and all, instead of disappearing. */
export function LibraryView({ category, library, onOpenTitle }) {
  const files = library.files || []
  const titles = (library.titles || [])
    .filter((t) => t.category === category.id)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => {
      const all = files.filter((f) => f.titleId === t.id)
      return { t, all, mine: all.filter(onDisk) }
    })
  const here = titles.filter((x) => x.mine.length > 0)
  const gone = titles.filter((x) => x.mine.length === 0)

  const card = ({ t, all, mine }, isGone) => {
    let sub
    if (isGone) {
      // What you got through before it went: episodes for a show, the date for a film.
      const done = all.filter((f) => f.completed).length
      const last = Math.max(0, ...all.map((f) => f.lastWatched || 0))
      sub =
        t.type === 'series'
          ? `Watched ${done} episode${done === 1 ? '' : 's'}`
          : last
            ? `Watched ${relativeDay(last).toLowerCase()}`
            : t.year
    } else if (t.type === 'series') {
      // What's on this PC: seasons and episodes for a show, the year for a film.
      const seasons = new Set(mine.filter((f) => f.episode != null).map((f) => f.season ?? 1)).size
      sub = [seasons > 0 && plural(seasons, 'season'), plural(mine.length, 'episode')].filter(Boolean).join(' · ')
    } else sub = t.year
    return (
      <TitleCard
        key={t.id}
        name={t.name}
        poster={t.poster}
        sub={sub}
        gone={isGone}
        goneHint={isGone ? goneHint(all) : undefined}
        onSelect={() => onOpenTitle(t.id)}
      />
    )
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{category.label}</h1>
          <p className="page-sub">
            {plural(here.length, 'title')}
            {gone.length > 0 && ` · ${gone.length} in history`}
          </p>
        </div>
        <div className="head-actions">
          <RescanButton />
        </div>
      </header>
      {titles.length === 0 ? (
        <div className="empty">
          <div className="empty-art">
            <category.Icon size={60} color="currentColor" variant="Bulk" />
          </div>
          <h2>Nothing here yet</h2>
          <p>
            Add a folder and anything that looks like {category.label.toLowerCase()} lands here with
            its cover art. New downloads are picked up every time the app starts.
          </p>
          <div className="empty-actions">
            <AddFolderButton />
          </div>
        </div>
      ) : (
        <>
          {here.length > 0 && <div className="poster-grid lib">{here.map((x) => card(x, false))}</div>}
          {gone.length > 0 && (
            <>
              <div className={`lib-divider ${here.length ? '' : 'first'}`}>
                <h3>Not on this PC</h3>
                <span>
                  {gone.length} kept for history · download it again into a library folder and it
                  picks up where you left off
                </span>
              </div>
              <div className="poster-grid lib">{gone.map((x) => card(x, true))}</div>
            </>
          )}
        </>
      )}
    </div>
  )
}
