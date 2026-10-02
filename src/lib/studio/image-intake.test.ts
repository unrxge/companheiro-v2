import { test } from 'node:test'
import assert from 'node:assert/strict'
import { embeddedJpeg, IMAGE_ACCEPT, MAX_EDGE, TARGET_BYTES } from './image-intake'

/** A stand-in JPEG: the markers one really starts and ends with, padded out. */
function jpeg(size: number, fill = 0x7f): Uint8Array {
  const out = new Uint8Array(size)
  out.fill(fill)
  out[0] = 0xff; out[1] = 0xd8; out[2] = 0xff
  out[size - 2] = 0xff; out[size - 1] = 0xd9
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) { out.set(p, at); at += p.length }
  return out
}

/** TIFF's own header, which is what a .arw or .tiff opens with. */
const tiffHeader = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00])

test('a raw file yields the preview the camera wrote inside it', async () => {
  const raw = concat(tiffHeader, new Uint8Array(2048), jpeg(60_000))
  const found = embeddedJpeg(raw)
  assert.ok(found, 'found a preview')
  assert.equal(found.type, 'image/jpeg')
  assert.equal(found.size, 60_000)
})

test('of several previews it takes the biggest — the full frame, not the thumbnail', async () => {
  const raw = concat(tiffHeader, jpeg(12_000, 0x11), new Uint8Array(512), jpeg(400_000, 0x22))
  const found = embeddedJpeg(raw)
  assert.ok(found)
  assert.equal(found.size, 400_000)
})

test('a thumbnail too small to be worth showing is not taken', () => {
  assert.equal(embeddedJpeg(concat(tiffHeader, jpeg(2_000))), null)
})

test('a file with no jpeg in it yields nothing', () => {
  const noise = new Uint8Array(40_000)
  for (let i = 0; i < noise.length; i++) noise[i] = (i * 7) % 251
  assert.equal(embeddedJpeg(noise), null)
})

test('an empty file yields nothing', () => {
  assert.equal(embeddedJpeg(new Uint8Array(0)), null)
})

test('a plain jpeg is read as its own whole self', () => {
  const found = embeddedJpeg(jpeg(100_000))
  assert.ok(found)
  assert.equal(found.size, 100_000)
})

test('the scan does not run away on a file that starts a jpeg and never ends it', () => {
  const broken = concat(new Uint8Array([0xff, 0xd8, 0xff]), new Uint8Array(100_000))
  assert.equal(embeddedJpeg(broken), null)
})

test('the picker offers the formats people actually have, raw included', () => {
  for (const ext of ['.jpg', '.png', '.webp', '.heic', '.tiff', '.arw', '.cr2', '.nef', '.dng']) {
    assert.ok(IMAGE_ACCEPT.includes(ext), `${ext} is offered`)
  }
  assert.ok(IMAGE_ACCEPT.includes('image/*'), 'and anything else the browser can read')
})

test('what is stored is web-sized, not camera-sized', () => {
  assert.equal(MAX_EDGE, 2560)
  assert.ok(TARGET_BYTES <= 4 * 1024 * 1024, 'a few MB at most')
})
