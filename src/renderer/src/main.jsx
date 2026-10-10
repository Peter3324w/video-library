import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// Styles. 00–13 are the shared design system, kept as-is; ORDER IS SIGNIFICANT,
// the cascade depends on it. New rules go in 20-media.css.
import './styles/00-base.css' // :root tokens, themes, reset
import './styles/01-window-library.css' // window controls, drag strip
import './styles/05-sidebar.css' // sidebar layout, collapse, nav items
import './styles/06-shell-chrome.css' // page header, dropdowns, buttons
import './styles/07-home.css' // home dashboard, hero, poster cards
import './styles/11-settings-modals.css' // settings, theme + accent picker
import './styles/12-scan-onboarding.css' // content scrollbar
import './styles/13-library-misc.css' // toasts, library grid/list
import './styles/20-media.css' // this app's own rules

createRoot(document.getElementById('root')).render(<App />)

requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    const splash = document.getElementById('boot-splash')
    if (!splash) return
    splash.classList.add('boot-hide')
    setTimeout(() => splash.remove(), 400)
  })
)
