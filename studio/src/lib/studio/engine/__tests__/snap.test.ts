import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { collectNeighbours, gapLabels, resizeRect, snapMove, snapResize, SNAP_SCREEN } from '@/lib/studio/engine/snap'
import { registry } from '@/lib/studio/registry'
import type { Rect } from '@/lib/studio/types'
import { block, resetSeq } from '@/lib/studio/layout/__tests__/factory'

const ON = { grid: true, guides: true }
const GRID_ONLY = { grid: true, guides: false }
const r = (x: number, y: number, w = 100, h = 100): Rect => ({ x, y, w, h })

test('with snapping off nothing moves', () => {
  const res = snapMove(r(3, 5), [r(0, 0)], 1, { grid: false, guides: false })
  assert.deepEqual({ dx: res.dx, dy: res.dy }, { dx: 0, dy: 0 })
})

test('the grid pulls an off-grid rect onto the nearest 8', () => {
  // a real block's w and h are multiples of 8, so every edge snaps together
  const res = snapMove(r(3, 5, 96, 96), [], 1, GRID_ONLY)
  assert.equal(res.dx, -3)
  assert.equal(res.dy, 3)
  assert.equal(res.guides.length, 0, 'the grid draws no guide')
})

test('a neighbour edge beats the grid when both are in range', () => {
  // left edge at 101: the grid would pull to 104, the neighbour's edge to 100
  const res = snapMove(r(101, 400), [r(100, 0)], 1, ON)
  assert.equal(res.dx, -1)
  assert.equal(res.guides.length, 1)
  assert.equal(res.guides[0].axis, 'x')
  assert.equal(res.guides[0].value, 100)
})

test('the threshold is 6 SCREEN px, so it widens as you zoom out', () => {
  const far = r(120, 400)                                  // 20 world px from the neighbour edge
  assert.equal(snapMove(far, [r(100, 0)], 1, { grid: false, guides: true }).dx, 0, 'out of reach at k=1')
  const res = snapMove(far, [r(100, 0)], 0.25, { grid: false, guides: true })
  assert.equal(res.dx, -20, 'in reach at k=0.25 where the tolerance is 24 world px')
})

test('x and y snap independently', () => {
  const res = snapMove(r(101, 203), [r(100, 200)], 1, { grid: false, guides: true })
  assert.equal(res.dx, -1)
  assert.equal(res.dy, -3)
  assert.equal(res.guides.length, 2)
})

test('centres align, not just edges', () => {
  // moving centre x = 199; the neighbour's centre is 200 and its edges (100,
  // 300) are far away, so only a centre-to-centre snap can fire
  const res = snapMove(r(149, 400), [r(100, 0, 200, 100)], 1, { grid: false, guides: true })
  assert.equal(res.dx, 1)
  assert.equal(res.guides[0].value, 200)
})

test('a guide spans every neighbour that shares the line', () => {
  const res = snapMove(r(101, 500), [r(100, 0, 100, 50), r(100, 900, 100, 50)], 1, { grid: false, guides: true })
  const g = res.guides.find((x) => x.axis === 'x')
  assert.ok(g)
  assert.equal(g.from, 0, 'reaches the topmost aligned neighbour')
  assert.equal(g.to, 950, 'reaches the bottom of the lowest one')
})

test('equal gaps snap and are labelled', () => {
  // two rects 40 apart; the moving one sits 37 to the right of the second
  const neighbours = [r(0, 0), r(140, 0)]
  const res = snapMove(r(277, 0), neighbours, 1, { grid: false, guides: true })
  assert.equal(res.dx, 3, 'pulled out to make the gap 40 as well')
  assert.ok(res.gaps.length >= 2, 'both gaps get a label')
  assert.ok(res.gaps.every((g) => g.equal))
  assert.ok(res.gaps.every((g) => g.value === 40))
})

