import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { tidy, type TidyResult } from '@/lib/studio/layout/tidy'
import type { AnyBlock, Rect } from '@/lib/studio/types'
import { block, project, resetSeq, at, PROJECT, USER, applied } from './factory'

beforeEach(resetSeq)

const NOW = at(500)
const run = (blocks: AnyBlock[], everything = false, heights = new Map<string, number>()): TidyResult =>
  tidy({ blocks, heights, projectId: PROJECT, userId: USER }, { everything, now: NOW, newTimelineId: 'tl-new' })

/** Apply a tidy result to the blocks the way B's TidyCommand would. */
function applyTidy(blocks: AnyBlock[], r: TidyResult, everything = false): AnyBlock[] {
  const withTimeline = r.stack.newTimeline ? [...blocks, r.stack.newTimeline] : blocks
  const moved = applied(withTimeline, [...r.moves].map(([id, m]) => [id, m.to] as [string, Rect]))
  const tlId = r.stack.timeline?.id ?? r.stack.newTimeline?.id ?? null
  return moved.map((b) => {
    let next = b
    if (r.stack.ids.includes(b.id) && tlId) next = { ...next, stacked_in: tlId } as AnyBlock
    if (everything && r.moves.has(b.id)) next = { ...next, placed_by: 'auto' } as AnyBlock
    return next
  })
}

/** A scattered project: everything auto-placed but sitting at random rects. */
function scattered(): AnyBlock[] {
  const { blocks } = project()
  const extra: AnyBlock[] = [block('update'), block('draft'), block('note'), block('image')]
  return [...blocks, ...extra].map((b, i) =>
    b.type === 'concept' || b.type === 'since' ? b : ({ ...b, x: 2000 + i * 8, y: 1000 + i * 120 } as AnyBlock)
  )
}

test('tidy: moves scattered auto blocks and never touches concept or since', () => {
  const blocks = scattered()
  const r = run(blocks)
  assert.ok(r.moves.size > 0)
  for (const b of blocks) if (b.type === 'concept' || b.type === 'since') assert.ok(!r.moves.has(b.id))
  const moved = blocks.filter((b) => b.type !== 'concept' && b.type !== 'since')
  for (const b of moved) assert.ok(r.moves.has(b.id), `${b.id} should move`)
  for (const [, m] of r.moves) assert.equal(m.to.x % 8, 0)
  assert.equal(r.stack.ids.length, 0)
  assert.equal(r.stack.newTimeline, null)
})

test('tidy: person-placed, locked and unplaced blocks never appear in moves', () => {
  const base = scattered()
  const person = block('note', { placed_by: 'person', x: 3000, y: 3000 })
  const locked = block('note', { locked: true, x: 3200, y: 3000 })
  const unplaced = block('update', { arrival_state: 'unplaced', x: 3400, y: 3000 })
  const frame = block('frame', { x: 4000, y: 4000 })
  const inFrame = block('note', { parent_id: frame.id, x: 4016, y: 4064 })
  const hidden = block('note', { hidden: true, x: 5000, y: 5000 })
  const blocks = [...base, person, locked, unplaced, frame, inFrame, hidden]
  const r = run(blocks)
  for (const b of [person, locked, unplaced, frame, inFrame, hidden]) assert.ok(!r.moves.has(b.id), `${b.id} must not move`)
  assert.ok(r.moves.size > 0)
  // the fixed blocks are obstacles: nothing lands on them
  const after = applyTidy(blocks, r)
  const fixedRects = [person, locked, unplaced, frame, inFrame].map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h }))
  for (const [id, m] of r.moves) {
    for (const f of fixedRects) {
      const hit = m.to.x < f.x + f.w && m.to.x + m.to.w > f.x && m.to.y < f.y + f.h && m.to.y + m.to.h > f.y
      assert.ok(!hit, `${id} lands on a fixed block`)
    }
  }
  assert.equal(after.length, blocks.length)
})

test('tidy: everything moves person-placed blocks too, but still not locked, unplaced or concept', () => {
  const base = scattered()
  const person = block('note', { placed_by: 'person', x: 3000, y: 3000 })
  const locked = block('note', { locked: true, x: 3200, y: 3000 })
  const unplaced = block('update', { arrival_state: 'unplaced', x: 3400, y: 3000 })
  const blocks = [...base, person, locked, unplaced]
  const r = run(blocks, true)
  assert.ok(r.moves.has(person.id), 'everything moves person blocks')
  assert.ok(!r.moves.has(locked.id))
  assert.ok(!r.moves.has(unplaced.id))
  for (const b of blocks) if (b.type === 'concept' || b.type === 'since') assert.ok(!r.moves.has(b.id))
})

