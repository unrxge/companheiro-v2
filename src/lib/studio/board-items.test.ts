import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addSpotX, canResize, imageHeight, isWritingTask, itemWidth, keepBelow, packSpans } from './board-items'

test('images resize widely, a task list a little, a recording not at all', () => {
  assert.equal(itemWidth('image', null), 320)
  assert.equal(itemWidth('image', 2000), 960)
  assert.equal(itemWidth('image', 10), 160)
  assert.equal(itemWidth('tasks', 2000), 380)
  assert.equal(itemWidth('tasks', 10), 260)
  assert.equal(itemWidth('recording', 900), 300)
  assert.equal(canResize('image'), true)
  assert.equal(canResize('tasks'), true)
  assert.equal(canResize('recording'), false)
})

test('an image keeps its proportions', () => {
  assert.equal(imageHeight(400, { width: 1000, height: 500 }, false), 200)
  // no known shape: 4:3
  assert.equal(imageHeight(400, null, false), 300)
})

test('nothing dragged rests above the line the pieces start on', () => {
  assert.deepEqual(keepBelow({ x: 300, y: 40 }, 260), { x: 300, y: 260 })
  assert.deepEqual(keepBelow({ x: -20, y: 500 }, 260), { x: 0, y: 500 })
})

test('the add-a-piece spot steps right of anything put down in its place', () => {
  const band = { top: 260, bottom: 680 }
  // nothing there: straight after the last piece
  assert.equal(addSpotX(1200, 520, 44, band, []), 1200)
  // something below the pieces is not in the way
  assert.equal(addSpotX(1200, 520, 44, band, [{ x: 1250, y: 760, w: 236, h: 104 }]), 1200)
  // something beside the last piece is: the spot moves past it
  assert.equal(addSpotX(1200, 520, 44, band, [{ x: 1250, y: 300, w: 236, h: 104 }]), 1250 + 236 + 44)
  // two in a row: past both
  assert.equal(
    addSpotX(1200, 520, 44, band, [{ x: 1250, y: 300, w: 236, h: 104 }, { x: 1600, y: 300, w: 300, h: 200 }]),
    1600 + 300 + 44,
  )
  // something over an earlier piece is left alone
  assert.equal(addSpotX(1200, 520, 44, band, [{ x: 200, y: 300, w: 236, h: 104 }]), 1200)
})

test('a row of different widths never overlaps and keeps its order', () => {
  const left = packSpans([{ centre: 400, w: 300 }, { centre: 420, w: 236 }, { centre: 100, w: 320 }], 30, 80)
  // third wants to be furthest left and is held at the margin
  assert.equal(left[2], 80)
  assert.ok(left[0] >= left[2] + 320 + 30)
  assert.ok(left[1] >= left[0] + 300 + 30)
})

test('writing tasks are the ones the writing page shows', () => {
  assert.equal(isWritingTask({ type: 'creation', is_writing_related: null }), true)
  assert.equal(isWritingTask({ type: 'creation', is_writing_related: false }), false)
  assert.equal(isWritingTask({ type: 'execution', is_writing_related: true }), false)
})
