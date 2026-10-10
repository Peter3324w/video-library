import React from 'react'
import { Clock as IcHistory } from 'iconsax-react'
import { formatTime, relativeDay } from '../lib/util'
import { FileRow, formatPos } from '../components/rows'
import { RescanButton } from '../components/Folders'

/* Everything you've watched, on disk or not. History is keyed by title, so
   deleting a file never deletes the fact you watched it. */
export function HistoryView({ library, onPlay, onOpenTitle }) {
  const byId = new Map((library.files || []).map((f) => [f.id, f]))
  const titles = new Map((library.titles || []).map((t) => [t.id, t]))
  const items = [...(library.history || [])].sort((a, b) => b.end - a.end)
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>History</h1>
          <p className="page-sub">Everything you&apos;ve watched — still on this PC or not</p>
        </div>
        <div className="head-actions">
          <RescanButton />
        </div>
      </header>
      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-art">
            <IcHistory size={60} color="currentColor" variant="Bulk" />
          </div>
          <h2>No history yet</h2>
          <p>Play something and it shows up here, with where you stopped.</p>
        </div>
      ) : (
        <div className="lib-list">
          {items.map((h) => {
            const file = byId.get(h.fileId) || { fileName: h.fileName }
            const t = titles.get(h.titleId || file.titleId)
            // The show's name and episode when we know them, else the file name.
            const ep = file.episode != null ? ` · ${file.season != null ? `S${file.season} ` : ''}E${file.episode}` : ''
            return (
            <FileRow
              key={h.id}
              file={file}
              poster={t && t.poster}
              name={t ? `${t.name}${ep}` : undefined}
              // A deleted file can't play; its row opens the show's page instead,
              // where the cover and every episode you watched are still kept.
              onPlay={file.present === false && t ? () => onOpenTitle(t.id) : onPlay}
              positionMs={h.toMs}
              durationMs={h.durationMs}
              sub={`${relativeDay(h.end)} · watched ${formatTime(h.seconds)} · ${
                h.completed ? 'finished' : `${formatPos(h.fromMs)} → ${formatPos(h.toMs)}`
              }`}
            />
            )
          })}
        </div>
      )}
    </div>
  )
}
