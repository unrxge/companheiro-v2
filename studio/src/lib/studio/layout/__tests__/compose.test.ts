import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { compose, composeNew, regionOf, widthFor, avoid } from '@/lib/studio/layout/compose'
import { BAND_GAP, FULL, G, ROW_GAP, SINCE_GAP, W, WIDE } from '@/lib/studio/layout/constants'
import type { AnyBlock, Placement, Rect } from '@/lib/studio/types'
import { block, project, resetSeq, intersects, at } from './factory'

beforeEach(resetSeq)

const byId = (ps: Placement[]) => new Map(ps.map((p) => [p.id, p]))
const get = (ps: Placement[], id: string): Placement => {
  const p = byId(ps).get(id)
  assert.ok(p, `no placement for ${id}`)
  return p
}
function assertNoOverlap(ps: Placement[]): void {
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++)
      assert.ok(!intersects(ps[i], ps[j]), `${ps[i].id} overlaps ${ps[j].id}`)
}
function assertSnapped(ps: Placement[]): void {
  for (const p of ps) {
    assert.equal(p.x % 8, 0, `${p.id}.x=${p.x}`)
    assert.equal(p.y % 8, 0, `${p.id}.y=${p.y}`)
    assert.equal(p.w % 8, 0, `${p.id}.w=${p.w}`)
    assert.equal(p.h % 8, 0, `${p.id}.h=${p.h}`)
  }
}

test('regionOf / widthFor follow the registry', () => {
  assert.equal(regionOf('concept'), 'top')
  assert.equal(regionOf('anchor'), 'wide')
  assert.equal(regionOf('note'), 'grid')
  assert.equal(regionOf('frame'), 'none')
  assert.equal(widthFor('top', 'concept'), FULL)
  assert.equal(widthFor('column', 'update'), W)
  assert.equal(widthFor('wide', 'anchor'), WIDE)
  assert.equal(widthFor('grid', 'note'), W)
  assert.equal(widthFor('media', 'gallery'), WIDE)
  assert.equal(widthFor('media', 'image'), W)
})

test('compose: concept at (0,0,1008), since directly under it at +8 with the same width', () => {
  const { blocks, concept, since } = project()
  const ps = compose({ blocks, obstacles: [] })
  const c = get(ps, concept.id)
  assert.deepEqual([c.x, c.y, c.w], [0, 0, FULL])
  const s = get(ps, since.id)
  assert.equal(s.x, 0)
  assert.equal(s.y, c.y + c.h + SINCE_GAP)
  assert.equal(s.w, c.w)
})

test('compose: compass at (0, yB); anchors at x 344 width 664', () => {
  const { blocks, since, compass } = project()
  const ps = compose({ blocks, obstacles: [] })
  const s = get(ps, since.id)
  const yB = s.y + s.h + BAND_GAP
  const k = get(ps, compass.id)
  assert.deepEqual([k.x, k.y, k.w], [0, yB, W])
  const anchors = blocks.filter((b) => b.type === 'anchor')
  assert.equal(anchors.length, 2)
  const a0 = get(ps, anchors[0].id)
  const a1 = get(ps, anchors[1].id)
  assert.deepEqual([a0.x, a0.y, a0.w], [W + G, yB, WIDE])
  assert.deepEqual([a1.x, a1.w], [W + G, WIDE])
  assert.equal(a1.y, a0.y + a0.h + ROW_GAP)
  assertNoOverlap(ps)
  assertSnapped(ps)
})

test('compose: measured heights win over stored and estimated ones', () => {
  const { blocks, concept, since } = project()
  const heights = new Map([[concept.id, 200]])
  const ps = compose({ blocks, obstacles: [], heights })
  assert.equal(get(ps, concept.id).h, 200)
  assert.equal(get(ps, since.id).y, 208)
  // a non-multiple of 8 is rounded up
  const ps2 = compose({ blocks, obstacles: [], heights: new Map([[concept.id, 201]]) })
  assert.equal(get(ps2, concept.id).h, 208)
})

test('compose: column order is compass, drafts, commitments, timeline, updates; struck last within type', () => {
  const compass = block('compass')
  const u1 = block('update', { created_at: at(10) })
  const u2 = block('update', { created_at: at(20) })
  const uStruck = block('update', { created_at: at(30), struck_at: at(31) })
  const d1 = block('draft', { updated_at: at(5) })
  const d2 = block('draft', { updated_at: at(50) })
  const c1 = block('commitment', { id: 'c-open', created_at: at(1) })
  const c2 = block('commitment', { id: 'c-done', created_at: at(2) })
  const tl = block('timeline')
  const ps = compose({
    blocks: [u1, tl, uStruck, c2, d1, compass, u2, c1, d2],
    obstacles: [],
    done: new Set([c2.id]),
  })
  const order = ps.filter((p) => p.x === 0).sort((a, b) => a.y - b.y).map((p) => p.id)
  assert.deepEqual(order, [compass.id, d2.id, d1.id, c1.id, c2.id, tl.id, u2.id, u1.id, uStruck.id])
  assertNoOverlap(ps)
})