test('tidy: ≥ 8 singles → the 3 newest remain, the rest are in stack.ids; a new timeline is created at the oldest rect', () => {
  const { blocks } = project()
  const updates = Array.from({ length: 9 }, (_, i) => block('update', { x: 100 * i, y: 1500, created_at: at(100 + i) }))
  const r = run([...blocks, ...updates])
  const newest = updates.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  assert.deepEqual(r.stack.ids, newest.slice(3).map((u) => u.id))
  assert.equal(r.stack.ids.length, 6)
  assert.equal(r.stack.timeline, null)
  assert.ok(r.stack.newTimeline)
  const tl = r.stack.newTimeline!
  const oldest = newest[newest.length - 1]
  assert.equal(tl.type, 'timeline')
  assert.equal(tl.id, 'tl-new')
  assert.deepEqual([tl.x, tl.y, tl.w], [oldest.x, oldest.y, oldest.w])
  assert.equal(tl.placed_by, 'auto')
  assert.equal(tl.arrival_state, 'placed')
  assert.equal(tl.name, null)
  assert.equal(tl.project_id, PROJECT)
  assert.equal(tl.user_id, USER)
  assert.equal(tl.created_at, NOW)
  assert.equal(tl.z, Math.max(...[...blocks, ...updates].map((b) => b.z)) + 1)
  // the new timeline is composed into the column and the stacked updates are not moved
  assert.ok(r.moves.has(tl.id))
  for (const id of r.stack.ids) assert.ok(!r.moves.has(id))
  for (const u of newest.slice(0, 3)) assert.ok(r.moves.has(u.id))
})

test('tidy: an existing timeline is reused for stacking', () => {
  const { blocks } = project()
  const tl = block('timeline', { x: 900, y: 900 })
  const updates = Array.from({ length: 8 }, (_, i) => block('update', { x: 100 * i, y: 1500, created_at: at(100 + i) }))
  const r = run([...blocks, tl, ...updates])
  assert.equal(r.stack.timeline?.id, tl.id)
  assert.equal(r.stack.newTimeline, null)
  assert.equal(r.stack.ids.length, 5)
  assert.ok(r.moves.has(tl.id))
})

test('tidy: 7 singles stay single', () => {
  const { blocks } = project()
  const updates = Array.from({ length: 7 }, () => block('update'))
  const r = run([...blocks, ...updates])
  assert.equal(r.stack.ids.length, 0)
  assert.equal(r.stack.newTimeline, null)
})

test('tidy: unplaced, stacked and hidden updates do not count as singles', () => {
  const { blocks } = project()
  const singles = Array.from({ length: 6 }, () => block('update'))
  const others = [
    block('update', { arrival_state: 'unplaced' }),
    block('update', { stacked_in: 'tl-old' }),
    block('update', { hidden: true }),
  ]
  const r = run([...blocks, ...singles, ...others])
  assert.equal(r.stack.ids.length, 0)
})

test('tidy: idempotent — tidy(tidy(x)) has no moves and no stacking', () => {
  const scenarios: Array<[string, AnyBlock[], boolean]> = [
    ['scattered', scattered(), false],
    ['scattered with obstacles', [...scattered(), block('note', { placed_by: 'person', x: 344, y: 300 }), block('frame', { x: 700, y: 900 })], false],
    ['everything', [...scattered(), block('note', { placed_by: 'person', x: 344, y: 300 })], true],
    ['stacking', [...project().blocks, ...Array.from({ length: 10 }, (_, i) => block('update', { x: 50 * i, y: 1200, created_at: at(100 + i) }))], false],
  ]
  for (const [name, blocks, everything] of scenarios) {
    const first = run(blocks, everything)
    const once = applyTidy(blocks, first, everything)
    const second = run(once, everything)
    assert.equal(second.moves.size, 0, `${name}: second tidy moved ${[...second.moves.keys()].join(', ')}`)
    assert.equal(second.stack.ids.length, 0, `${name}: second tidy stacked again`)
    assert.equal(second.stack.newTimeline, null, `${name}: second tidy made another timeline`)
  }
})

test('tidy: measured heights are used and an h-only difference counts as a move', () => {
  const { blocks } = project()
  const note = blocks.find((b) => b.type === 'note')!
  const r0 = run(blocks)
  const settled = applyTidy(blocks, r0)
  assert.equal(run(settled).moves.size, 0)
  const heights = new Map([[note.id, note.h + 80]])
  const r1 = run(settled, false, heights)
  assert.ok(r1.moves.has(note.id))
  assert.equal(r1.moves.get(note.id)!.to.h, note.h + 80)
})
