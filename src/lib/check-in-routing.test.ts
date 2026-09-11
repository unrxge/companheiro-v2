import { test } from 'node:test'
import assert from 'node:assert/strict'
import { modelForCheckIn } from './check-in-routing'
import { MODELS } from './models'

// This function decides, on every single check-in turn, whether the moment is
// worth the more expensive model. It has already shipped one bug that silently
// pinned entire conversations to the deep model — the escalation triggers were
// being measured against the whole accumulated session rather than the current
// turn, so three of the four latched and never released.
//
// The property that matters is not "does it escalate". It is: does it come
// back down. These tests exist to keep that true.

const tier = (input: Parameters<typeof modelForCheckIn>[0]) =>
  modelForCheckIn(input) === MODELS.deep ? 'deep' : 'fast'

const chars = (n: number) => 'word '.repeat(Math.ceil(n / 5)).slice(0, n)

test('ordinary short check-in stays on the fast model', () => {
  assert.equal(tier({ currentText: 'bit tired today, nothing much going on' }), 'fast')
})

test('a dense opening entry earns the deep model', () => {
  assert.equal(tier({ currentText: chars(1300) }), 'deep')
})

test('delicate material escalates immediately, even when brief', () => {
  assert.equal(tier({ currentText: 'I keep thinking I want to die' }), 'deep')
  assert.equal(tier({ currentText: 'my father died on Tuesday' }), 'deep')
})

test('delicate material is caught in other languages too', () => {
  assert.equal(tier({ currentText: 'não aguento mais isto' }), 'deep')
  assert.equal(tier({ currentText: 'je veux en finir' }), 'deep')
})

test('two substantial turns in a row means deep water right now', () => {
  assert.equal(tier({ currentText: chars(450), previousText: chars(450) }), 'deep')
})

test('one substantial turn after a throwaway one does not escalate', () => {
  assert.equal(tier({ currentText: chars(450), previousText: 'ok' }), 'fast')
})

// Regression guard for the actual cost bug: at the old 120-char threshold an
// ordinary reflective reply (≈30 words) counted as "substantial", so most
// real two-turn exchanges escalated to the deep model by turn two. This is
// what a genuinely ordinary check-in reply looks like — it must stay fast.
test('an ordinary reflective reply, even two turns running, stays fast', () => {
  const ordinary =
    'work was fine today, nothing dramatic, just tired by the end of it and glad to be sitting down'
  assert.equal(tier({ currentText: ordinary, previousText: ordinary }), 'fast')
})

test('depletion escalates regardless of how little they wrote', () => {
  assert.equal(tier({ currentText: 'im ok', energy: 'low' }), 'deep')
})

// ── The decay window: the reason this file exists ──────────────────────────

test('escalation survives the turn straight after delicate material', () => {
  // Answering something hard with three words must not drop them onto the
  // cheaper model mid-thought.
  assert.equal(
    tier({ currentText: 'yeah. I suppose so', previousText: 'I keep thinking I want to die' }),
    'deep'
  )
})

test('escalation releases once the subject has actually moved on', () => {
  assert.equal(
    tier({
      currentText: 'anyway, the piece is going well',
      previousText: 'lets talk about something else',
    }),
    'fast'
  )
})

test('recovering energy returns them to the fast model', () => {
  assert.equal(tier({ currentText: 'feeling better now', previousText: 'ok', energy: 'medium' }), 'fast')
})

test('nothing latches: a long session of light turns stays fast throughout', () => {
  const light = ['not much', 'yeah', 'fine really', 'the usual', 'ok']
  for (let i = 1; i < light.length; i++) {
    assert.equal(
      tier({ currentText: light[i], previousText: light[i - 1] }),
      'fast',
      `turn ${i + 1} should not have escalated`
    )
  }
})
