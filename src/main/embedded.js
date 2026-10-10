import { promises as fsp } from 'fs'

/* The title a release group wrote INTO the file. Some sites scramble the file
   name ("tfpdl-tno10172x.mkv") but leave the real one inside — that file says
   "TFPDL - The.Night.Of.S01E01". Reading it costs a few KB from the start of
   the file (and, for MP4, the end), no ffprobe needed. */

const MAX_LEN = 200

function clean(text) {
  const t = String(text || '').replace(/\0+$/, '').trim()
  // Real titles are printable text; random bytes that happen to follow a
  // matching tag are not.
  if (t.length < 2 || t.length > MAX_LEN || /[\x00-\x08\x0e-\x1f�]/.test(t)) return null
  return t
}

async function readRange(fh, start, length) {
  const buf = Buffer.alloc(length)
  const { bytesRead } = await fh.read(buf, 0, length, start)
  return buf.subarray(0, bytesRead)
}

/* Matroska: the segment's Info › Title element, ID 0x7BA9, then an EBML
   variable-length size. Info sits in the first few KB. */
function mkvTitle(buf) {
  for (let i = buf.indexOf(Buffer.from([0x7b, 0xa9])); i >= 0; i = buf.indexOf(Buffer.from([0x7b, 0xa9]), i + 1)) {
    const first = buf[i + 2]
    if (!first) continue
    let len = 1
    while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++
    if (len > 8) continue
    let size = first & (0xff >> len)
    for (let k = 1; k < len; k++) size = size * 256 + buf[i + 2 + k]
    const startAt = i + 2 + len
    if (size <= 0 || size > MAX_LEN || startAt + size > buf.length) continue
    const t = clean(buf.subarray(startAt, startAt + size).toString('utf8'))
    if (t) return t
  }
  return null
}

/* MP4: moov › udta › meta › ilst › ©nam › data. The moov box is at the start
   of a "fast start" file and at the END of most others, so both ends are read. */
function mp4Title(buf) {
  const tag = Buffer.from([0xa9, 0x6e, 0x61, 0x6d]) // ©nam
  for (let i = buf.indexOf(tag); i >= 0; i = buf.indexOf(tag, i + 1)) {
    if (buf.toString('latin1', i + 8, i + 12) !== 'data') continue
    const dataSize = buf.readUInt32BE(i + 4)
    const text = buf.subarray(i + 20, i + 4 + dataSize)
    const t = clean(text.toString('utf8'))
    if (t) return t
  }
  return null
}

export async function readEmbeddedTitle(path) {
  let fh
  try {
    fh = await fsp.open(path, 'r')
    const { size } = await fh.stat()
    const head = await readRange(fh, 0, Math.min(size, 256 * 1024))
    if (/\.(mkv|webm)$/i.test(path)) return mkvTitle(head)
    if (/\.(mp4|m4v|mov)$/i.test(path)) {
      const hit = mp4Title(head)
      if (hit || size <= head.length) return hit
      const tailLen = Math.min(size, 4 * 1024 * 1024)
      return mp4Title(await readRange(fh, size - tailLen, tailLen))
    }
    return null
  } catch {
    return null
  } finally {
    if (fh) await fh.close().catch(() => {})
  }
}
