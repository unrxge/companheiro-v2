import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkInTourSteps, demoShows, SPOKEN_MS, TYPED_MS, REPLY_MS, DEMO, type DemoStage } from './check-in-tour'

// What this guards: the walk showing one thing while saying another.

test('every step names a stage, and the stages run in order', () => {
  const stages = checkInTourSteps().map((s) => s.stage)
  assert.deepEqual(stages, ['start', 'start', 'feeling', 'reply', 'aside', 'understood', 'added', 'end'])
})

test('the two examples never share the screen', () => {
  const none = { scene: null, feeling: false, reply: false, typing: null, typed: null, sending: null, offer: 'none' }
  assert.deepEqual(demoShows(null), none)
  assert.deepEqual(demoShows('start'), none)
  // The first is typed into the box, not shown already written.
  assert.deepEqual(demoShows('feeling'), { scene: 1, feeling: true, reply: false, typing: null, typed: DEMO.feeling, sending: null, offer: 'none' })
  assert.deepEqual(demoShows('reply'), { scene: 1, feeling: true, reply: true, typing: null, typed: null, sending: DEMO.feeling, offer: 'none' })
  // The second example starts on a cleared page: nothing of the first is left.
  assert.equal(demoShows('aside').scene, 2)
  assert.equal(demoShows('aside').feeling, false)
  assert.equal(demoShows('aside').reply, false)
  // Said as being for a project, by name, so the name is not a mystery.
  assert.match(demoShows('aside').typing ?? '', /my project “Orange Hours”/)
  assert.deepEqual(demoShows('understood'), { scene: 2, feeling: false, reply: false, typing: null, typed: null, sending: null, offer: 'offered' })
  assert.deepEqual(demoShows('added'), { scene: 2, feeling: false, reply: false, typing: null, typed: null, sending: null, offer: 'added' })
  assert.deepEqual(demoShows('end'), none)
})

test('the words are short enough to read in the time each step stands', () => {
  const plays: Record<string, number> = { aside: SPOKEN_MS + 600, feeling: TYPED_MS + 500, reply: REPLY_MS + 500 }
  for (const s of checkInTourSteps()) {
    assert.ok(s.headline.split(' ').length <= 10, s.headline)
    assert.ok(s.ms >= 2600 && s.ms <= 5600 + (plays[s.key] ?? 0), s.key)
  }
})

test('the typed example and its reply are given the time they take to play', () => {
  const steps = checkInTourSteps()
  assert.ok((steps.find((s) => s.key === 'feeling')!.wait ?? 0) >= TYPED_MS)
  assert.ok((steps.find((s) => s.key === 'reply')!.wait ?? 0) >= REPLY_MS)
  assert.equal(DEMO.note.kind, 'reminder')
})

test('the spoken example is given the time it takes to say', () => {
  assert.ok(DEMO.aside.split(' ').length > 5)
  const aside = checkInTourSteps().find((s) => s.key === 'aside')!
  assert.ok(aside.ms >= SPOKEN_MS + 2600)
  // Next waits until it has been said.
  assert.ok((aside.wait ?? 0) >= SPOKEN_MS)
})
