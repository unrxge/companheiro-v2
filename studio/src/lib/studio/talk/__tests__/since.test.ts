import { test } from 'node:test'
import assert from 'node:assert/strict'
import { relativeLower, sinceSentence } from '@/lib/studio/since'
import type { SincePayload } from '@/lib/studio/types'

const NOW = new Date('2026-09-13T12:00:00Z')
const iso = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3600000).toISOString()

function payload(o: Partial<SincePayload> = {}): SincePayload {
  return {
    cutoff: iso(48),
    last_opened_at: iso(0),
    canvas_version: 3,
    last_said: null,
    arrived_since: 0,
    waiting: 0,
    compass_pending: 0,
    catches_unmarked: 0,
    commitments_open: 0,
    ...o,
  }
}

const firstOpen = (p: SincePayload) => !p.last_said && p.arrived_since === 0 && p.waiting === 0

test('first time here: only when nothing has ever been said and nothing waits', () => {
  const p = payload()
  assert.deepEqual(sinceSentence(p, NOW, firstOpen(p)), { lines: ['first time here'], dots: [false] })

  const said = payload({ last_said: { text: 'hello', at: iso(1), kind: 'talk' } })
  assert.notDeepEqual(sinceSentence(said, NOW, firstOpen(said)).lines, ['first time here'])

  const waiting = payload({ waiting: 1 })
  assert.notDeepEqual(sinceSentence(waiting, NOW, firstOpen(waiting)).lines, ['first time here'])

  // seeded proposals at creation count as something waiting
  const seeded = payload({ compass_pending: 2 })
  assert.deepEqual(sinceSentence(seeded, NOW, firstOpen(seeded)), { lines: ['the compass has something'], dots: [true] })
})

test('three lines: last said, arrivals, compass — with dots on lines 2 and 3', () => {
  const p = payload({
    last_said: { text: 'I cut the second part', at: iso(2), kind: 'talk' },
    arrived_since: 2,
    waiting: 3,
    compass_pending: 1,
    catches_unmarked: 1,
  })
  const r = sinceSentence(p, NOW, firstOpen(p))
  assert.deepEqual(r.lines, [
    'you last said “I cut the second part” · 2 h ago',
    '2 arrived from talk',
    'the compass has something',
  ])
  assert.deepEqual(r.dots, [false, true, true])
})

test('waiting at the edge when nothing arrived in the window; one thing to mark when only catches', () => {
  const p = payload({ last_said: { text: 'x', at: iso(30), kind: 'talk' }, waiting: 1, catches_unmarked: 1 })
  const r = sinceSentence(p, NOW, firstOpen(p))
  assert.deepEqual(r.lines, ['you last said “x” · yesterday', '1 waiting at the edge', 'one thing to mark'])
  assert.deepEqual(r.dots, [false, true, true])
})

test('nothing new: only the last-said line gets the suffix', () => {
  const p = payload({ last_said: { text: 'still here', at: iso(72), kind: 'talk' }, cutoff: iso(48) })
  const r = sinceSentence(p, NOW, firstOpen(p))
  assert.equal(r.lines.length, 1)
  assert.equal(r.lines[0], 'you last said “still here” · 3 days ago · nothing new since 2 days ago')
  assert.deepEqual(r.dots, [false])
})

test('direction talk names itself in the last-said line', () => {
  const p = payload({ last_said: { text: 'where is this going', at: iso(0.5), kind: 'direction' }, arrived_since: 1 })
  const r = sinceSentence(p, NOW, firstOpen(p))
  assert.equal(r.lines[0], 'you last said in direction talk “where is this going” · 30 min ago')
  assert.equal(r.lines[1], '1 arrived from talk')
})

test('relativeLower: lowercase relative words', () => {
  assert.equal(relativeLower(iso(0), NOW), 'just now')
  assert.equal(relativeLower(iso(0.25), NOW), '15 min ago')
  assert.equal(relativeLower(iso(5), NOW), '5 h ago')
  assert.equal(relativeLower(iso(30), NOW), 'yesterday')
  assert.equal(relativeLower(iso(96), NOW), '4 days ago')
  assert.equal(relativeLower('2026-09-01T10:00:00Z', NOW), '1 sep')
  assert.equal(relativeLower('2025-09-01T10:00:00Z', NOW), '1 sep 2025')
})
