// Getting a photograph onto the canvas, whatever came out of the camera.
//
// Three things are going on here, and all three are decided for the person
// rather than asked about:
//
//  1. WHAT IS ACCEPTED is decided by what the browser can actually decode,
//     not by a list of extensions. If it decodes, it can be shown; a list
//     would both refuse formats a browser has since learned (HEIC, AVIF) and
//     accept ones it never could.
//  2. RAW AND TIFF, which no browser decodes on its own, are read through the
//     full-size JPEG preview the camera already wrote inside the file. That
//     is what makes a .arw or .tiff usable here at all.
//  3. SIZE is settled by downsizing, not by refusing. A 60 MB photograph
//     becomes a web-sized picture on the way in; nothing is uploaded at
//     camera resolution, because nothing on this canvas is ever shown that
//     large. Only a file that cannot be read at all is turned away.

/** The longest edge anything is stored at. A canvas block is 960 px at most. */
export const MAX_EDGE = 2560
/** What a stored picture should come in under, after downsizing. */
export const TARGET_BYTES = 3 * 1024 * 1024
/** Bigger than this and we do not even try to decode it. */
export const MAX_INTAKE_BYTES = 80 * 1024 * 1024
/** Already-web-safe files under this are passed through untouched. */
export const PASS_THROUGH_BYTES = 1024 * 1024

/** What the file picker offers. Breadth is deliberate; the decode decides. */
export const IMAGE_ACCEPT = [
  'image/*',
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif',
  '.heic', '.heif', '.tif', '.tiff',
  '.arw', '.cr2', '.cr3', '.nef', '.orf', '.raf', '.rw2', '.dng',
].join(',')

/** Formats a browser can show as they are, so no re-encoding is needed. */
const WEB_SAFE: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])

export class ImageIntakeError extends Error {}

export interface IntakeResult {
  file: Blob
  mime: string
  ext: string
  width: number
  height: number
  /** True when it was re-encoded or shrunk on the way in. */
  changed: boolean
}

const EXT_OF: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
}

/**
 * The biggest JPEG stored inside another file. Camera RAW and most TIFFs
 * carry one or more JPEG previews — often the full frame — and that is the
 * only way to show them without a RAW decoder. Found by scanning for the
 * markers a JPEG begins and ends with rather than by walking the directory
 * structure, because every maker lays that out differently.
 */
export function embeddedJpeg(bytes: Uint8Array): Blob | null {
  let best: { start: number; end: number } | null = null
  const limit = bytes.length - 1
  for (let i = 0; i < limit; i++) {
    // start of image: FF D8 FF
    if (bytes[i] !== 0xff || bytes[i + 1] !== 0xd8 || bytes[i + 2] !== 0xff) continue
    for (let j = i + 3; j < limit; j++) {
      // end of image: FF D9
      if (bytes[j] !== 0xff || bytes[j + 1] !== 0xd9) continue
      const end = j + 2
      if (!best || end - i > best.end - best.start) best = { start: i, end }
      i = end - 1
      break
    }
  }
  if (!best || best.end - best.start < 8 * 1024) return null
  return new Blob([bytes.slice(best.start, best.end)], { type: 'image/jpeg' })
}

/** Decodes with whatever the browser has; null when it cannot read it at all. */
async function decode(file: Blob): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file)
  } catch {
    return null
  }
}

/** Draws at a size and asks for WebP, falling back to JPEG where it is not offered. */
async function encode(bitmap: ImageBitmap, scale: number, quality: number): Promise<{ blob: Blob; w: number; h: number } | null> {
  const w = Math.max(1, Math.round(bitmap.width * scale))
  const h = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, w, h)
  for (const type of ['image/webp', 'image/jpeg']) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
    if (blob && blob.size > 0) return { blob, w, h }
  }
  return null
}

/**
 * Takes whatever was chosen and returns something storable and showable, or
 * throws with a sentence fit to show. Nothing here asks the person anything.
 */
export async function intakeImage(file: Blob): Promise<IntakeResult> {
  if (file.size <= 0) throw new ImageIntakeError('That file is empty.')
  if (file.size > MAX_INTAKE_BYTES) {
    throw new ImageIntakeError('That photograph is over 80 MB. Export a smaller copy and add that.')
  }
  const mime = file.type.toLowerCase().split(';')[0].trim()

  // A small web-safe file is already what we would make of it.
  let bitmap = await decode(file)
  if (bitmap && WEB_SAFE.has(mime) && file.size <= PASS_THROUGH_BYTES
      && Math.max(bitmap.width, bitmap.height) <= MAX_EDGE) {
    const out = { file, mime, ext: EXT_OF[mime], width: bitmap.width, height: bitmap.height, changed: false }
    bitmap.close()
    return out
  }

  // RAW, TIFF, HEIC on a browser that cannot read them: the camera's own
  // preview is in there, and it is a JPEG.
  if (!bitmap) {
    const inner = embeddedJpeg(new Uint8Array(await file.arrayBuffer()))
    if (inner) bitmap = await decode(inner)
  }
  if (!bitmap) {
    throw new ImageIntakeError(
      'That photograph could not be read in the browser. A JPEG, PNG, WebP or HEIC export of it will work.',
    )
  }

  // Down to the long edge first, then on quality, until it is small enough.
  const fit = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const attempts: Array<{ scale: number; quality: number }> = [
    { scale: fit, quality: 0.86 },
    { scale: fit, quality: 0.72 },
    { scale: fit * 0.7, quality: 0.72 },
    { scale: fit * 0.5, quality: 0.68 },
    { scale: fit * 0.35, quality: 0.62 },
  ]
  let best: { blob: Blob; w: number; h: number } | null = null
  for (const attempt of attempts) {
    const made = await encode(bitmap, attempt.scale, attempt.quality)
    if (!made) continue
    best = made
    if (made.blob.size <= TARGET_BYTES) break
  }
  bitmap.close()

  if (!best) {
    // Nothing could be drawn, but the bytes decoded: send what we have if it
    // is already web-safe and small enough to store.
    if (WEB_SAFE.has(mime) && file.size <= TARGET_BYTES * 2) {
      return { file, mime, ext: EXT_OF[mime], width: 0, height: 0, changed: false }
    }
    throw new ImageIntakeError('That photograph could not be prepared. Try a JPEG or PNG export of it.')
  }
  if (best.blob.size > TARGET_BYTES * 2) {
    throw new ImageIntakeError('That photograph is too large to store, even reduced. Export a smaller copy.')
  }

  const outMime = best.blob.type || 'image/webp'
  return {
    file: best.blob,
    mime: outMime,
    ext: EXT_OF[outMime] ?? 'webp',
    width: best.w,
    height: best.h,
    changed: true,
  }
}
