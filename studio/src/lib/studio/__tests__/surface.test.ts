import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MARGIN, ZOOM, centreOn, clampPan, clampToWorld, clampZoom, deskSlot, freeSlot, hashOf,
  laneCardWidth, laneIndexAt, laneSlot, laneWorld, overlaps, packRow, tiltOf, toScreen, toWorld, zoomAbout,
} from '@/lib/studio/surface'

const frame = { w: 1200, h: 800 }

test('a world smaller than the window is centred, not cornered', () => {
  const pan = clampPan({ x: -500, y: -500 }, 1, { w: 400, h: 300 }, frame)
  assert.equal(pan.x, (1200 - 400) / 2)
  assert.equal(pan.y, (800 - 300) / 2)
})

test('a world larger than the window stays reachable at both ends', () => {
  const world = { w: 4000, h: 2000 }
  const far = clampPan({ x: -99999, y: -99999 }, 1, world, frame)
  assert.equal(far.x, frame.w - world.w - MARGIN)
  assert.equal(far.y, frame.h - world.h - MARGIN)

  const near = clampPan({ x: 99999, y: 99999 }, 1, world, frame)
  assert.equal(near.x, MARGIN)
  assert.equal(near.y, MARGIN)
})

test('zoom changes what counts as too far', () => {
  const world = { w: 2000, h: 1000 }
  // at half zoom the same world is 1000 wide, which fits, so it centres
  assert.equal(clampPan({ x: -500, y: 0 }, 0.5, world, frame).x, (1200 - 1000) / 2)
  // at full zoom it does not fit, so the pan is honoured
  assert.equal(clampPan({ x: -500, y: 0 }, 1, world, frame).x, -500)
})

test('world and screen round-trip', () => {
  const pan = { x: 37, y: -64 }
  const k = 0.8
  const world = { x: 420, y: 310 }
  const back = toWorld(toScreen(world, pan, k), pan, k)
  assert.ok(Math.abs(back.x - world.x) < 1e-9)
  assert.ok(Math.abs(back.y - world.y) < 1e-9)
})

test('zooming about a point keeps that point still', () => {
  const anchor = { x: 640, y: 400 }
  const pan = { x: 20, y: 30 }
  const before = toWorld(anchor, pan, 1)
  const next = zoomAbout(anchor, pan, 1, 1.4)
  const after = toWorld(anchor, next, 1.4)
  assert.ok(Math.abs(before.x - after.x) < 1e-9)
  assert.ok(Math.abs(before.y - after.y) < 1e-9)
})

test('centreOn puts the target in the middle', () => {
  const pan = centreOn({ x: 900, y: 500 }, 0.75, frame)
  const screen = toScreen({ x: 900, y: 500 }, pan, 0.75)
  assert.equal(screen.x, frame.w / 2)
  assert.equal(screen.y, frame.h / 2)
})

test('zoom is clamped to the allowed range', () => {
  assert.equal(clampZoom(9), ZOOM.max)
  assert.equal(clampZoom(0.01), ZOOM.min)
  assert.equal(clampZoom(1), 1)
})

// ── the desk ────────────────────────────────────────────────────────────────

const spec = { cardW: 240, cardH: 160, gap: 28, cols: 4 }

test('aligned slots wrap by column count', () => {
  assert.deepEqual(deskSlot(0, spec), { x: MARGIN, y: MARGIN })
  assert.deepEqual(deskSlot(3, spec), { x: MARGIN + 3 * 268, y: MARGIN })
  assert.deepEqual(deskSlot(4, spec), { x: MARGIN, y: MARGIN + 188 })
})

test('a new project never lands on top of one already there', () => {
  const taken = [deskSlot(0, spec), deskSlot(1, spec)]
  const landed = freeSlot(deskSlot(0, spec), taken, spec, { w: 3000, h: 2000 })
  assert.ok(taken.every((p) => !overlaps(landed, p, spec.cardW, spec.cardH, 4)))
})

test('a free spot is kept inside the world', () => {
  const world = { w: 900, h: 600 }
  const taken = [{ x: 100, y: 100 }]
  const landed = freeSlot({ x: 100, y: 100 }, taken, spec, world)
  assert.ok(landed.x >= 0 && landed.x + spec.cardW <= world.w)
  assert.ok(landed.y >= 0 && landed.y + spec.cardH <= world.h)
})

test('a dropped card is pulled back inside the desk', () => {
  const world = { w: 1000, h: 700 }
  assert.deepEqual(clampToWorld({ x: -400, y: 5000 }, 240, 160, world), { x: 0, y: 540 })
})

test('tilt is stable per id and stays small', () => {
  assert.equal(tiltOf('abc'), tiltOf('abc'))
  for (const id of ['a', 'b', 'a-longer-uuid-like-string', '']) {
    assert.ok(Math.abs(tiltOf(id)) <= 1.1)
  }
  assert.notEqual(hashOf('a'), hashOf('b'))
})

// ── the board ───────────────────────────────────────────────────────────────

test('a card plus three quarters of the next fills the window', () => {
  const gap = 32
  const w = laneCardWidth(1440, gap)
  assert.ok(w * 1.75 + gap * 1.75 + MARGIN - 1440 < 2)
})

test('card width has a floor and a ceiling', () => {
  assert.equal(laneCardWidth(360, 32), 320)
  assert.equal(laneCardWidth(4000, 32), 760)
})

test('the lane world grows with the pieces and never shrinks below the window', () => {
  const small = laneWorld(1, 500, 400, 32, frame)
  assert.equal(small.w, frame.w)
  const long = laneWorld(12, 500, 400, 32, frame)
  assert.equal(long.w, 12 * 500 + 12 * 32 + MARGIN * 2)
})

test('the lane index follows the pan', () => {
  const cardW = 500
  const gap = 32
  // parked on card 3: pan so that card 3's centre sits mid-window
  const centre = laneSlot(3, cardW, gap) + cardW / 2
  const pan = centreOn({ x: centre, y: 0 }, 1, frame)
  assert.equal(laneIndexAt(pan, 1, frame, cardW, gap), 3)
})

test('the outward walk finds a slot even when the wanted one and its neighbours are full', () => {
  const grid = Array.from({ length: 9 }, (_, i) => deskSlot(i, { ...spec, cols: 3 }))
  const landed = freeSlot(grid[4], grid, { ...spec, cols: 3 }, { w: 4000, h: 4000 })
  assert.ok(grid.every((g) => !overlaps(landed, g, spec.cardW, spec.cardH, 4)))
})

test('packRow keeps order and enforces minimum spacing', () => {
  const out = packRow([100, 100, 100], 50)
  assert.deepEqual(out, [100, 150, 200])
})

test('packRow leaves well-separated items at their preferred spot', () => {
  const out = packRow([0, 500, 1000], 50)
  assert.deepEqual(out, [0, 500, 1000])
})

test('packRow handles preferred positions out of order', () => {
  // index 0 wants to sit right of index 1 — packRow orders by position, not
  // by index, so the returned values still keep index 0 to the right.
  const out = packRow([500, 0], 50)
  assert.ok(out[1] < out[0])
  assert.ok(out[0] - out[1] >= 50)
})
