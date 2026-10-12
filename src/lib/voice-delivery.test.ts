import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerFor, deliveryFor, trimForSpeech, parseVoiceContext } from './voice-delivery'

// What this guards: the voice performing. Every instruction must be about
// pace and pause; a feeling word in here makes the speech model act.

test('low energy is read as depleted whatever else is true', () => {
  assert.equal(registerFor({ energy: 'low', movement: 'Expansion' }), 'depleted')
  assert.equal(registerFor({ energy: 'low', movement: 'Breakaway' }), 'depleted')
})

test('the four registers follow energy and movement', () => {
  assert.equal(registerFor({ energy: 'medium', movement: 'Breakaway' }), 'restless')
  assert.equal(registerFor({ energy: 'high', movement: 'Expansion' }), 'lifted')
  assert.equal(registerFor({ energy: 'medium', movement: 'Beginning' }), 'lifted')
  assert.equal(registerFor({ energy: 'high', movement: 'Integration' }), 'settled')
})

test('with no reading at all it falls back to the settled register', () => {
  assert.equal(registerFor({}), 'settled')
})

test('no register ever asks the model to feel something', () => {
  const feeling = /\b(warm|tender|compassion|empath|caring|gentle|sooth|encourag|loving|sad|happy|excited|cheerful|kind)\w*/i
  for (const energy of ['low', 'medium', 'high'] as const) {
    for (const movement of ['Breakaway', 'Beginning', 'Expansion', 'Integration'] as const) {
      for (const text of ['It was a full day.', 'What stayed with you?']) {
        const d = deliveryFor({ energy, movement, hour: 22 }, text)
        const affirmative = d.replace(/No added brightness or enthusiasm\./, '').replace(/do not act any emotion/, '')
        assert.equal(feeling.test(affirmative), false, d)
      }
    }
  }
})

test('a closing question and a closing statement are read differently', () => {
  assert.match(deliveryFor({}, 'You went anyway. What was that like?'), /final question/)
  assert.match(deliveryFor({}, 'You went anyway.'), /come to rest/)
})

test('late at night it is asked to be quiet, in the day it is not', () => {
  assert.match(deliveryFor({ hour: 23 }, 'x.'), /late where they are/)
  assert.doesNotMatch(deliveryFor({ hour: 9 }, 'x.'), /late where they are/)
})

test('long replies are cut at a sentence end, and marks for the eye are dropped', () => {
  const text = 'First sentence here. Second sentence here. Third *sentence* that will not fit in the limit at all.'
  assert.equal(trimForSpeech(text, 50), 'First sentence here. Second sentence here.')
  assert.equal(trimForSpeech('A *plain* line.', 100), 'A plain line.')
})

test('only known values are accepted from the browser', () => {
  assert.deepEqual(parseVoiceContext({ energy: 'furious', movement: 'Breakaway', hour: 99 }), { energy: null, movement: 'Breakaway', hour: null })
  assert.deepEqual(parseVoiceContext(null), { energy: null, movement: null, hour: null })
})
