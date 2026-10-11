import { createWebApi } from './api'

// Imported first in main.jsx: every renderer module reads window.api as it loads.
window.api = createWebApi()
