import React, { useEffect, useRef, useState } from 'react'
import {
  Home as IcHome,
  Category as IcLibrary,
  ArrowDown2 as IcChevronDown,
  VideoPlay as IcMovies,
  Monitor as IcTv,
  Clock as IcHistory,
  Star1 as IcFavourites,
  SidebarLeft as IcCollapse,
  SidebarRight as IcExpand,
  Setting2 as IcSettings,
  Colorfilter as IcTheme,
  TickCircle as IcTick
} from 'iconsax-react'
import { applyTheme, formatTime, THEMES } from '../lib/util'
import { WEB } from '../lib/platform'
import { AppMark, BleedBg } from './common'

const api = window.api

/* Window controls float over the top-right (over the hero artwork on Home) */
export function WindowControls() {
  if (WEB) return null // a browser tab has its own
  return (
    <div className="window-controls">
      <button className="win-btn" onClick={() => api.win.minimize()} aria-label="Minimize">
        &#x2013;
      </button>
      <button className="win-btn" onClick={() => api.win.maximize()} aria-label="Maximize">
        &#x25A1;
      </button>
      <button className="win-btn win-close" onClick={() => api.win.close()} aria-label="Close">
        &#x2715;
      </button>
    </div>
  )
}

/* The libraries are a list on purpose: Anime and Cartoons join later as two
   more rows here (each with its own series/movies split), not as new code
   paths. The `id` is the category a title is filed under. */
export const LIBRARIES = [
  { id: 'tv', label: 'TV Shows', Icon: IcTv },
  { id: 'movies', label: 'Movies', Icon: IcMovies }
]

export function Sidebar({ view, setView, openSettings, library, collapsed, onToggleCollapse, bgImg }) {
  const top = [{ id: 'home', label: 'Home', Icon: IcHome }]
  const rest = [
    { id: 'history', label: 'History', Icon: IcHistory },
    // Working name — the ranked/unranked favourites page gets named later.
    { id: 'favourites', label: 'Favourites', Icon: IcFavourites }
  ]
  const onLibraryPage = LIBRARIES.some((l) => l.id === view)
  const [libOpen, setLibOpen] = useState(() => localStorage.getItem('vlLibOpen') !== '0')
  useEffect(() => {
    localStorage.setItem('vlLibOpen', libOpen ? '1' : '0')
  }, [libOpen])
  // Landing on a library from elsewhere (Home's "View library") opens the group,
  // or the highlighted row would be hidden inside a closed one.
  useEffect(() => {
    if (onLibraryPage) setLibOpen(true)
  }, [onLibraryPage])
  const navItem = ({ id, label, Icon }, extra = '') => (
    <button
      key={id}
      className={`nav-item nav-${id} ${extra} ${view === id ? 'active' : ''}`}
      onClick={() => setView(id)}
      title={collapsed ? label : undefined}
    >
      <Icon size={18} color="currentColor" variant={view === id ? 'Bulk' : 'Linear'} className="nav-icon" />
      <span className="nav-label">{label}</span>
    </button>
  )
  const titles = library.titles || []
  const watched = (library.history || []).reduce((s, h) => s + (h.seconds || 0), 0)

  // Theme menu — reads the current theme off <html>, so it stays in step with
  // the picker in Settings without either one knowing about the other.
  const [themeOpen, setThemeOpen] = useState(false)
  const [theme, setTheme] = useState('midnight')
  const themeRef = useRef(null)
  useEffect(() => {
    if (!themeOpen) return
    setTheme(document.documentElement.dataset.theme || 'midnight')
    const onDown = (e) => {
      if (themeRef.current && !themeRef.current.contains(e.target)) setThemeOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [themeOpen])
  const pickTheme = (id) => {
    applyTheme(id)
    setTheme(id)
    setThemeOpen(false)
    api.setSettings({ theme: id })
    window.dispatchEvent(new CustomEvent('vl-theme', { detail: id }))
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <BleedBg img={bgImg} className="sidebar-bg" />
      <div className="brand">
        <div className="brand-logo">
          <AppMark size={42} />
        </div>
        <div className="brand-text">
          <div className="brand-name">Video Library</div>
          <div className="brand-sub">
            {titles.length} title{titles.length === 1 ? '' : 's'}
          </div>
        </div>
        <button
          className="collapse-btn"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <IcExpand size={18} color="currentColor" variant="Linear" />
          ) : (
            <IcCollapse size={18} color="currentColor" variant="Linear" />
          )}
        </button>
      </div>

      <nav className="sidebar-nav">
        {top.map((it) => navItem(it))}
        <button
          className={`nav-item nav-library ${onLibraryPage && !libOpen ? 'active' : ''}`}
          onClick={() => setLibOpen((o) => !o)}
          title={collapsed ? 'Library' : undefined}
          aria-expanded={libOpen}
        >
          <IcLibrary
            size={18}
            color="currentColor"
            variant={onLibraryPage ? 'Bulk' : 'Linear'}
            className="nav-icon"
          />
          <span className="nav-label">Library</span>
          <IcChevronDown
            size={15}
            color="currentColor"
            variant="Linear"
            className={`nav-chev ${libOpen ? 'open' : ''}`}
          />
        </button>
        {libOpen && <div className="nav-group">{LIBRARIES.map((it) => navItem(it, 'nav-sub'))}</div>}
        {rest.map((it) => navItem(it))}
      </nav>

      <div className="sidebar-panels">
        <div className="panel sidebar-card">
          <div className="sc-summary">
            <div className="summary-label">
              <IcHistory size={13} color="currentColor" variant="Linear" /> Total watched
            </div>
            <div className="summary-value">{formatTime(watched)}</div>
          </div>
        </div>
      </div>

      <div className={`nav-theme-wrap ${themeOpen ? 'open' : ''}`} ref={themeRef}>
        <button
          className={`nav-item nav-theme ${themeOpen ? 'active' : ''}`}
          onClick={() => setThemeOpen((o) => !o)}
          title={collapsed ? 'Theme' : undefined}
          aria-haspopup="menu"
          aria-expanded={themeOpen}
        >
          <IcTheme size={18} color="currentColor" variant={themeOpen ? 'Bulk' : 'Linear'} className="nav-icon" />
          <span className="nav-label">Theme</span>
        </button>
        {themeOpen && (
          <div className="acct-pop theme-pop">
            {THEMES.map((t) => (
              <button key={t.id} className={`acct-opt ${theme === t.id ? 'on' : ''}`} onClick={() => pickTheme(t.id)}>
                <span className="theme-chip" style={{ background: t.dot }} />
                {t.label}
                {theme === t.id && <IcTick size={14} color="currentColor" variant="Bold" />}
              </button>
            ))}
            <div className="theme-pop-sep" />
            <button
              className="theme-pop-note"
              onClick={() => {
                setThemeOpen(false)
                openSettings()
              }}
            >
              Don&apos;t like the options you see? Go to <b>Settings</b> to make your own colour.
            </button>
          </div>
        )}
      </div>
      <button
        className={`nav-item nav-settings ${view === 'settings' ? 'active' : ''}`}
        onClick={() => setView('settings')}
        title={collapsed ? 'Settings' : undefined}
      >
        <IcSettings size={18} color="currentColor" variant={view === 'settings' ? 'Bulk' : 'Linear'} className="nav-icon" />
        <span className="nav-label">Settings</span>
      </button>
    </aside>
  )
}
