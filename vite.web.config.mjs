import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The web build: the desktop renderer (src/renderer/src) behind a browser
// bridge (src/web/api.js) instead of Electron's preload.
const at = (p) => resolve(dirname(fileURLToPath(import.meta.url)), p)

export default defineConfig({
  root: at('src/web'),
  base: './',
  // What the renderer checks (lib/platform.js) to drop desktop-only pieces.
  define: { 'import.meta.env.VITE_TARGET': JSON.stringify('web') },
  resolve: {
    alias: [{ find: '@renderer', replacement: at('src/renderer/src') }]
  },
  plugins: [react()],
  server: { port: 5183 },
  build: {
    outDir: at('dist-web'),
    emptyOutDir: true
  }
})