test('compose: grid uses the shortest column', () => {
  const { blocks: base } = project()
  const blocks = base.filter((b) => b.type !== 'reference' && b.type !== 'note')
  const notes = [
    block('note', { h: 96 }),
    block('note', { h: 96 }),
    block('note', { h: 96 }),
    block('note', { h: 96 }),
    block('note', { h: 96 }),
  ]
  const ps = compose({ blocks: [...blocks, ...notes], obstacles: [] })
  const xs = notes.map((n) => get(ps, n.id).x)
  // 5 equal notes newest-first: columns 0, 1, 2, then back to 0 and 1
  const sorted = notes.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const cols = sorted.map((n) => get(ps, n.id).x / (W + G))
  assert.deepEqual(cols, [0, 1, 2, 0, 1])
  assert.ok(xs.every((x) => [0, W + G, 2 * (W + G)].includes(x)))
  // the taller column gets skipped: one tall note in column 0 then the next two fill 1 and 2, the fourth goes to 1
  resetSeq()
  const tall = block('note', { h: 400, created_at: at(90) })
  const smalls = [
    block('note', { h: 64, created_at: at(80) }),
    block('note', { h: 64, created_at: at(70) }),
    block('note', { h: 64, created_at: at(60) }),
  ]
  const ps2 = compose({ blocks: [tall, ...smalls], obstacles: [] })
  assert.equal(get(ps2, tall.id).x, 0)
  assert.equal(get(ps2, smalls[0].id).x, W + G)
  assert.equal(get(ps2, smalls[1].id).x, 2 * (W + G))
  assert.equal(get(ps2, smalls[2].id).x, W + G)
  assertNoOverlap(ps2)
})

test('compose: media wraps at 1008', () => {
  const imgs = [block('image'), block('image'), block('image'), block('image')]
  const ps = compose({ blocks: imgs, obstacles: [] })
  const sorted = imgs.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  const rects = sorted.map((i) => get(ps, i.id))
  assert.deepEqual(rects.slice(0, 3).map((r) => r.x), [0, W + G, 2 * (W + G)])
  assert.ok(rects[0].x + rects[2].x + W <= FULL + 2 * (W + G))
  assert.equal(rects[3].x, 0)
  assert.equal(rects[3].y, rects[0].y + rects[0].h + ROW_GAP)
  // a gallery (664) and an image (320) fill exactly 1008 and share a row; a second image wraps
  resetSeq()
  const gal = block('gallery', { created_at: at(30) })
  const i1 = block('image', { created_at: at(20) })
  const i2 = block('image', { created_at: at(10) })
  const ps2 = compose({ blocks: [gal, i1, i2], obstacles: [] })
  assert.equal(get(ps2, gal.id).x, 0)
  assert.equal(get(ps2, gal.id).w, WIDE)
  assert.equal(get(ps2, i1.id).x, WIDE + G)
  assert.equal(get(ps2, i1.id).y, get(ps2, gal.id).y)
  assert.equal(get(ps2, i2.id).x, 0)
  assert.ok(get(ps2, i2.id).y >= get(ps2, gal.id).y + get(ps2, gal.id).h + ROW_GAP)
  assertNoOverlap(ps2)
})

test('compose: a full project has no intersecting placements and every value is on the grid', () => {
  const { blocks } = project()
  const all: AnyBlock[] = [
    ...blocks,
    block('update'), block('update'), block('draft'), block('commitment'), block('timeline'),
    block('note'), block('note'), block('reference'),
    block('gallery'), block('image'), block('recording'), block('palette'), block('image'),
  ]
  const ps = compose({ blocks: all, obstacles: [] })
  assert.equal(ps.length, all.length)
  assertNoOverlap(ps)
  assertSnapped(ps)
})

test('compose: a person-placed obstacle in band C pushes grid items down, never sideways', () => {
  const { blocks, since } = project()
  const free = compose({ blocks, obstacles: [] })
  const note = blocks.find((b) => b.type === 'note')!
  const ref = blocks.find((b) => b.type === 'reference')!
  const noteFree = get(free, note.id)
  const refFree = get(free, ref.id)
  // an obstacle sitting exactly where the newest grid item (the note, column 0) would go
  const obstacle: Rect = { x: noteFree.x, y: noteFree.y, w: 200, h: 120 }
  const ps = compose({ blocks, obstacles: [obstacle] })
  const n = get(ps, note.id)
  assert.equal(n.x, noteFree.x, 'x unchanged')
  assert.equal(n.y, obstacle.y + obstacle.h + ROW_GAP, 'dropped below the obstacle + gap')
  assert.ok(!intersects(n, obstacle))
  // the other column is untouched
  assert.deepEqual(get(ps, ref.id), refFree)
  // band A stays where it was
  assert.equal(get(ps, since.id).y, get(free, since.id).y)
  assertNoOverlap([...ps, { id: 'obstacle', ...obstacle }])
})

