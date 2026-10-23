import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanFeelings, cleanSaidIt, continuationLines, emptyAnswers, hasAnyAnswer, toLogBody, MAX_FEELINGS } from './reflection'

test('only the known answers to "did it say it" are kept', () => {
  assert.equal(cleanSaidIt('close'), 'close')
  assert.equal(cleanSaidIt('perfect'), null)
  assert.equal(cleanSaidIt(undefined), null)
})

test('feelings are limited to the offered words, without repeats, at most three', () => {
  assert.deepEqual(cleanFeelings(['Proud', 'Proud', 'Invented', 'Tender']), ['Proud', 'Tender'])
  assert.equal(cleanFeelings(['Proud', 'Relieved', 'Lighter', 'Tender', 'Empty']).length, MAX_FEELINGS)
  assert.deepEqual(cleanFeelings('Proud'), [])
})

test('what is left open is one idea to a line, bullets removed', () => {
  assert.deepEqual(continuationLines('- a letter to her\n\n2. the night version\n  '), ['a letter to her', 'the night version'])
})

test('nothing answered is still a valid reflection, and says so', () => {
  assert.equal(hasAnyAnswer(emptyAnswers()), false)
  assert.equal(hasAnyAnswer({ ...emptyAnswers(), felt: ['Lighter'] }), true)
})

test('the log keeps the four older columns meaning what they did', () => {
  const body = toLogBody({ said_it: 'other', felt: ['Surprised'], remembered: ' the second draft ', unresolved: 'who it is for', next: 'a shorter one' })
  assert.equal(body.what_it_opened, 'the second draft')
  assert.equal(body.unresolved, 'who it is for')
  assert.equal(body.natural_continuations, 'a shorter one')
  assert.equal(body.said_it, 'other')
})
