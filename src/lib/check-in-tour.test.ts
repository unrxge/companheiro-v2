import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkInTourSteps, demoShows, type DemoStage } from './check-in-tour'

// What this guards: the walk showing one thing while saying another.

test('every step names a stage, and the stages run in order', () => {
  const stages = checkInTourSteps().map((s) => s.stage)
  assert.deepEqual(stages, ['start', 'feeling', 'reply', 'aside', 'understood', 'added', 'end'])
})

test('the example builds up step by step and is cleared at both ends', () => {
  const at = (s: DemoStage | null) => demoShows(s)
  assert.deepEqual(at(null), { feeling: false, reply: false, typing: null, offer: 'none' })
  assert.deepEqual(at('start'), { feeling: false, reply: false, typing: null, offer: 'none' })
  assert.deepEqual(at('feeling'), { feeling: true, reply: false, typing: null, offer: 'none' })
  assert.deepEqual(at('reply'), { feeling: true, reply: true, typing: null, offer: 'none' })
  assert.equal(at('aside').typing?.startsWith('Note for'), true)
  assert.deepEqual(at('understood'), { feeling: true, reply: true, typing: null, offer: 'offered' })
  assert.deepEqual(at('added'), { feeling: true, reply: true, typing: null, offer: 'added' })
  assert.deepEqual(at('end'), { feeling: false, reply: false, typing: null, offer: 'none' })
})

test('the words are short enough to read in the time each step stands', () => {
  for (const s of checkInTourSteps()) {
    assert.ok(s.headline.split(' ').length <= 9, s.headline)
    assert.ok(s.ms >= 2600 && s.ms <= 5600)
  }
})
