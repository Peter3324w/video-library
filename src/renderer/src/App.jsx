import React, { useCallback, useEffect, useState } from 'react'
import { applyAppearance } from './lib/util'
import { Sidebar, WindowControls, LIBRARIES } from './components/Sidebar'
import { HomeView } from './views/Home'
import { LibraryView } from './views/Library'
import { HistoryView } from './views/History'
import { FavouritesView } from './views/Favourites'
import { Settings } from './views/Settings'
import { TitleView } from './views/Title'

const api = window.api
const EMPTY_LIBRARY = { titles: [], files: [], history: [] }

export default function App() {
  const [view, setView] = useState('home')
  const [library, setLibrary] = useState(EMPTY_LIBRARY)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('vlCollapsed') === '1')

  // Theme + accent. Main owns the setting; the renderer only stamps it.
  useEffect(() => {
    api.getSettings().then((s) => applyAppearance(s && s.theme, s && s.accent))
  }, [])

  useEffect(() => {
    api.getLibrary().then((l) => setLibrary(l || EMPTY_LIBRARY))
    return api.onLibrary((l) => setLibrary(l || EMPTY_LIBRARY))
  }, [])

  useEffect(() => {
    localStorage.setItem('vlCollapsed', collapsed ? '1' : '0')
  }, [collapsed])

  const lib = LIBRARIES.find((l) => l.id === view)
  /* A title's page. Back returns to whichever page opened it, so it's held
     beside the view rather than being a view of its own in the sidebar. */
  const [openTitle, setOpenTitle] = useState(null)
  const showTitle = (id) => {
    setOpenTitle(id)
    document.querySelector('.content')?.scrollTo(0, 0)
  }
  const nav = (v) => {
    setOpenTitle(null)
    setView(v)
  }
  // The sidebar bleeds the art of whatever Home is featuring.
  const [sidebarBg, setSidebarBg] = useState(null)
  const onFeatured = useCallback((img) => setSidebarBg(img), [])
  // A toast, not window.alert: the OS alert is Windows chrome in the
  // middle of a frameless black app.
  const [toast, setToast] = useState(null)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])
  const play = async (file, opts) => {
    const r = await api.play(file.id, opts)
    if (r && !r.ok) setToast({ title: 'Can’t play that', body: r.error })
  }

  return (
    <div className="app">
      <div className="body">
        <Sidebar
          view={view}
          setView={nav}
          openSettings={() => nav('settings')}
          library={library}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
          bgImg={sidebarBg}
        />
        <main className="content">
          {openTitle ? (
            <TitleView titleId={openTitle} library={library} onPlay={play} onBack={() => setOpenTitle(null)} />
          ) : (
            <>
              {view === 'home' && (
                <HomeView library={library} onPlay={play} onFeatured={onFeatured} onNav={nav} onOpenTitle={showTitle} />
              )}
              {lib && <LibraryView key={lib.id} category={lib} library={library} onOpenTitle={showTitle} />}
              {view === 'history' && <HistoryView library={library} onPlay={play} onOpenTitle={showTitle} />}
              {view === 'favourites' && <FavouritesView library={library} />}
              {view === 'settings' && <Settings />}
            </>
          )}
        </main>
      </div>
      <div className="drag-strip" aria-hidden="true" />
      <WindowControls />
      {toast && (
        <div className="toast-stack">
          <div className="toast">
            <div className="toast-body">
              <div className="toast-title">{toast.title}</div>
              <div className="toast-text">{toast.body}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
