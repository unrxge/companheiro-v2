import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDisposableEmail, normaliseEmail } from './billing/email'
import { allowanceFor, costMicros } from './billing/fair-use'
import type { Subscription } from './billing/access'

test('normaliseEmail folds every spelling of one inbox together', () => {
  assert.equal(normaliseEmail(' J.Doe+week2@Gmail.com '), 'jdoe@gmail.com')
  assert.equal(normaliseEmail('j.doe@googlemail.com'), 'jdoe@gmail.com')
  // Dots only matter to Gmail; elsewhere they are different inboxes.
  assert.equal(normaliseEmail('j.doe+x@icloud.com'), 'j.doe@icloud.com')
  assert.equal(normaliseEmail('not-an-email'), null)
})

test('disposable domains are caught, ordinary ones are not', () => {
  assert.equal(isDisposableEmail('someone@mailinator.com'), true)
  assert.equal(isDisposableEmail('someone@gmail.com'), false)
})

test('costMicros prices by model family, cache writes at the 1h rate', () => {
  // 1M Sonnet input tokens = $3
  assert.equal(costMicros('claude-sonnet-4-6', { input_tokens: 1_000_000 }), 3_000_000)
  // 1M Haiku output = $5
  assert.equal(costMicros('claude-haiku-4-5-20251001', { output_tokens: 1_000_000 }), 5_000_000)
  // cache write 2x, cache read 0.1x of Haiku input
  assert.equal(costMicros('claude-haiku-4-5', { cache_creation_input_tokens: 1_000_000, cache_read_input_tokens: 1_000_000 }), 2_100_000)
  // unknown models are charged as Sonnet
  assert.equal(costMicros('some-future-model', { input_tokens: 1_000_000 }), 3_000_000)
})

const sub = (over: Partial<Subscription>): Subscription => ({
  status: 'trialing',
  tier: null,
  trial_ends_at: null,
  current_period_end: null,
  cancel_at_period_end: false,
  repeat_trial: false,
  ...over,
})

test('allowanceFor maps plan state to a cap', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString()
  const past = new Date(Date.now() - 1000).toISOString()
  assert.deepEqual(allowanceFor(sub({ trial_ends_at: future })), { kind: 'capped', period: 'trial', capMicros: 2_000_000, plan: 'trial' })
  assert.equal(allowanceFor(sub({ trial_ends_at: past })).kind, 'no_access')
  assert.equal(allowanceFor(sub({ status: 'grandfathered' })).kind, 'uncapped')
  const practice = allowanceFor(sub({ status: 'active', tier: 'practice' }))
  assert.equal(practice.kind === 'capped' && practice.capMicros, 4_000_000)
  assert.equal(allowanceFor(sub({ status: 'active', tier: 'direction' })).kind, 'uncapped')
  assert.equal(allowanceFor(sub({ status: 'canceled' })).kind, 'no_access')
  assert.equal(allowanceFor(null).kind, 'no_access')
})