test('compose: an obstacle over the column band pushes the column down but leaves the wide lane alone', () => {
  const { blocks, compass } = project()
  const free = compose({ blocks, obstacles: [] })
  const k = get(free, compass.id)
  const obstacle: Rect = { x: 0, y: k.y, w: W, h: 80 }
  const ps = compose({ blocks, obstacles: [obstacle] })
  assert.equal(get(ps, compass.id).x, 0)
  assert.equal(get(ps, compass.id).y, obstacle.y + obstacle.h + ROW_GAP)
  const anchors = blocks.filter((b) => b.type === 'anchor')
  for (const a of anchors) assert.deepEqual(get(ps, a.id), get(free, a.id))
})

test('compose: heading, divider, frame and blocks inside a frame are never placed', () => {
  const { blocks } = project()
  const frame = block('frame')
  const inner = block('note', { parent_id: frame.id })
  const stacked = block('update', { stacked_in: 'tl-x' })
  const gone = block('note', { deleted_at: at(99) })
  const ps = compose({
    blocks: [...blocks, block('heading'), block('divider'), frame, inner, stacked, gone],
    obstacles: [],
  })
  const ids = new Set(ps.map((p) => p.id))
  assert.equal(ps.length, blocks.length)
  for (const b of blocks) assert.ok(ids.has(b.id))
  assert.ok(!ids.has(frame.id))
  assert.ok(!ids.has(inner.id))
  assert.ok(!ids.has(stacked.id))
  assert.ok(!ids.has(gone.id))
})

test('compose: a person-placed concept keeps its rect and band B starts under its since row', () => {
  const { blocks, concept, since, compass } = project()
  const moved: AnyBlock[] = blocks.map((b) =>
    b.id === concept.id ? ({ ...b, x: 96, y: 200, w: 800, placed_by: 'person' } as AnyBlock) : b
  )
  const ps = compose({ blocks: moved, obstacles: [] })
  const c = get(ps, concept.id)
  assert.deepEqual([c.x, c.y, c.w], [96, 200, 800])
  const s = get(ps, since.id)
  assert.deepEqual([s.x, s.y, s.w], [96, 200 + c.h + SINCE_GAP, 800])
  assert.equal(get(ps, compass.id).y, s.y + s.h + BAND_GAP)
})

test('compose: without a concept the top band comes from the obstacles', () => {
  const compass = block('compass')
  const ps0 = compose({ blocks: [compass], obstacles: [] })
  assert.deepEqual([get(ps0, compass.id).x, get(ps0, compass.id).y], [0, 0])
  // concept + since as anonymous obstacles (composeAuto after the person moved them)
  const ps1 = compose({
    blocks: [compass],
    obstacles: [{ x: 0, y: 0, w: FULL, h: 160 }, { x: 0, y: 168, w: FULL, h: 40 }],
  })
  assert.equal(get(ps1, compass.id).y, 208 + BAND_GAP)
})

test('avoid: drops below a grown obstacle, never sideways, and stops when clear', () => {
  const r = avoid({ x: 0, y: 0, w: 320, h: 96 }, [{ x: 0, y: 0, w: 320, h: 100 }, { x: 0, y: 200, w: 320, h: 40 }])
  assert.equal(r.x, 0)
  assert.equal(r.y, 264) // ceil8(200 + 40 + 24)
  const clear = avoid({ x: 0, y: 0, w: 320, h: 96 }, [{ x: 400, y: 0, w: 100, h: 100 }])
  assert.deepEqual(clear, { x: 0, y: 0, w: 320, h: 96 })
  // the 8 px grow counts: a rect 4 px from an obstacle is still a hit
  const near = avoid({ x: 0, y: 104, w: 320, h: 96 }, [{ x: 0, y: 0, w: 320, h: 100 }])
  assert.equal(near.y, 128)
})

test('composeNew: estimated rects in insertion order — concept, since, compass, anchors, references', () => {
  const concept = block('concept')
  const since = block('since')
  const compass = block('compass')
  const anchors = [block('anchor'), block('anchor', { content: { text: 'a much longer anchor line that will surely need to wrap onto a second line of text' } })]
  const references = [block('reference'), block('reference', { content: { note: '' } })]
  const ps = composeNew({ concept, since, compass, anchors, references })
  assert.deepEqual(ps.map((p) => p.id), [concept.id, since.id, compass.id, ...anchors.map((a) => a.id), ...references.map((r) => r.id)])
  const c = ps[0]
  assert.deepEqual([c.x, c.y, c.w, c.h], [0, 0, FULL, 160])
  assert.deepEqual([ps[1].x, ps[1].y, ps[1].w], [0, 168, FULL])
  assert.deepEqual([ps[2].x, ps[2].w], [0, W])
  assert.equal(ps[2].y, ps[1].y + ps[1].h + BAND_GAP)
  assert.deepEqual([ps[3].x, ps[3].w], [W + G, WIDE])
  assert.ok(ps[4].h > ps[3].h, 'the longer anchor is estimated taller')
  assert.equal(ps[5].w, W)
  assert.ok(ps[5].y >= Math.max(ps[2].y + ps[2].h, ps[4].y + ps[4].h) + BAND_GAP - ROW_GAP)
  assertNoOverlap(ps)
  assertSnapped(ps)
})
