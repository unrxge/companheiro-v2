// studio/src/lib/studio/media/resize.ts — client-side image resize (lane E, D-059).
// Every image is shrunk in the browser before it is uploaded: the main copy fits a
// 1600 px longest edge, the thumb is 480 px wide. Sizes come from here, never from
// storage transforms. `fitWithin` is pure so it can be unit-tested with tsx.

export const MAX_EDGE = 1600
export const THUMB_W = 480
const MAIN_QUALITY = 0.86
const THUMB_QUALITY = 0.8

export interface ResizedImage {
  /** The main copy (webp when the browser can encode it, else jpeg). */
  blob: Blob
  /** The 480 px-wide thumb (webp when possible). */
  thumb: Blob
  width: number
  height: number
  aspect: number
  /** The main copy's mime, e.g. 'image/webp'. */
  mime: string
  /** File extension matching `mime`. */
  ext: string
}

/** Scale (w, h) so the longest edge is ≤ maxEdge; never upscales; rounds to whole px (≥ 1). */
export function fitWithin(w: number, h: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(w, h)
  if (longest <= maxEdge) return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) }
  const r = maxEdge / longest
  return { width: Math.max(1, Math.round(w * r)), height: Math.max(1, Math.round(h * r)) }
}

/** Scale to an exact width; never upscales. */
export function fitWidth(w: number, h: number, targetW: number): { width: number; height: number } {
  if (w <= targetW) return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) }
  const r = targetW / w
  return { width: targetW, height: Math.max(1, Math.round(h * r)) }
}

export function extForMime(mime: string): string {
  switch (mime) {
    case 'image/webp': return 'webp'
    case 'image/jpeg': return 'jpg'
    case 'image/png': return 'png'
    case 'image/gif': return 'gif'
    case 'image/avif': return 'avif'
    case 'audio/webm': return 'webm'
    case 'audio/mp4': return 'm4a'
    case 'audio/mpeg': return 'mp3'
    case 'audio/wav': return 'wav'
    case 'audio/ogg': return 'ogg'
    default: return 'bin'
  }
}

type Drawable = ImageBitmap | HTMLImageElement | HTMLCanvasElement

async function decode(file: Blob): Promise<{ img: Drawable; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { img: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() }
    } catch {
      // fall through to the <img> path (some browsers refuse certain formats here)
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('that file could not be read as an image'))
      el.src = url
    })
    return { img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    throw e
  }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality))
}

/** Encode as webp; if the browser answers with another type (older Safari), fall back to jpeg. */
async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const webp = await toBlob(canvas, 'image/webp', quality)
  if (webp && webp.type === 'image/webp') return webp
  const jpeg = await toBlob(canvas, 'image/jpeg', quality)
  if (jpeg) return jpeg
  throw new Error('the image could not be encoded')
}

function draw(img: Drawable, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) throw new Error('no 2d canvas')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return canvas
}

/**
 * Resize a picked file to the 1600 px main copy and the 480 px thumb. Runs entirely
 * in the browser; the original bytes never leave the machine.
 */
export async function resizeImage(file: Blob): Promise<ResizedImage> {
  if (typeof document === 'undefined') throw new Error('resizeImage needs a browser')
  const { img, width: sw, height: sh, release } = await decode(file)
  try {
    if (sw < 1 || sh < 1) throw new Error('that image has no size')
    const main = fitWithin(sw, sh, MAX_EDGE)
    const thumbSize = fitWidth(main.width, main.height, THUMB_W)
    const mainCanvas = draw(img, main.width, main.height)
    const blob = await encode(mainCanvas, MAIN_QUALITY)
    const thumbCanvas = draw(mainCanvas, thumbSize.width, thumbSize.height)
    const thumb = await encode(thumbCanvas, THUMB_QUALITY)
    return {
      blob,
      thumb,
      width: main.width,
      height: main.height,
      aspect: main.width / main.height,
      mime: blob.type,
      ext: extForMime(blob.type),
    }
  } finally {
    release()
  }
}
