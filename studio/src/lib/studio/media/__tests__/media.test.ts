import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extForMime, fitWidth, fitWithin, MAX_EDGE, THUMB_W } from '@/lib/studio/media/resize'
import { ENVELOPE_BARS, envelopeFromSamples, formatDuration } from '@/lib/studio/media/waveform'

test('fitWithin: never upscales, shrinks the longest edge to the cap, keeps the ratio', () => {
  assert.deepEqual(fitWithin(800, 600, MAX_EDGE), { width: 800, height: 600 })
  assert.deepEqual(fitWithin(4000, 3000, MAX_EDGE), { width: 1600, height: 1200 })
  assert.deepEqual(fitWithin(3000, 4000, MAX_EDGE), { width: 1200, height: 1600 })
  const r = fitWithin(5001, 1000, MAX_EDGE)
  assert.equal(r.width, 1600)
  assert.ok(Math.abs(r.width / r.height - 5.001) < 0.02)
  assert.deepEqual(fitWithin(1, 1, MAX_EDGE), { width: 1, height: 1 })
})

test('fitWidth: 480-wide thumb, never wider than the source', () => {
  assert.deepEqual(fitWidth(1600, 1200, THUMB_W), { width: 480, height: 360 })
  assert.deepEqual(fitWidth(320, 240, THUMB_W), { width: 320, height: 240 })
  assert.equal(fitWidth(1600, 3, THUMB_W).height, 1)
})

test('extForMime maps the bucket mimes and falls back to bin', () => {
  assert.equal(extForMime('image/webp'), 'webp')
  assert.equal(extForMime('image/jpeg'), 'jpg')
  assert.equal(extForMime('audio/mp4'), 'm4a')
  assert.equal(extForMime('text/html'), 'bin')
})

test('envelopeFromSamples: 24 bars, 0..1, peak-normalised, silence is zeros', () => {
  const silent = envelopeFromSamples(new Float32Array(4800))
  assert.equal(silent.length, ENVELOPE_BARS)
  assert.ok(silent.every((v) => v === 0))

  const n = 2400
  const samples = new Float32Array(n)
  // loud first half, quiet second half
  for (let i = 0; i < n; i++) samples[i] = (i < n / 2 ? 0.8 : 0.2) * (i % 2 === 0 ? 1 : -1)
  const env = envelopeFromSamples(samples)
  assert.equal(env.length, ENVELOPE_BARS)
  assert.ok(env.every((v) => v >= 0 && v <= 1))
  assert.equal(Math.max(...env), 1)
  assert.ok(env[0] > env[ENVELOPE_BARS - 1])
  assert.ok(Math.abs(env[ENVELOPE_BARS - 1] - 0.25) < 0.01)
})

test('envelopeFromSamples: short clips still yield every bar', () => {
  const env = envelopeFromSamples([0.5, -0.5, 0.1])
  assert.equal(env.length, ENVELOPE_BARS)
  assert.ok(env.every((v) => Number.isFinite(v)))
})

test('formatDuration: m:ss, h:mm:ss, floors, tolerates junk', () => {
  assert.equal(formatDuration(0), '0:00')
  assert.equal(formatDuration(42.9), '0:42')
  assert.equal(formatDuration(725), '12:05')
  assert.equal(formatDuration(3729), '1:02:09')
  assert.equal(formatDuration(null), '0:00')
  assert.equal(formatDuration(-3), '0:00')
})
