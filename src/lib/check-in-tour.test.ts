import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkInTourSteps, demoShows, SPOKEN_MS, DEMO, type DemoStage } from './check-in-tour'

// What this guards: the walk showing one thing while saying another.

test('every step names a stage, and the stages run in order', () => {
  const stages = checkInTourSteps().map((s) => s.stage)
  assert.deepEqual(stages, ['start', 'start', 'feeling', 'reply', 'aside', 'understood', 'added', 'end'])
})

test('the two examples never share the screen', () => {
  assert.deepEqual(demoShows(null), { scene: null, feeling: false, reply: false, typing: null, offer: 'none' })
  assert.deepEqual(demoShows('start'), { scene: null, feeling: false, reply: false, typing: null, offer: 'none' })
  assert.deepEqual(demoShows('feeling'), { scene: 1, feeling: true, reply: false, typing: null, offer: 'none' })
  assert.deepEqual(demoShows('reply'), { scene: 1, feeling: true, reply: true, typing: null, offer: 'none' })
  // The second example starts on a cleared page: nothing of the first is left.
  assert.equal(demoShows('aside').scene, 2)
  assert.equal(demoShows('aside').feeling, false)
  assert.equal(demoShows('aside').reply, false)
  // Said as being for a project, by name, so the name is not a mystery.
  assert.equal(demoShows('aside').typing?.startsWith('A thought for my project, The Orange Hours'), true)
  assert.deepEqual(demoShows('understood'), { scene: 2, feeling: false, reply: false, typing: null, offer: 'offered' })
  assert.deepEqual(demoShows('added'), { scene: 2, feeling: false, reply: false, typing: null, offer: 'added' })
  assert.deepEqual(demoShows('end'), { scene: null, feeling: false, reply: false, typing: null, offer: 'none' })
})

test('the words are short enough to read in the time each step stands', () => {
  for (const s of checkInTourSteps()) {
    assert.ok(s.headline.split(' ').length <= 10, s.headline)
    assert.ok(s.ms >= 2600 && s.ms <= 5600 + (s.key === 'aside' ? SPOKEN_MS : 0))
  }
})

test('the spoken example is given the time it takes to say', () => {
  assert.ok(DEMO.aside.split(' ').length > 5)
  const aside = checkInTourSteps().find((s) => s.key === 'aside')!
  assert.ok(aside.ms >= SPOKEN_MS + 2600)
  // Next waits until it has been said.
  assert.ok((aside.wait ?? 0) >= SPOKEN_MS)
})
