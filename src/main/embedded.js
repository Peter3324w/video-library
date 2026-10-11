import { promises as fsp } from 'fs'
import { embeddedTitle } from '../shared/embedded'

/* The title written inside a file on disk. The parsing is in
   src/shared/embedded.js; this is the desktop's way of handing it bytes. */
export async function readEmbeddedTitle(path) {
  let fh
  try {
    fh = await fsp.open(path, 'r')
    const { size } = await fh.stat()
    const read = async (start, length) => {
      const buf = Buffer.alloc(length)
      const { bytesRead } = await fh.read(buf, 0, length, start)
      return buf.subarray(0, bytesRead)
    }
    return await embeddedTitle(path, size, read)
  } catch {
    return null
  } finally {
    if (fh) await fh.close().catch(() => {})
  }
}
