import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addSpotX, arrange, canResize, imageHeight, isWritingTask, itemWidth, keepBelow, packSpans } from './board-items'
import type { ArrangeColumn, ArrangeThing } from './board-items'

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

// ── arranging what hangs under the pieces ───────────────────────────────────

const TOP = 700
const GAP = 30
const CARD_W = 520
/** The board keeps open space to the left of the first card (LEFT_ROOM). */
const LEFT = 720
/** Three pieces in a lane, as the board lays them out. */
const threeColumns: ArrangeColumn[] = [
  { id: 'a', x: LEFT, w: CARD_W },
  { id: 'b', x: LEFT + 564, w: CARD_W },
  { id: 'c', x: LEFT + 1128, w: CARD_W },
]
const thing = (id: string, on: string[], w = 236, h = 104): ArrangeThing => ({ id, w, h, on })
const run = (things: ArrangeThing[], columns = threeColumns, sideAfter = 420) =>
  arrange({ things, columns, top: TOP, gap: GAP, sideAfter, minX: 80 })

test('a thing hangs under the piece it belongs to, not in one long row', () => {
  const at = run([thing('x', ['b']), thing('y', ['c'])])
  // each one starts at its own card's left edge, both on the first row
  assert.deepEqual(at.get('x'), { x: LEFT + 564, y: TOP })
  assert.deepEqual(at.get('y'), { x: LEFT + 1128, y: TOP })
})

test('small things fill the space below a card side by side before going down', () => {
  const at = run([thing('one', ['a']), thing('two', ['a'])])
  assert.deepEqual(at.get('one'), { x: LEFT, y: TOP })
  // 236 + 30 still fits inside the card's 520, so it sits beside the first
  assert.deepEqual(at.get('two'), { x: LEFT + 236 + GAP, y: TOP })
})

test('a row wraps rather than spilling past the card it hangs under', () => {
  const at = run([thing('one', ['a']), thing('two', ['a']), thing('three', ['a'])])
  const third = at.get('three')!
  assert.equal(third.x, LEFT, 'back to the card’s left edge')
  assert.equal(third.y, TOP + 104 + GAP, 'on the next row down')
})

test('one too wide for the card still starts at its left edge', () => {
  const at = run([thing('wide', ['b'], 900, 300)])
  assert.deepEqual(at.get('wide'), { x: LEFT + 564, y: TOP })
})

test('once the column is deep enough, the leftmost piece spills to its left', () => {
  const things = Array.from({ length: 6 }, (_, i) => thing(`t${i}`, ['a'], 500, 200))
  const at = run(things)
  const xs = things.map((t) => at.get(t.id)!.x)
  assert.ok(xs.some((x) => x === LEFT), 'some stayed under the card')
  const spilled = xs.filter((x) => x !== LEFT)
  assert.ok(spilled.length > 0, 'the rest went to the side')
  for (const x of spilled) {
    assert.ok(x + 500 <= LEFT, 'wholly to the LEFT of the card')
    assert.ok(x >= 80, 'never past the left edge of the board')
  }
})

test('a leftmost card with no room beside it keeps going down instead', () => {
  const tight: ArrangeColumn[] = [{ id: 'a', x: 120, w: CARD_W }, { id: 'b', x: 700, w: CARD_W }]
  const things = Array.from({ length: 6 }, (_, i) => thing(`t${i}`, ['a'], 500, 200))
  const at = arrange({ things, columns: tight, top: TOP, gap: GAP, sideAfter: 420, minX: 80 })
  for (const t of things) assert.equal(at.get(t.id)!.x, 120, 'stayed under the card')
})

test('the rightmost piece spills to its right', () => {
  const things = Array.from({ length: 6 }, (_, i) => thing(`t${i}`, ['c'], 500, 200))
  const at = run(things)
  const spilled = things.map((t) => at.get(t.id)!.x).filter((x) => x !== LEFT + 1128)
  assert.ok(spilled.length > 0)
  for (const x of spilled) assert.ok(x >= LEFT + 1128 + CARD_W, 'to the RIGHT of the rightmost card')
})

test('a piece between two others keeps going down rather than crowd a neighbour', () => {
  const things = Array.from({ length: 6 }, (_, i) => thing(`t${i}`, ['b'], 500, 200))
  const at = run(things)
  for (const t of things) {
    const p = at.get(t.id)!
    assert.equal(p.x, LEFT + 564, `${t.id} stayed in its own column`)
  }
  // and it did grow downward
  assert.ok(Math.max(...things.map((t) => at.get(t.id)!.y)) > TOP + 400)
})

test('with only one piece there is no side to spill into', () => {
  const only: ArrangeColumn[] = [{ id: 'a', x: LEFT, w: CARD_W }]
  const things = Array.from({ length: 5 }, (_, i) => thing(`t${i}`, ['a'], 500, 200))
  const at = run(things, only)
  for (const t of things) assert.equal(at.get(t.id)!.x, LEFT)
})

test('a thing on several pieces hangs under one of its own, never a card it is not on', () => {
  const at = run([thing('wide', ['a', 'c'])])
  const x = at.get('wide')!.x
  assert.ok(x === LEFT || x === LEFT + 1128, `under a or c, not under b (${x})`)
})

test('a thing on two neighbours picks one of them, not the gap between', () => {
  const at = run([thing('pair', ['a', 'b'])])
  const x = at.get('pair')!.x
  assert.ok(x === LEFT || x === LEFT + 564, `sat under a card, not between them (${x})`)
})

test('things connected to nothing sit below everything, in their own row', () => {
  const at = run([thing('owned', ['a'], 500, 200), thing('free', [])])
  const free = at.get('free')!
  assert.ok(free.y > at.get('owned')!.y, 'below the columns')
  assert.equal(free.x, LEFT, 'starting at the left of the pieces')
})

test('free-standing things wrap across the width the pieces occupy', () => {
  const frees = Array.from({ length: 8 }, (_, i) => thing(`f${i}`, [], 400, 120))
  const at = run(frees)
  const span = LEFT + 1128 + CARD_W
  for (const f of frees) {
    const p = at.get(f.id)!
    assert.ok(p.x >= LEFT && p.x + 400 <= span + 1, `${f.id} stayed within the pieces' width`)
  }
  assert.ok(new Set(frees.map((f) => at.get(f.id)!.y)).size > 1, 'it wrapped')
})

test('nothing overlaps anything else', () => {
  const things = [
    thing('a1', ['a'], 320, 240), thing('a2', ['a'], 236, 104), thing('a3', ['a'], 500, 300),
    thing('b1', ['b'], 300, 116), thing('b2', ['b'], 380, 220),
    thing('c1', ['c'], 960, 400), thing('c2', ['c'], 300, 116),
    thing('f1', [], 300, 116), thing('f2', [], 320, 240),
  ]
  const at = run(things)
  for (let i = 0; i < things.length; i++) {
    for (let j = i + 1; j < things.length; j++) {
      const p = at.get(things[i].id)!
      const q = at.get(things[j].id)!
      const hit = p.x < q.x + things[j].w && q.x < p.x + things[i].w
        && p.y < q.y + things[j].h && q.y < p.y + things[i].h
      assert.ok(!hit, `${things[i].id} overlaps ${things[j].id}`)
    }
  }
})

test('nothing is placed above the line the pieces hang from', () => {
  const things = [thing('a', ['a'], 500, 200), thing('b', ['c'], 500, 200), thing('f', [])]
  const at = run(things)
  for (const [, p] of at) assert.ok(p.y >= TOP)
})

test('an empty board arranges nothing', () => {
  assert.equal(run([]).size, 0)
})
