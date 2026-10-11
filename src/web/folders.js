import { MAX_DEPTH, MIN_BYTES, SKIP_DIR, SKIP_FILE, VIDEO } from '../shared/scan-rules'

/* Reading a folder from a web page. Two ways in, because browsers differ:

   - Chrome and Edge have the File System Access API: the visitor picks a
     folder and the page gets a handle it can walk, keep in IndexedDB and ask
     to use again on the next visit.
   - Firefox and Safari don't. There a folder <input> hands over every file in
     it, good until the tab closes; next visit the folder is picked again.

   Either way the result is the same listing the desktop scanner builds:
   { rel, name, size, source }, where `source` is whatever can produce a File. */

export const hasPicker = typeof window.showDirectoryPicker === 'function'
export const hasFolderInput = 'webkitdirectory' in HTMLInputElement.prototype

const wanted = (name) => VIDEO.test(name) && !SKIP_FILE.test(name)

async function walk(dir, depth, prefix, out) {
  try {
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'directory') {
        if (depth < MAX_DEPTH && !SKIP_DIR.test(name)) await walk(h, depth + 1, `${prefix}${name}/`, out)
      } else if (wanted(name)) {
        try {
          const { size } = await h.getFile()
          if (size >= MIN_BYTES) out.push({ rel: prefix + name, name, size, source: h })
        } catch {
          /* vanished mid-scan */
        }
      }
    }
  } catch {
    /* unreadable or gone: skip, don't fail the whole scan */
  }
}

export async function listHandle(handle) {
  const out = []
  await walk(handle, 0, '', out)
  return out
}

// The same rules over a folder <input>'s flat list ("Folder/sub/file.mkv").
export function listFiles(files) {
  const out = []
  for (const file of files) {
    const parts = (file.webkitRelativePath || file.name).split('/').slice(1)
    const name = parts.pop() || file.name
    if (parts.length > MAX_DEPTH || parts.some((d) => SKIP_DIR.test(d))) continue
    if (wanted(name) && file.size >= MIN_BYTES) out.push({ rel: [...parts, name].join('/'), name, size: file.size, source: file })
  }
  return out
}

function pickWithInput() {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.multiple = true
    input.addEventListener('change', () => {
      const files = [...input.files]
      if (!files.length) return resolve(null)
      resolve({ name: (files[0].webkitRelativePath || '').split('/')[0] || 'Folder', files })
    })
    input.addEventListener('cancel', () => resolve(null))
    input.click()
  })
}

/* Ask for a folder. Resolves to { name, handle } or { name, files }, or null
   when the visitor closes the picker. Must be called from a click. */
export async function pickFolder() {
  if (!hasPicker) return hasFolderInput ? pickWithInput() : null
  try {
    const handle = await window.showDirectoryPicker({ id: 'video-library', mode: 'read' })
    return { name: handle.name, handle }
  } catch {
    return null // closed, or the browser refused the folder (system folders)
  }
}

// Is a kept handle usable right now, without asking?
export async function canRead(handle) {
  try {
    return (await handle.queryPermission({ mode: 'read' })) === 'granted'
  } catch {
    return false
  }
}

// Ask to use a kept handle again. Must be called from a click.
export async function askToRead(handle) {
  try {
    return (await handle.requestPermission({ mode: 'read' })) === 'granted'
  } catch {
    return false
  }
}

export const fileOf = (source) => (source instanceof File ? source : source.getFile())
