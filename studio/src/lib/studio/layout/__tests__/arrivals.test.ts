import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { arrivalRect, nextArrival } from '@/lib/studio/layout/arrivals'
import { estimateH } from '@/lib/studio/layout/estimate'
import { ARRIVAL_COL_STEP, ARRIVAL_GAP, ARRIVAL_MAX_BELOW, FULL, ROW_GAP, W } from '@/lib/studio/layout/constants'
import type { AnyBlock } from '@/lib/studio/types'
import { block, project, resetSeq, at } from './factory'

beforeEach(resetSeq)

const content = { text: 'a short update', said_at: at(0), entry_id: 'e-1', origin: 'talk' as const }

/** A settled project laid out by hand: concept 0..160, since 168..208, notes to the right and below. */
function settled(): { blocks: AnyBlock[]; right: number; bottom: number; since: AnyBlock } {
  const concept = block('concept', { x: 0, y: 0, w: FULL, h: 160 })
  const since = block('since', { x: 0, y: 168, w: FULL, h: 40 })
  const note = block('note', { x: 0, y: 256, w: W, h: 96 })
  const note2 = block('note', { x: 688, y: 256, w: W, h: 200 })
  const blocks = [concept, since, note, note2]
  return { blocks, right: FULL, bottom: 456, since }
}

test('arrivals: the first arrival lands at bbox.right + 48, level with the since row + 24', () => {
  const { blocks, right, since } = settled()
  const r = arrivalRect(blocks, 'update', content)
  assert.equal(r.x, right + ARRIVAL_GAP)
  assert.equal(r.y, since.y + since.h + ROW_GAP)
  assert.equal(r.w, W)
  assert.equal(r.h, estimateH('update', content, W))
  assert.equal(r.x % 8, 0)
  assert.equal(r.y % 8, 0)
})

test('arrivals: the second stacks below the first with a 24 gap', () => {
  const { blocks } = settled()
  const first = nextArrival(blocks, { ...block('update', { content }), arrived_from: 'e-1' }, 10)
  assert.equal(first.z, 11)
  assert.equal(first.placed_by, 'auto')
  assert.equal(first.arrival_state, 'unplaced')
  assert.equal(first.arrived_from, 'e-1')
  const second = arrivalRect([...blocks, first], 'commitment', { text: 'send the draft on friday' })
  assert.equal(second.x, first.x)
  assert.equal(second.y, first.y + first.h + ROW_GAP)
  assert.equal(second.w, W)
})

test('arrivals: waiting blocks do not widen the bbox; the column keeps its x', () => {
  const { blocks } = settled()
  let live = blocks
  let maxZ = 10
  const xs: number[] = []
  for (let i = 0; i < 3; i++) {
    const b = nextArrival(live, block('update', { content }), maxZ)
    live = [...live, b]
    maxZ = b.z
    xs.push(b.x)
  }
  assert.ok(xs.every((x) => x === xs[0]))
})

test('arrivals: overflow past bbox.bottom + 384 starts a new column at +344, back at the lane top', () => {
  const { blocks, bottom, since } = settled()
  let live = blocks
  let maxZ = 10
  const placed: AnyBlock[] = []
  for (let i = 0; i < 12; i++) {
    const b = nextArrival(live, block('update', { content }), maxZ)
    live = [...live, b]
    maxZ = b.z
    placed.push(b)
  }
  const firstX = placed[0].x
  const laneTop = since.y + since.h + ROW_GAP
  const inSecond = placed.filter((b) => b.x !== firstX)
  assert.ok(inSecond.length > 0, 'a second column was needed')
  const firstInSecond = inSecond[0]
  assert.equal(firstInSecond.x, firstX + ARRIVAL_COL_STEP)
  assert.equal(firstInSecond.y, laneTop)
  // nothing in the first column reaches past the limit; the one before the wrap would have
  const limit = bottom + ARRIVAL_MAX_BELOW
  const firstCol = placed.filter((b) => b.x === firstX)
  for (const b of firstCol) assert.ok(b.y + b.h <= limit)
  const lastInFirst = firstCol[firstCol.length - 1]
  assert.ok(lastInFirst.y + lastInFirst.h + ROW_GAP + firstInSecond.h > limit)
  // within the second column arrivals keep stacking
  if (inSecond.length > 1) assert.equal(inSecond[1].y, inSecond[0].y + inSecond[0].h + ROW_GAP)
})

test('arrivals: an empty project uses FULL as the bbox width', () => {
  const r = arrivalRect([], 'update', content)
  assert.equal(r.x, FULL + ARRIVAL_GAP)
  assert.equal(r.y, 0)
  assert.equal(r.w, W)
})

test('arrivals: only settled blocks shape the bbox — hidden, stacked, deleted and unplaced are ignored', () => {
  const { blocks } = settled()
  const far: AnyBlock[] = [
    block('note', { x: 5000, y: 0, hidden: true }),
    block('update', { x: 5000, y: 0, stacked_in: 'tl' }),
    block('note', { x: 5000, y: 0, deleted_at: at(9) }),
  ]
  const r = arrivalRect([...blocks, ...far], 'update', content)
  assert.equal(r.x, FULL + ARRIVAL_GAP)
})

test('arrivals: without a since row the column starts at the bbox top', () => {
  const { blocks } = project()
  const noSince = blocks.filter((b) => b.type !== 'since').map((b) => ({ ...b, y: 96 }) as AnyBlock)
  const r = arrivalRect(noSince, 'update', content)
  assert.equal(r.y, 96)
})

test('arrivals: nextArrival fills a missing id', () => {
  const seed = { ...block('update', { content }), id: '' }
  const b = nextArrival([], seed, 0)
  assert.ok(b.id.length > 0)
  assert.equal(b.z, 1)
})
