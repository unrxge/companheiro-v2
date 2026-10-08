import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addSpotX, arrange, canResize, contentBack, imageHeight, isWritingTask, itemWidth, keepBelow, packSpans } from './board-items'
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
const threeColumns: ArrangeColumn[] = [
  { id: 'a', x: LEFT, w: CARD_W },
  { id: 'b', x: LEFT + 564, w: CARD_W },
  { id: 'c', x: LEFT + 1128, w: CARD_W },
]
const thing = (id: string, on: string[], w = 236, h = 104, priority?: number): ArrangeThing =>
  ({ id, w, h, on, priority })
const run = (things: ArrangeThing[], columns = threeColumns) =>
  arrange({ things, columns, top: TOP, gap: GAP, minX: 80 })

/** Nothing may sit on top of anything else, wherever it ended up. */
function assertNoOverlap(things: ArrangeThing[], at: Map<string, { x: number; y: number }>) {
  for (let i = 0; i < things.length; i++) {
    for (let j = i + 1; j < things.length; j++) {
      const p = at.get(things[i].id)!
      const q = at.get(things[j].id)!
      const hit = p.x < q.x + things[j].w && q.x < p.x + things[i].w
        && p.y < q.y + things[j].h && q.y < p.y + things[i].h
      assert.ok(!hit, `${things[i].id} overlaps ${things[j].id}`)
    }
  }
}

test('a thing hangs with the piece it belongs to', () => {
  const at = run([thing('x', ['b']), thing('y', ['c'])])
  // inside its own piece's band, not in one long row at the left
  assert.ok(at.get('x')!.x >= LEFT + 564 - 300 && at.get('x')!.x < LEFT + 1128)
  assert.ok(at.get('y')!.x >= LEFT + 1128 - 300)
})

test('a band is wider than the card, so two things of different widths share a row', () => {
  const things = [thing('wide', ['b'], 300, 200), thing('narrow', ['b'], 236, 104)]
  const at = run(things)
  assert.equal(at.get('wide')!.y, TOP)
  assert.equal(at.get('narrow')!.y, TOP, 'beside it, not under it — 300 + 236 is past the card’s own width')
  assertNoOverlap(things, at)
})

test('threads take the top of the band, nearest the card', () => {
  const things = [
    thing('image', ['a'], 320, 300, 1),
    thing('tasks', ['a'], 300, 260, 1),
    thing('thread', ['a'], 236, 104, 0),
  ]
  const at = run(things)
  assert.equal(at.get('thread')!.y, TOP, 'the thread is on the top line')
  assertNoOverlap(things, at)
})

test('every thread goes in before anything else does', () => {
  const things = [
    thing('i1', ['a'], 420, 400, 1),
    thing('t1', ['a'], 236, 104, 0),
    thing('t2', ['a'], 236, 104, 0),
  ]
  const at = run(things)
  const threadBottom = Math.max(at.get('t1')!.y + 104, at.get('t2')!.y + 104)
  assert.ok(threadBottom <= at.get('i1')!.y + 400 + 1, 'the threads are not pushed below the picture')
  assert.equal(at.get('t1')!.y, TOP)
  assertNoOverlap(things, at)
})

test('things of mixed heights tuck under each other rather than lining up', () => {
  const things = [
    thing('tall', ['b'], 236, 400, 1),
    thing('short1', ['b'], 236, 100, 1),
    thing('short2', ['b'], 236, 100, 1),
  ]
  const at = run(things)
  assertNoOverlap(things, at)
  // the two short ones stack in the run beside the tall one, not on one line
  const ys = new Set([at.get('short1')!.y, at.get('short2')!.y])
  assert.equal(ys.size, 2, 'the second short one dropped under the first')
  assert.ok(at.get('short2')!.y < at.get('tall')!.y + 400, 'and it is still beside the tall one, not under it')
})

test('the outermost pieces reach into the open board beyond them', () => {
  const things = Array.from({ length: 6 }, (_, i) => thing(`t${i}`, ['a'], 320, 200, 1))
  const at = run(things)
  const xs = things.map((t) => at.get(t.id)!.x)
  assert.ok(Math.min(...xs) < LEFT, 'it used the room to the left of the first card')
  assert.ok(Math.min(...xs) >= 80, 'but never past the edge of the board')
  assertNoOverlap(things, at)
})

test('a middle piece stays between its neighbours', () => {
  const things = Array.from({ length: 6 }, (_, i) => thing(`t${i}`, ['b'], 300, 200, 1))
  const at = run(things)
  for (const t of things) {
    const p = at.get(t.id)!
    assert.ok(p.x >= LEFT + CARD_W, `${t.id} did not reach back over the first card`)
    assert.ok(p.x + 300 <= LEFT + 1128 + 40, `${t.id} did not reach over the last card`)
  }
  assertNoOverlap(things, at)
})

test('a thing on several pieces hangs with one of its own', () => {
  const at = run([thing('wide', ['a', 'c'])])
  const x = at.get('wide')!.x
  const nearA = Math.abs(x - LEFT) < 600
  const nearC = Math.abs(x - (LEFT + 1128)) < 600
  assert.ok(nearA || nearC, `beside a or c, not under b (${x})`)
})

test('things connected to nothing sit below everything', () => {
  const things = [thing('owned', ['a'], 500, 200, 1), thing('free', [])]
  const at = run(things)
  assert.ok(at.get('free')!.y > at.get('owned')!.y, 'below the bands')
  assertNoOverlap(things, at)
})

