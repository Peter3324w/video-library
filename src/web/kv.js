/* IndexedDB as a key-value box. Two things live in it: the library (the web
   build's data.json) and the folder handles the browser lets a page keep. */

const DB_NAME = 'video-library-web'
const KV = 'kv'

let dbPromise = null
function db() {
  if (!dbPromise)
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(KV)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  return dbPromise
}

export async function kvGet(key) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const req = d.transaction(KV).objectStore(KV).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function kvSet(key, value) {
  const d = await db()
  return new Promise((resolve, reject) => {
    const tx = d.transaction(KV, 'readwrite')
    tx.objectStore(KV).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
