import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  K_MAX, K_MIN, applyWheel, clampK, fit, pinch, screenToWorld, visibleWorldRect,
  wheelDelta, worldToScreen, zoomAt, zoomStep,
} from '@/lib/studio/engine/viewport'
import type { Viewport } from '@/lib/studio/types'

const V: Viewport = { tx: 80, ty: 80, k: 1 }
const near = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) < tol, `${a} ≈ ${b}`)

test('screen and world are inverses at any zoom', () => {
  for (const k of [0.1, 0.37, 1, 2.5, 3]) {
    const v = { tx: -412, ty: 96, k }
    const p = { x: 321, y: -87 }
    const back = worldToScreen(v, screenToWorld(v, p))
    near(back.x, p.x, 1e-9)
    near(back.y, p.y, 1e-9)
  }
})

test('zoomAt keeps the world point under the cursor still', () => {
  const cursor = { x: 640, y: 300 }
  const before = screenToWorld(V, cursor)
  const after = screenToWorld(zoomAt(V, cursor, 2.4), cursor)
  near(after.x, before.x, 1e-9)
  near(after.y, before.y, 1e-9)
})

test('k is clamped in both directions and zoomAt respects it', () => {
  assert.equal(clampK(99), K_MAX)
  assert.equal(clampK(0), K_MIN)
  assert.equal(zoomAt(V, { x: 0, y: 0 }, 50).k, K_MAX)
  assert.equal(zoomAt(V, { x: 0, y: 0 }, 0.0001).k, K_MIN)
})

test('fit centres the rect with padding and never zooms past the cap', () => {
  const v = fit({ x: 0, y: 0, w: 1000, h: 500 }, 1200, 800)
  // 1200 - 160 = 1040 wide available, so k is capped by width at 1.04
  near(v.k, 1.04, 1e-9)
  const tl = worldToScreen(v, { x: 0, y: 0 })
  const br = worldToScreen(v, { x: 1000, y: 500 })
  near((tl.x + (1200 - br.x)) / 2, tl.x, 1.5)          // equal margins left/right
  near((tl.y + (800 - br.y)) / 2, tl.y, 1.5)
})

test('fit on a tiny rect stops at FIT_K_MAX, not at whatever fills the screen', () => {
  assert.equal(fit({ x: 0, y: 0, w: 10, h: 10 }, 1200, 800).k, 1.25)
})

test('wheel deltas are normalised per delta mode', () => {
  assert.deepEqual(wheelDelta({ deltaX: 2, deltaY: 3, deltaMode: 0 }, 800), { x: 2, y: 3 })
  assert.deepEqual(wheelDelta({ deltaX: 1, deltaY: 2, deltaMode: 1 }, 800), { x: 16, y: 32 })
  assert.deepEqual(wheelDelta({ deltaX: 0, deltaY: 1, deltaMode: 2 }, 800), { x: 0, y: 800 })
})

test('a plain wheel pans and a ctrl wheel zooms about the cursor', () => {
  const panned = applyWheel(V, { deltaX: 10, deltaY: 20, deltaMode: 0 }, { x: 0, y: 0 }, 800)
  assert.deepEqual(panned, { k: 1, tx: 70, ty: 60 })

  const cursor = { x: 500, y: 400 }
  const zoomed = applyWheel(V, { deltaX: 0, deltaY: -100, deltaMode: 0, ctrlKey: true }, cursor, 800)
  assert.ok(zoomed.k > 1, 'scrolling up with ctrl zooms in')
  near(screenToWorld(zoomed, cursor).x, screenToWorld(V, cursor).x, 1e-9)
})

test('shift with no lateral delta pans sideways', () => {
  assert.deepEqual(
    applyWheel(V, { deltaX: 0, deltaY: 30, deltaMode: 0, shiftKey: true }, { x: 0, y: 0 }, 800),
    { k: 1, tx: 50, ty: 80 },
  )
})

test('pinch scales about the midpoint and then follows it', () => {
  const v = pinch(V, { x: 100, y: 100 }, 100, { x: 140, y: 100 }, 200)
  near(v.k, 2)
  // the world point under the original midpoint moved with the fingers
  near(worldToScreen(v, screenToWorld(V, { x: 100, y: 100 })).x, 140, 1e-6)
})

test('zoomStep works about the stage centre', () => {
  const v = zoomStep(V, 1.2, 1000, 600)
  near(v.k, 1.2)
  near(screenToWorld(v, { x: 500, y: 300 }).x, screenToWorld(V, { x: 500, y: 300 }).x, 1e-9)
})

test('visibleWorldRect grows by the margin on every side', () => {
  const r = visibleWorldRect({ tx: 0, ty: 0, k: 1 }, 1000, 800, 400)
  assert.deepEqual(r, { x: -400, y: -400, w: 1800, h: 1600 })
})

test('at half zoom the visible world is twice the viewport', () => {
  const r = visibleWorldRect({ tx: 0, ty: 0, k: 0.5 }, 1000, 800, 0)
  assert.deepEqual(r, { x: 0, y: 0, w: 2000, h: 1600 })
})
