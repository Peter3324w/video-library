import './install-api' // must stay first: it puts window.api in place
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from '@renderer/App.jsx'

// The desktop app's styles, same order (see src/renderer/src/main.jsx).
import '@renderer/styles/00-base.css'
import '@renderer/styles/01-window-library.css'
import '@renderer/styles/05-sidebar.css'
import '@renderer/styles/06-shell-chrome.css'
import '@renderer/styles/07-home.css'
import '@renderer/styles/11-settings-modals.css'
import '@renderer/styles/12-scan-onboarding.css'
import '@renderer/styles/13-library-misc.css'
import '@renderer/styles/20-media.css'
import '@renderer/styles/22-web.css' // web only: the in-page player, reconnecting folders

createRoot(document.getElementById('root')).render(<App />)

requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    const splash = document.getElementById('boot-splash')
    if (!splash) return
    splash.classList.add('boot-hide')
    setTimeout(() => splash.remove(), 400)
  })
)
