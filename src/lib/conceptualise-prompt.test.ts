import { test } from 'node:test'
import assert from 'node:assert/strict'
import { conceptualiseStableBlock, mergeTurns, PHASE_MARKER, settleTurn } from './conceptualise-prompt'

test('a reply that asks a question stays in its phase', () => {
  assert.deepEqual(settleTurn('What did she cook on Sundays?', 2), { phase: 2, complete: false, needsQuestion: false })
  assert.deepEqual(settleTurn('O que ficou por dizer?', 3), { phase: 3, complete: false, needsQuestion: false })
})

test('a marked reply moves one phase on and already asks its question', () => {
  assert.deepEqual(settleTurn(`Who is it for?\n${PHASE_MARKER}`, 2), { phase: 3, complete: true, needsQuestion: false })
})

test('a reply that asks nothing never leaves the person stuck', () => {
  // Early: one phase on, with that phase's first question written for it.
  assert.deepEqual(settleTurn('A kitchen, and a language never learned.', 2), { phase: 3, complete: true, needsQuestion: true })
  // The friend on 2026-10-19: a summary at the principle, then "go make it". That is the declaration.
  assert.deepEqual(settleTurn('It has shape, it knows what it is, and who it is for.', 4), { phase: 5, complete: true, needsQuestion: false })
})

test('the declaration stays the declaration', () => {
  assert.deepEqual(settleTurn('Here is what it is.', 5), { phase: 5, complete: false, needsQuestion: false })
})

test('every reply before the declaration is told to leave a way on, and never to send them off', () => {
  const s = conceptualiseStableBlock('TONE', '')
  assert.match(s, /EVERY REPLY LEAVES A WAY ON/)
  assert.match(s, /go make it/)
  assert.doesNotMatch(s, /is always allowed/)
})

test('two companion turns in a row, after Move on, are joined for the model', () => {
  const m = mergeTurns([
    { role: 'user' as const, content: 'an idea' },
    { role: 'assistant' as const, content: 'A reflection.' },
    { role: 'assistant' as const, content: 'Who is it for?' },
    { role: 'user' as const, content: 'my brother' },
  ])
  assert.equal(m.length, 3)
  assert.equal(m[1].content, 'A reflection.\n\nWho is it for?')
})

import { JOINING_CHECK_SYSTEM, joiningNextStage, joiningOpening, joiningStableBlock, joiningStageBlock, parseJoiningCheck } from './conceptualise-prompt'

const check = (settled: number[], doubt = false, surface = false) => ({ settled, doubt, surface })

test('a new piece opens on a line of ours that names its project', () => {
  assert.match(joiningOpening('The Orange Hours'), /^A new piece for The Orange Hours\./)
  assert.match(joiningOpening('Untitled'), /^A new piece for this project\./)
  assert.match(joiningOpening(), /\?$/)
})

test('a tangible answer moves a new piece on, and what was said in passing is not asked again', () => {
  assert.deepEqual(joiningNextStage(1, check([1])), { phase: 2, stay: null })
  // Who it is for came up in the first answer: the audience is skipped.
  assert.deepEqual(joiningNextStage(2, check([1, 2, 3])), { phase: 4, stay: null })
  assert.deepEqual(joiningNextStage(4, check([1, 2, 3, 4])), { phase: 5, stay: null })
})

test('doubt keeps the stage, and so does an answer that stayed on the surface', () => {
  assert.deepEqual(joiningNextStage(2, check([1, 2], true)), { phase: 2, stay: 'doubt' })
  assert.deepEqual(joiningNextStage(2, check([1], false, true)), { phase: 2, stay: 'surface' })
  assert.deepEqual(joiningNextStage(2, check([1])), { phase: 2, stay: null })
})

test('it never goes back, and the say-back stays the say-back', () => {
  assert.deepEqual(joiningNextStage(3, check([])), { phase: 3, stay: null })
  assert.deepEqual(joiningNextStage(5, check([], true)), { phase: 5, stay: null })
})

test('a stage only mentioned earlier is carried forward to build on, not counted as answered', () => {
  const c = parseJoiningCheck({ settled: [1], mentioned: [{ stage: 3, said: 'people who cleaned offices like I did' }, { stage: 1, said: 'x' }], doubt: false, surface: false })
  assert.deepEqual(c.mentioned, { 3: 'people who cleaned offices like I did' })
  assert.deepEqual(joiningNextStage(3, c), { phase: 3, stay: null })
  const block = joiningStageBlock(3, null, c.mentioned![3])
  assert.match(block, /already touched on this earlier: "people who cleaned offices like I did"/)
  assert.match(block, /Do not ask it from scratch/)
  assert.doesNotMatch(joiningStageBlock(3, null), /touched on/)
})

test('the check is read defensively', () => {
  assert.deepEqual(parseJoiningCheck({ settled: [1, 1, 9, '2'], doubt: 'yes' }), { settled: [1, 2], doubt: false, surface: false })
  assert.deepEqual(parseJoiningCheck(null), { settled: [], doubt: false, surface: false })
})

test('a new piece is asked in the project\'s terms, and a confirmation against the project counts', () => {
  assert.match(joiningStableBlock('TONE'), /Frame the question with the project/)
  assert.match(JOINING_CHECK_SYSTEM, /a confirmation against the project is a real answer/)
})

test('the conversation holds a body of work as one idea', () => {
  assert.match(conceptualiseStableBlock('TONE', ''), /never break it into parts or ask which part comes first/)
})

import { reachOf } from './studio/vision/types'

test('a heard change offers the whole project only where the piece still carries the project\'s concept', () => {
  const shared = { core_truth: 'Rest is not idleness.' }
  assert.equal(reachOf('project', shared, 'core_truth', 'Rest is not idleness.'), 'project')
  assert.equal(reachOf('anything', shared, 'core_truth', 'Rest is not idleness.'), 'piece')
  assert.equal(reachOf('project', shared, 'core_truth', 'This piece has its own.'), undefined)
  assert.equal(reachOf('project', null, 'core_truth', 'Rest is not idleness.'), undefined)
  assert.equal(reachOf('project', shared, 'open_threads', 'x'), undefined)
})
