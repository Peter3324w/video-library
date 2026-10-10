import React, { useEffect, useMemo, useState } from 'react'
import { VideoPlay as IcVideo } from 'iconsax-react'
import { AddMenu, BleedBg } from '../components/common'
import { Hero } from '../components/Hero'
import { TitleCard } from '../components/TitleCard'
import { AddFolderButton } from '../components/Folders'
import { episodeLabel, itemName, leftLabel, nextFileFor, progressOf, titleOnDisk, watchItems } from '../lib/media'

const api = window.api

// What the player has open right now, refreshed every 2s — the tracker's own pace.
function useNowPlaying() {
  const [now, setNow] = useState(null)
  useEffect(() => {
    let alive = true
    const read = () => api.nowPlaying().then((n) => alive && setNow(n))
    read()
    const t = setInterval(read, 2000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  return now
}

/* Home: the hero across the top on the thing you're
   watching, then Continue watching and Recently added as poster grids.
   Trending joins once TMDB is in. */
export function HomeView({ library, onPlay, onFeatured, onNav, onOpenTitle }) {
  const now = useNowPlaying()
  const items = useMemo(() => watchItems(library, now), [library, now])
  const [selectedKey, setSelectedKey] = useState(null)
  const nowItem = items.find((it) => it.isNow)
  const recentlyAdded = [...(library.titles || [])]
    .filter((t) => titleOnDisk(t, library.files || []))
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
    .slice(0, 8)
  /* The hero rotates through what you're watching first, then what just
     arrived — up to 8. A new title enters on the file Play would open, so
     Resume/Play and the widgets below mean the same thing for both kinds. */
  const heroList = useMemo(() => {
    const list = items.slice(0, 8)
    const seen = new Set(list.map((it) => it.title && it.title.id))
    for (const t of recentlyAdded) {
      if (list.length >= 8) break
      if (seen.has(t.id)) continue
      const file = nextFileFor(t, library.files || [])
      if (file) list.push({ key: t.id, title: t, file, ts: 0, isNow: false, fresh: true })
    }
    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, library.titles, library.files])
  // Your pick wins — the pager has to work while PotPlayer sits open — then
  // whatever is open in the player (first in the list anyway), then the rest.
  const featured = heroList.find((it) => it.key === selectedKey) || nowItem || heroList[0] || null
  const playing = !!(nowItem && now && now.status === 'playing')

  // Auto-advance every 30s — but not while a video is
  // actually playing (paused is fine: you've stepped away).
  useEffect(() => {
    if (playing || heroList.length < 2 || !featured) return
    const t = setTimeout(() => {
      const i = heroList.findIndex((x) => x.key === featured.key)
      setSelectedKey(heroList[(i + 1) % heroList.length].key)
    }, 30000)
    return () => clearTimeout(t)
  }, [playing, heroList, featured])

  const bg = featured && featured.title ? featured.title.background : null
  useEffect(() => {
    onFeatured && onFeatured(bg)
  }, [bg, onFeatured])

  if (items.length === 0 && recentlyAdded.length === 0) {
    return (
      <div className="page">
        <div className="empty">
          <div className="empty-art">
            <IcVideo size={60} color="currentColor" variant="Bulk" />
          </div>
          <h2>Welcome to Video Library</h2>
          <p>
            Add the folders where your movies and shows live. Everything gets its cover art, and
            anything you play in PotPlayer is remembered — so Resume picks up where you stopped.
          </p>
          <div className="empty-actions">
            <AddFolderButton />
          </div>
        </div>
      </div>
    )
  }

  const byTitle = new Map(items.filter((it) => it.title).map((it) => [it.title.id, it]))
  return (
    <>
      <BleedBg img={bg} className="home-bg" />
      <Hero
        item={featured}
        list={heroList}
        now={now}
        onPlay={onPlay}
        onSelect={(it) => setSelectedKey(it.key)}
        onOpen={featured && featured.title ? () => onOpenTitle(featured.title.id) : undefined}
      />
      <div className="page">
        {items.length > 0 && (
          <section className="vl-section">
            <div className="section-head">
              <h3>Continue watching</h3>
              <div className="head-actions">
                <AddMenu onAddFile={() => api.addFiles()} onScan={() => api.addFolder()} />
              </div>
            </div>
            <div className="poster-grid">
              {items.slice(0, 8).map((it) => {
                const p = progressOf(it, now)
                const ep = episodeLabel(it.file)
                return (
                  <TitleCard
                    key={it.key}
                    name={itemName(it)}
                    poster={it.title && it.title.poster}
                    sub={[ep, leftLabel(p, it.file)].filter(Boolean).join(' · ')}
                    progress={p}
                    live={it.isNow && now && now.status === 'playing'}
                    selected={featured && it.key === featured.key}
                    onSelect={() => (it.title ? onOpenTitle(it.title.id) : setSelectedKey(it.key))}
                  />
                )
              })}
            </div>
          </section>
        )}

        {recentlyAdded.length > 0 && (
          <section className="vl-section">
            <div className="section-head">
              <h3>Recently added</h3>
              <button className="home-link" onClick={() => onNav('tv')}>
                View library
              </button>
            </div>
            <div className="poster-grid">
              {recentlyAdded.map((t) => {
                const it = byTitle.get(t.id)
                return (
                  <TitleCard
                    key={t.id}
                    name={t.name}
                    poster={t.poster}
                    sub={[t.type === 'series' ? 'Series' : 'Movie', t.year].filter(Boolean).join(' · ')}
                    selected={featured && it && it.key === featured.key}
                    onSelect={() => onOpenTitle(t.id)}
                  />
                )
              })}
            </div>
          </section>
        )}
      </div>
    </>
  )
}
