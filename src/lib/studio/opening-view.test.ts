import { test } from 'node:test'
import assert from 'node:assert/strict'
import { engagement, opensOn } from './opening-view'

const iso = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString()

test('a project with nothing touched opens on the first piece', () => {
  assert.equal(opensOn({ pieces: [{ id: 'a' }, { id: 'b' }] }), 'a')
  assert.equal(opensOn({ pieces: [] }), null)
})

test('it opens on the piece changed most recently', () => {
  const pieces = [{ id: 'a', updated_at: iso(600) }, { id: 'b', updated_at: iso(5) }, { id: 'c', updated_at: iso(90) }]
  assert.equal(opensOn({ pieces }), 'b')
})

test('writing in a part of a piece counts as engagement with the piece', () => {
  const pieces = [
    { id: 'a', updated_at: iso(600), children: [{ id: 'a1', updated_at: iso(2) }] },
    { id: 'b', updated_at: iso(60) },
  ]
  assert.equal(opensOn({ pieces }), 'a')
})

test('something added or moved on the board counts for the pieces it is on', () => {
  const pieces = [{ id: 'a', updated_at: iso(600) }, { id: 'b', updated_at: iso(500) }]
  const things = [{ updated_at: iso(1), on: ['b'] }]
  assert.equal(opensOn({ pieces, things }), 'b')
  // a thread through several is engagement with all of them
  const spread = engagement({ pieces, things: [{ updated_at: iso(1), on: ['a', 'b'] }] })
  assert.ok((spread.get('a') ?? 0) > Date.now() - 120_000)
  assert.ok((spread.get('b') ?? 0) > Date.now() - 120_000)
})

test('opening a piece and changing nothing still counts', () => {
  // a is the more recently changed of the two, so it wins on its own
  const pieces = [{ id: 'a', updated_at: iso(500) }, { id: 'b', updated_at: iso(600) }]
  assert.equal(opensOn({ pieces }), 'a')
  assert.equal(opensOn({ pieces, opened: { b: Date.now() } }), 'b')
  // but a note about a piece that no longer exists is ignored
  assert.equal(opensOn({ pieces, opened: { gone: Date.now() } }), 'a')
})

test('a change beats an opening when it is later, and the other way round', () => {
  const pieces = [{ id: 'a', updated_at: iso(1) }, { id: 'b', updated_at: iso(500) }]
  assert.equal(opensOn({ pieces, opened: { b: Date.now() - 10 * 60_000 } }), 'a')
  assert.equal(opensOn({ pieces, opened: { b: Date.now() } }), 'b')
})

test('a piece with no mark of any kind is absent, not zero', () => {
  const when = engagement({ pieces: [{ id: 'a' }, { id: 'b', updated_at: iso(3) }] })
  assert.equal(when.has('a'), false)
  assert.ok(when.has('b'))
})
