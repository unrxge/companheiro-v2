import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entitlementsFor, isResting, restEndsAt, REST_DAYS } from './billing/entitlements'
import type { Subscription } from './billing/access'

const sub = (over: Partial<Subscription>): Subscription => ({
  status: 'trialing',
  tier: null,
  trial_ends_at: null,
  current_period_end: null,
  cancel_at_period_end: false,
  repeat_trial: false,
  ...over,
})
const soon = new Date(Date.now() + 86_400_000).toISOString()
const past = new Date(Date.now() - 86_400_000).toISOString()

test('a live trial has everything Direction has', () => {
  const e = entitlementsFor(sub({ trial_ends_at: soon }))
  assert.deepEqual(e, { plan: 'trial', companion: true, maxActiveProjects: null, threads: true, media: true, visionTalk: true, deepQuestions: false })
})

test('Practice is two projects at a time, in words', () => {
  const e = entitlementsFor(sub({ status: 'active', tier: 'practice' }))
  assert.deepEqual(e, { plan: 'practice', companion: true, maxActiveProjects: 2, threads: false, media: false, visionTalk: false, deepQuestions: false })
  // A paid plan with no tier recorded is treated as the smaller one.
  assert.equal(entitlementsFor(sub({ status: 'active', tier: null })).plan, 'practice')
  // A failed payment does not take the plan away.
  assert.equal(entitlementsFor(sub({ status: 'past_due', tier: 'direction' })).plan, 'direction')
})

test('Direction has no limit and every canvas tool', () => {
  const e = entitlementsFor(sub({ status: 'active', tier: 'direction' }))
  assert.equal(e.maxActiveProjects, null)
  assert.ok(e.threads && e.media && e.visionTalk && e.companion)
})

test('an ended trial and a cancelled plan keep the work in Practice’s shape, companion resting', () => {
  for (const s of [sub({ trial_ends_at: past }), sub({ status: 'canceled', tier: 'direction' })]) {
    const e = entitlementsFor(s)
    assert.equal(e.plan, 'ended')
    assert.equal(e.companion, false)
    assert.equal(e.maxActiveProjects, 2)
    assert.equal(e.media, false)
  }
})

test('accounts from before billing, and a missing row, lose no feature', () => {
  assert.equal(entitlementsFor(sub({ status: 'grandfathered' })).maxActiveProjects, null)
  const unknown = entitlementsFor(null)
  assert.equal(unknown.plan, 'unknown')
  assert.ok(unknown.threads && unknown.media && unknown.maxActiveProjects === null)
})

test('a rest lasts REST_DAYS from when the place was given up', () => {
  const from = Date.parse('2026-10-02T10:00:00.000Z')
  assert.equal(restEndsAt(from), new Date(from + REST_DAYS * 86_400_000).toISOString())
  assert.equal(isResting(soon), true)
  assert.equal(isResting(past), false)
  assert.equal(isResting(null), false)
})
