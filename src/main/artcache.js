import { app, net, protocol } from 'electron'
import { createHash } from 'crypto'
import { existsSync, mkdirSync, promises as fsp } from 'fs'
import { join } from 'path'

/* Every cover, backdrop, logo and episode still, saved to disk the first time
   it loads. The art comes from metahub (stills redirect on to TMDB's CDN) over
   a phone hotspot that can't always reach those addresses, so without this a
   page you've opened ten times could still come up half blank.

   The renderer asks for vlart://art/?u=<the real URL>. A copy on disk is
   served straight away and the network is never touched; otherwise it's
   fetched (with retries), saved, then served. Only a 200 is saved: an unaired
   episode's still is a 404 today and a real picture next week. */

const SCHEME = 'vlart'
const TRIES = 3
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }
const MIME = Object.fromEntries(Object.entries(TYPES).map(([m, e]) => [e, m]))

let dir = ''
const inflight = new Map() // url → Promise<file|null>, so ten cards of one poster are one download

// Must run before app ready.
export function registerArtScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

const keyOf = (url) => createHash('sha1').update(url).digest('hex')

function onDisk(key) {
  for (const ext of Object.values(TYPES)) {
    const file = join(dir, `${key}.${ext}`)
    if (existsSync(file)) return file
  }
  return null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* Download one image to disk. Returns the file, or { status } for an answer
   that isn't worth retrying (a 404), or null when the network never came good. */
async function download(url, key) {
  for (let i = 0; i < TRIES; i++) {
    try {
      const res = await net.fetch(url, { bypassCustomProtocolHandlers: true })
      if (res.ok) {
        const ext = TYPES[(res.headers.get('content-type') || '').split(';')[0].trim()] || 'jpg'
        const file = join(dir, `${key}.${ext}`)
        const tmp = `${file}.tmp`
        await fsp.writeFile(tmp, Buffer.from(await res.arrayBuffer()))
        await fsp.rename(tmp, file)
        return file
      }
      if (res.status >= 400 && res.status < 500) return { status: res.status }
    } catch {
      /* dropped connection — try again */
    }
    if (i < TRIES - 1) await sleep(1000 * (i + 1))
  }
  return null
}

async function serve(file) {
  const ext = file.slice(file.lastIndexOf('.') + 1)
  return new Response(await fsp.readFile(file), {
    headers: { 'content-type': MIME[ext] || 'image/jpeg', 'cache-control': 'max-age=31536000' }
  })
}

// After app ready.
export function initArtCache() {
  dir = join(app.getPath('userData'), 'art-cache')
  mkdirSync(dir, { recursive: true })
  protocol.handle(SCHEME, async (req) => {
    const url = new URL(req.url).searchParams.get('u') || ''
    if (!/^https?:\/\//i.test(url)) return new Response(null, { status: 400 })
    const key = keyOf(url)
    const cached = onDisk(key)
    if (cached) return serve(cached)
    let job = inflight.get(url)
    if (!job) {
      job = download(url, key).finally(() => inflight.delete(url))
      inflight.set(url, job)
    }
    const got = await job
    if (typeof got === 'string') return serve(got)
    return new Response(null, { status: (got && got.status) || 502 })
  })
}
