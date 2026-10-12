import { test } from 'node:test'
import assert from 'node:assert/strict'
import { personMoney } from './money'

const NOW = Date.parse('2026-10-12T12:00:00Z')
const money = { prices: { practice: { monthly: 9, yearly: 90 }, direction: { monthly: 29, yearly: 290 } }, netFactor: 0.75, eurPerUsd: 0.86 }
const call = (at: string, usd: number) => ({ created_at: at, cost_micros: usd * 1e6 })

test('someone who never paid: cost only, and a value below zero', () => {
  const m = personMoney([], [call('2026-10-01T10:00:00Z', 1.5), call('2026-08-20T10:00:00Z', 0.5)], money, NOW)
  assert.equal(m.costUsd, 2)
  assert.equal(m.cost30Usd, 1.5)
  assert.equal(m.calls, 2)
  assert.equal(m.paidEur, 0)
  assert.equal(m.paying, false)
  assert.ok(Math.abs(m.valueEur - -1.72) < 1e-9)
  assert.deepEqual(m.costByMonth.map((c) => c.month), ['2026-08', '2026-10'])
})

test('a monthly plan is charged at the start of each month on it', () => {
  // 70 days on Practice: three charges (day 0, ~30, ~61).
  const m = personMoney([{ kind: 'subscribed', tier: 'practice', billing_interval: 'month', created_at: '2026-08-03T12:00:00Z' }], [], money, NOW)
  assert.equal(m.paidEur, 27)
  assert.equal(m.netEur, 20.25)
  assert.equal(m.monthsPaying, 2)
  assert.equal(m.paying, true)
})

test('cancelling stops the count; a later plan starts a new one', () => {
  const m = personMoney(
    [
      { kind: 'subscribed', tier: 'practice', billing_interval: 'month', created_at: '2026-07-01T00:00:00Z' },
      { kind: 'cancel_scheduled', tier: 'practice', billing_interval: 'month', created_at: '2026-07-10T00:00:00Z' },
      { kind: 'canceled', tier: 'practice', billing_interval: 'month', created_at: '2026-07-31T00:00:00Z' },
      { kind: 'resubscribed', tier: 'direction', billing_interval: 'year', created_at: '2026-10-01T00:00:00Z' },
    ],
    [call('2026-10-05T00:00:00Z', 10)],
    money,
    NOW,
  )
  assert.equal(m.paidEur, 9 + 290)
  assert.equal(m.paying, true)
  assert.ok(Math.abs(m.valueEur - (299 * 0.75 - 8.6)) < 1e-9)
})