test('resize snaps only the dragged edge and ignores centre lines', () => {
  const res = snapResize(r(0, 0, 101, 100), 'e', [r(100, 0)], 1, { grid: false, guides: true })
  assert.equal(res.dx, -1, 'the right edge at 101 meets the neighbour left edge at 100')

  // the right edge sits 1 px off the neighbour's MIDLINE (200) and far from both
  // of its edges (100, 300): a move would snap here, a resize must not
  const centreOnly = snapResize(r(0, 0, 199, 100), 'e', [r(100, 0, 200, 100)], 1, { grid: false, guides: true })
  assert.equal(centreOnly.dx, 0, 'a neighbour midline is not a resize target')
})

test('neighbours exclude the move set, hidden, stacked and deleted rows', () => {
  resetSeq()
  const a = block('note', { x: 0, y: 0 })
  const moving = block('note', { x: 200, y: 0 })
  const hidden = block('note', { x: 400, y: 0, hidden: true })
  const stacked = block('note', { x: 600, y: 0, stacked_in: 'tl' })
  const gone = block('note', { x: 800, y: 0, deleted_at: '2026-09-01T00:00:00.000Z' })
  const view = { x: -1000, y: -1000, w: 4000, h: 4000 }
  const out = collectNeighbours([a, moving, hidden, stacked, gone], new Set([moving.id]), view)
  assert.equal(out.length, 1)
  assert.equal(out[0].x, a.x)
})

test('a frame also offers its inner edges', () => {
  resetSeq()
  const frame = block('frame', { x: 0, y: 0, w: 400, h: 400 })
  const view = { x: -1000, y: -1000, w: 4000, h: 4000 }
  const out = collectNeighbours([frame], new Set(), view)
  assert.equal(out.length, 2, 'the frame itself and its padded inside')
  assert.ok(out.some((x) => x.x === 16 && x.w === 368))
})

test('a collapsed frame offers no inside to snap to', () => {
  resetSeq()
  const frame = block('frame', { x: 0, y: 0, w: 400, h: 48, collapsed: true })
  const out = collectNeighbours([frame], new Set(), { x: -100, y: -100, w: 2000, h: 2000 })
  assert.equal(out.length, 1)
})

test('gap labels report the distance to the nearest neighbour on each side', () => {
  const out = gapLabels(r(200, 0), [r(0, 0), r(340, 0)])
  const xs = out.filter((g) => g.axis === 'x').map((g) => g.value).sort((a, b) => a - b)
  assert.deepEqual(xs, [40, 100])
})

test('resizeRect clamps to the type bounds and stays on the grid', () => {
  const spec = registry.note
  const wide = resizeRect(r(0, 0, 320, 96), 'e', { x: 9999, y: 0 }, 'note')
  assert.equal(wide.w, spec.maxW)
  const narrow = resizeRect(r(0, 0, 320, 96), 'e', { x: -9999, y: 0 }, 'note')
  assert.equal(narrow.w, spec.minW)
  const odd = resizeRect(r(0, 0, 320, 96), 'e', { x: 5, y: 0 }, 'note')
  assert.equal(odd.w % 8, 0)
})

test('dragging a west handle moves the left edge and leaves the right one', () => {
  const out = resizeRect(r(100, 0, 320, 96), 'w', { x: 40, y: 0 }, 'note')
  assert.equal(out.x + out.w, 420, 'the right edge has not moved')
  assert.equal(out.w, 280)
})

test('an auto-height type ignores vertical handles', () => {
  const out = resizeRect(r(0, 0, 320, 96), 'se', { x: 80, y: 200 }, 'note')
  assert.equal(out.h, 96, 'height belongs to the content')
  assert.equal(out.w, 400)
})

test('a fixed-size type does resize vertically', () => {
  const out = resizeRect(r(0, 0, 512, 384), 'se', { x: 0, y: 80 }, 'frame')
  assert.equal(out.h, 464)
})

test('an aspect-locked type keeps its ratio', () => {
  const out = resizeRect(r(0, 0, 320, 240), 'se', { x: 160, y: 0 }, 'image')
  assert.equal(out.w, 480)
  assert.equal(out.h, 360)
})

test('the threshold constant is the documented 6 px', () => {
  assert.equal(SNAP_SCREEN, 6)
})