test('a crowd of every shape never overlaps', () => {
  const things = [
    thing('a1', ['a'], 320, 240, 1), thing('a2', ['a'], 236, 104, 0), thing('a3', ['a'], 500, 300, 1),
    thing('a4', ['a'], 300, 116, 1), thing('a5', ['a'], 960, 400, 1),
    thing('b1', ['b'], 300, 116, 1), thing('b2', ['b'], 380, 220, 1), thing('b3', ['b'], 236, 104, 0),
    thing('c1', ['c'], 960, 400, 1), thing('c2', ['c'], 300, 116, 1), thing('c3', ['c'], 320, 240, 1),
    thing('f1', [], 300, 116), thing('f2', [], 320, 240), thing('f3', [], 236, 104),
  ]
  const at = run(things)
  assertNoOverlap(things, at)
  for (const [, p] of at) assert.ok(p.y >= TOP, 'nothing above the line the pieces hang from')
  for (const [, p] of at) assert.ok(p.x >= 80, 'nothing past the left edge of the board')
})

test('one piece on its own still gets room both sides', () => {
  const only: ArrangeColumn[] = [{ id: 'a', x: LEFT, w: CARD_W }]
  const things = Array.from({ length: 5 }, (_, i) => thing(`t${i}`, ['a'], 300, 200, 1))
  const at = run(things, only)
  assertNoOverlap(things, at)
  const xs = things.map((t) => at.get(t.id)!.x)
  assert.ok(Math.max(...xs) > LEFT, 'it spread sideways rather than making one tall column')
})

test('an empty board arranges nothing', () => {
  assert.equal(run([]).size, 0)
})

test('nothing lands on something put down by hand', () => {
  const things = Array.from({ length: 5 }, (_, i) => thing(`t${i}`, ['a'], 300, 160, 1))
  // right where the first few would have gone
  const moved = { x: LEFT, y: TOP, w: 400, h: 300 }
  const at = arrange({ things, columns: threeColumns, top: TOP, gap: GAP, minX: 80, obstacles: [moved] })
  assertNoOverlap(things, at)
  for (const t of things) {
    const p = at.get(t.id)!
    const hit = p.x < moved.x + moved.w && moved.x < p.x + t.w
      && p.y < moved.y + moved.h && moved.y < p.y + t.h
    assert.ok(!hit, `${t.id} landed on the one that was moved there`)
  }
})

test('a card is space that is taken, so nothing hangs on one dragged down', () => {
  const card = { x: LEFT, y: TOP + 200, w: CARD_W, h: 300 }
  const things = [thing('x', ['a'], 300, 160, 1), thing('y', ['a'], 300, 160, 1)]
  const at = arrange({ things, columns: threeColumns, top: TOP, gap: GAP, minX: 80, obstacles: [card] })
  for (const t of things) {
    const p = at.get(t.id)!
    const hit = p.x < card.x + card.w && card.x < p.x + t.w
      && p.y < card.y + card.h && card.y < p.y + t.h
    assert.ok(!hit, `${t.id} landed on the card`)
  }
})

test('a new thing takes what is left; everything already down stays put', () => {
  const made = (n: number) => Array.from({ length: n }, (_, i) =>
    ({ ...thing(`t${i}`, ['a'], 300, 160, 1), seq: i }))
  const before = arrange({ things: made(4), columns: threeColumns, top: TOP, gap: GAP, minX: 80 })
  const things = made(5)
  const after = arrange({ things, columns: threeColumns, top: TOP, gap: GAP, minX: 80 })
  for (const [id, p] of before) assert.deepEqual(after.get(id), p, `${id} was pushed along`)
  assert.ok(after.has('t4'))
  assertNoOverlap(things, after)
})

test('a new thing goes in the nearest free space to its card, not below the pile', () => {
  // four tall things fill the room under the card; the fifth should come up
  // beside the shortest, not be dropped under all of them
  const things = [
    { ...thing('a1', ['a'], 300, 400, 1), seq: 1 },
    { ...thing('a2', ['a'], 300, 120, 1), seq: 2 },
    { ...thing('new', ['a'], 236, 100, 1), seq: 3 },
  ]
  const at = arrange({ things, columns: threeColumns, top: TOP, gap: GAP, minX: 80 })
  assertNoOverlap(things, at)
  const p = at.get('new')!
  assert.ok(p.y < at.get('a1')!.y + 400, 'it tucked in beside rather than going under the tall one')
})

test("a card's own things hang below that card, not below the highest one", () => {
  const columns: ArrangeColumn[] = [
    { id: 'a', x: LEFT, w: CARD_W },
    { id: 'b', x: LEFT + 564, w: CARD_W, top: TOP + 600 },
  ]
  const at = arrange({ things: [thing('x', ['b']), thing('y', ['a'])], columns, top: TOP, gap: GAP, minX: 80 })
  assert.ok(at.get('x')!.y >= TOP + 600, 'it followed its own card down')
  assert.equal(at.get('y')!.y, TOP, 'the other card keeps its own line')
})

test('putting a content change back names only the parts it touched', () => {
  const was = { caption: 'the old one', swatches: [{ id: 'a', hex: '#fff', name: '' }] }
  assert.deepEqual(contentBack(was, { caption: 'new' }), { caption: 'the old one' })
  // nothing there before: the empty value, not undefined, which a merge would ignore
  assert.deepEqual(contentBack(was, { title: 'new' }), { title: '' })
  assert.deepEqual(contentBack(was, { writing_closed: true }), { writing_closed: false })
  assert.deepEqual(contentBack(was, { swatches: [] }), { swatches: was.swatches })
})
