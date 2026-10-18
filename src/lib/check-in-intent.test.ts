import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseIntent, CHECK_IN_ONLY, MAX_NOTES } from './check-in-intent'

// What this guards: a check-in mistaken for an instruction, or a note pointed
// at a project that is not theirs. Checking in is the default whenever the
// answer is unclear or malformed.
const ids = ['p1', 'p2']

test('anything malformed reads as a check-in', () => {
  assert.deepEqual(parseIntent(null, ids), CHECK_IN_ONLY)
  assert.deepEqual(parseIntent({ mode: 'shout' }, ids), CHECK_IN_ONLY)
  assert.deepEqual(parseIntent({ mode: 'note', notes: [] }, ids), CHECK_IN_ONLY)
  assert.deepEqual(parseIntent({ mode: 'note', notes: [{ project_id: 'p1', kind: 'thought', text: '   ' }] }, ids), CHECK_IN_ONLY)
})

test('a check-in carries no notes even if some came back', () => {
  assert.deepEqual(parseIntent({ mode: 'check_in', notes: [{ project_id: 'p1', kind: 'thought', text: 'x' }] }, ids), CHECK_IN_ONLY)
})

test('a project not in their list becomes "not chosen", never someone else\'s', () => {
  const r = parseIntent({ mode: 'note', notes: [{ project_id: 'stranger', kind: 'reminder', text: 'Call the printer' }] }, ids)
  assert.equal(r.mode, 'note')
  assert.equal(r.notes[0].project_id, null)
  assert.equal(r.notes[0].kind, 'reminder')
})

test('notes are capped and kinds default to a thought', () => {
  const many = Array.from({ length: 6 }, (_, i) => ({ project_id: 'p2', kind: 'odd', text: `idea ${i}` }))
  const r = parseIntent({ mode: 'both', notes: many }, ids)
  assert.equal(r.mode, 'both')
  assert.equal(r.notes.length, MAX_NOTES)
  assert.equal(r.notes[0].kind, 'thought')
})
