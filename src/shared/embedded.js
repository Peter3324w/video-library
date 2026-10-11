/* The title a release group wrote INTO the file. Some sites scramble the file
   name ("tfpdl-tno10172x.mkv") but leave the real one inside — that file says
   "TFPDL - The.Night.Of.S01E01". Reading it costs a few KB from the start of
   the file (and, for MP4, the end), no ffprobe needed.

   Plain Uint8Arrays throughout, so the desktop app (reading with fs) and the
   web build (reading a slice of a File) share it. `read(start, length)` is
   the caller's and resolves to the bytes. */

const MAX_LEN = 200
const utf8 = new TextDecoder('utf-8')

function clean(text) {
  const t = String(text || '').replace(/\0+$/, '').trim()
  // Real titles are printable text; random bytes that happen to follow a
  // matching tag are not.
  if (t.length < 2 || t.length > MAX_LEN || /[\x00-\x08\x0e-\x1f�]/.test(t)) return null
  return t
}

// Where `bytes` next appears in `buf` at or after `from`, or -1.
function find(buf, bytes, from = 0) {
  for (let i = buf.indexOf(bytes[0], from); i >= 0; i = buf.indexOf(bytes[0], i + 1)) {
    let k = 1
    while (k < bytes.length && buf[i + k] === bytes[k]) k++
    if (k === bytes.length) return i
  }
  return -1
}

/* Matroska: the segment's Info › Title element, ID 0x7BA9, then an EBML
   variable-length size. Info sits in the first few KB. */
const MKV_TITLE = [0x7b, 0xa9]
function mkvTitle(buf) {
  for (let i = find(buf, MKV_TITLE); i >= 0; i = find(buf, MKV_TITLE, i + 1)) {
    const first = buf[i + 2]
    if (!first) continue
    let len = 1
    while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++
    if (len > 8) continue
    let size = first & (0xff >> len)
    for (let k = 1; k < len; k++) size = size * 256 + buf[i + 2 + k]
    const startAt = i + 2 + len
    if (size <= 0 || size > MAX_LEN || startAt + size > buf.length) continue
    const t = clean(utf8.decode(buf.subarray(startAt, startAt + size)))
    if (t) return t
  }
  return null
}

/* MP4: moov › udta › meta › ilst › ©nam › data. The moov box is at the start
   of a "fast start" file and at the END of most others, so both ends are read. */
const MP4_NAM = [0xa9, 0x6e, 0x61, 0x6d] // ©nam
const MP4_DATA = [0x64, 0x61, 0x74, 0x61] // data
function mp4Title(buf) {
  for (let i = find(buf, MP4_NAM); i >= 0; i = find(buf, MP4_NAM, i + 1)) {
    if (i + 20 > buf.length || MP4_DATA.some((b, k) => buf[i + 8 + k] !== b)) continue
    const dataSize = ((buf[i + 4] << 24) | (buf[i + 5] << 16) | (buf[i + 6] << 8) | buf[i + 7]) >>> 0
    const t = clean(utf8.decode(buf.subarray(i + 20, i + 4 + dataSize)))
    if (t) return t
  }
  return null
}

export async function embeddedTitle(fileName, size, read) {
  const head = await read(0, Math.min(size, 256 * 1024))
  if (/\.(mkv|webm)$/i.test(fileName)) return mkvTitle(head)
  if (/\.(mp4|m4v|mov)$/i.test(fileName)) {
    const hit = mp4Title(head)
    if (hit || size <= head.length) return hit
    const tailLen = Math.min(size, 4 * 1024 * 1024)
    return mp4Title(await read(size - tailLen, tailLen))
  }
  return null
}
