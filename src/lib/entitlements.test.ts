import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entitlementsFor, isResting, restEndsAt, REST_DAYS, type Entitlements } from './billing/entitlements'
import { planIsStale, type PlanStatus } from './billing/use-plan'
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
  assert.deepEqual(e, { plan: 'trial', companion: true, maxActiveProjects: null, threads: true, media: true, visionTalk: true, deepQuestions: false, checkInNotes: true })
})

test('Practice is two projects at a time, with threads but no media', () => {
  const e = entitlementsFor(sub({ status: 'active', tier: 'practice' }))
  assert.deepEqual(e, { plan: 'practice', companion: true, maxActiveProjects: 2, threads: true, media: false, visionTalk: false, deepQuestions: false, checkInNotes: false })
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

// ── a plan that changes while a tab is open (billing/use-plan.ts) ───────────

const held = (over: Partial<PlanStatus['subscription'] & object>, plan: Entitlements['plan']): PlanStatus => ({
  subscription: { status: 'trialing', tier: null, trial_ends_at: null, current_period_end: null, cancel_at_period_end: false, ...over },
  access: 'capped',
  usage: null,
  entitlements: { ...entitlementsFor(null), plan },
})

test('a tab asks again once the free month it read has run out', () => {
  const now = Date.parse('2026-10-13T12:00:00.000Z')
  const read = now - 30_000
  assert.equal(planIsStale(held({ trial_ends_at: '2026-10-13T11:59:50.000Z' }, 'trial'), read, now), true)
  assert.equal(planIsStale(held({ trial_ends_at: '2026-10-20T00:00:00.000Z' }, 'trial'), read, now), false)
  // Already read as ended: nothing more to learn from asking.
  assert.equal(planIsStale(held({ trial_ends_at: '2026-10-13T11:59:50.000Z' }, 'ended'), read, now), false)
})

test('and once a cancelled plan’s paid time is up, or the tab has been left a while', () => {
  const now = Date.parse('2026-10-13T12:00:00.000Z')
  const paid = { status: 'active', tier: 'direction' as const }
  assert.equal(planIsStale(held({ ...paid, cancel_at_period_end: true, current_period_end: '2026-10-13T11:00:00.000Z' }, 'direction'), now - 30_000, now), true)
  assert.equal(planIsStale(held({ ...paid, cancel_at_period_end: true, current_period_end: '2026-11-13T11:00:00.000Z' }, 'direction'), now - 30_000, now), false)
  assert.equal(planIsStale(held(paid, 'direction'), now - 30_000, now), false)
  assert.equal(planIsStale(held(paid, 'direction'), now - 6 * 60_000, now), true)
  assert.equal(planIsStale(null, 0, now), false)
})
