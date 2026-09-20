import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boardItems, decodePosition, draftTitle, encodePosition, gridFor, hoverLines, projectState, slotAt, spanLabel } from './shelf-view'

const project = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Project ${id}`,
  shelf_stage: 'active' as const,
  created_at: '2026-09-01T10:00:00Z',
  last_opened_at: '2026-09-10T10:00:00Z',
  completed_at: null,
  ...over,
})

test('most recently accessed folder comes first, descending after that', () => {
  const items = boardItems(
    [
      project('a', { last_opened_at: '2026-09-05T00:00:00Z' }),
      project('b', { last_opened_at: '2026-09-15T00:00:00Z' }),
      project('c', { last_opened_at: '2026-09-10T00:00:00Z' }),
    ],
    [],
  )
  assert.deepEqual(items.map((i) => i.id), ['b', 'c', 'a'])
})

test('drafts sort in with projects by last access', () => {
  const items = boardItems(
    [project('p', { last_opened_at: '2026-09-05T00:00:00Z' })],
    [{ id: 'd', seed: 'an idea', question: null, messages: [], updated_at: '2026-09-18T00:00:00Z' }],
  )
  assert.deepEqual(items.map((i) => i.id), ['d', 'p'])
  assert.equal(items[0].state, 'undeclared')
})

test('ties are stable: newest-created wins, then id', () => {
  const same = { last_opened_at: '2026-09-10T00:00:00Z' }
  const items = boardItems(
    [
      project('b', { ...same, created_at: '2026-09-01T00:00:00Z' }),
      project('a', { ...same, created_at: '2026-09-01T00:00:00Z' }),
      project('c', { ...same, created_at: '2026-09-03T00:00:00Z' }),
    ],
    [],
  )
  assert.deepEqual(items.map((i) => i.id), ['c', 'a', 'b'])
})

test('folder state follows shelf_stage, defaulting to active', () => {
  assert.equal(projectState({ shelf_stage: 'queued' }), 'queued')
  assert.equal(projectState({ shelf_stage: 'completed' }), 'completed')
  assert.equal(projectState({ shelf_stage: 'active' }), 'active')
  assert.equal(projectState({ shelf_stage: null }), 'active')
  assert.equal(projectState({}), 'active')
})

test('draft titles fall back seed -> first user message -> question -> untitled', () => {
  const base = { created_at: null, updated_at: '2026-09-01T00:00:00Z' }
  assert.equal(draftTitle({ ...base, id: '1', seed: 'the seed', question: 'q', messages: [] }), 'the seed')
  assert.equal(
    draftTitle({ ...base, id: '2', seed: null, question: 'q', messages: [{ role: 'user', content: 'first words' }] }),
    'first words',
  )
  assert.equal(draftTitle({ ...base, id: '3', seed: '  ', question: 'a question', messages: [] }), 'a question')
  assert.equal(draftTitle({ ...base, id: '4', seed: null, question: null, messages: [] }), 'Untitled idea')
})

test('spanLabel picks a readable unit and never goes negative', () => {
  assert.equal(spanLabel(-5000), 'under a day')
  assert.equal(spanLabel(3 * 3600_000), 'under a day')
  assert.equal(spanLabel(86_400_000), '1 day')
  assert.equal(spanLabel(6 * 86_400_000), '6 days')
  assert.equal(spanLabel(21 * 86_400_000), '3 weeks')
  assert.equal(spanLabel(150 * 86_400_000), '5 months')
  assert.equal(spanLabel(800 * 86_400_000), '2 years')
})

test('hover lines: completed only when completed, with the time it took', () => {
  const [active] = boardItems([project('a')], [])
  assert.deepEqual(hoverLines(active).map((l) => l.label), ['Created', 'Last accessed'])

  const [done] = boardItems(
    [project('z', { shelf_stage: 'completed', created_at: '2026-09-01T00:00:00Z', completed_at: '2026-09-12T00:00:00Z' })],
    [],
  )
  const lines = hoverLines(done)
  assert.deepEqual(lines.map((l) => l.label), ['Created', 'Last accessed', 'Completed'])
  assert.match(lines[2].value, /\(11 days\)$/)
})

test('landscape screens hold 5 columns by 2 rows, portrait 4 by 3', () => {
  const wide = gridFor(1280, 640)
  assert.equal(wide.portrait, false)
  assert.deepEqual([wide.cols, wide.rows], [5, 2])
  const tall = gridFor(375, 560)
  assert.equal(tall.portrait, true)
  assert.deepEqual([tall.cols, tall.rows], [4, 3])
})

test('exactly cols x rows cells fit inside the usable window', () => {
  for (const [w, h] of [[1280, 640], [1024, 500], [375, 560], [820, 900]]) {
    const g = gridFor(w, h)
    assert.ok(Math.abs(g.sidePad * 2 + g.cols * g.pitchX - w) < 1)
    assert.ok(Math.abs(g.topPad + g.bottomPad + g.rows * g.pitchY - h) < 1)
  }
})

test('the first slot is top-left and slots wrap at the column count', () => {
  const g = gridFor(1280, 640)
  const first = slotAt(0, g)
  assert.deepEqual(first, { x: g.sidePad, y: g.topPad })
  assert.equal(slotAt(g.cols, g.pitchY > 0 ? g : g).x, first.x)
  assert.ok(slotAt(g.cols, g).y > first.y)
  assert.ok(slotAt(1, g).x > first.x)
})

test('saved positions survive a change of screen size', () => {
  const desktop = gridFor(1280, 640)
  const at = { x: 640, y: desktop.pitchY * 1.5 }
  const saved = encodePosition(at, 1280, desktop.pitchY)
  const phone = gridFor(375, 560)
  const back = decodePosition(saved.x, saved.y, 375, phone.pitchY)!
  assert.ok(Math.abs(back.x - 375 / 2) <= 1)
  assert.ok(Math.abs(back.y - phone.pitchY * 1.5) <= 1)
})

test('older pixel positions and nulls decode as not placed', () => {
  assert.equal(decodePosition(350, 420, 1280, 200), null)
  assert.equal(decodePosition(null, null, 1280, 200), null)
  assert.equal(decodePosition(1_005_000, null, 1280, 200), null)
})
