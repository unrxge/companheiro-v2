import { test } from 'node:test'
import assert from 'node:assert/strict'
import { weatherDays, type StoredCheckIn } from './check-in-signals'

// What this guards: the Inner weather strip draws every check-in on one ruler.
// A session of a given length must weigh the same whether it stood alone on a
// day or shared it, and a check-in must land on the person's own calendar day.

function talk(messages: number): string {
  return Array.from({ length: messages }, (_, i) => `${i % 2 === 0 ? 'You' : 'Companheiro'}: line ${i}`).join('\n\n')
}

function at(daysAgo: number, hour: number, messages: number, id: string): StoredCheckIn {
  const d = new Date()
  d.setHours(hour, 0, 0, 0)
  d.setDate(d.getDate() - daysAgo)
  return {
    id,
    created_at: d.toISOString(),
    raw_entry: 'x',
    energy: 'medium',
    inner_weather: 'steady',
    arc_texture: 'Expansion',
    full_conversation: talk(messages),
  }
}

test('weight is the message count, the same alone or sharing a day', () => {
  const days = weatherDays([at(1, 9, 10, 'a'), at(2, 9, 10, 'b'), at(2, 15, 10, 'c')], 3)
  const alone = days[1].checkIns![0]
  const shared = days[0].checkIns!
  assert.equal(alone.weight, 10)
  assert.deepEqual(shared.map((r) => r.weight), [10, 10])
})

test('a very long conversation is capped, a one-liner keeps a floor', () => {
  const days = weatherDays([at(1, 9, 80, 'long'), at(2, 9, 1, 'short')], 3)
  assert.equal(days[1].checkIns![0].weight, 30)
  assert.equal(days[0].checkIns![0].weight, 2)
})

test('a check-in just after local midnight belongs to that local day', () => {
  const days = weatherDays([at(1, 0, 6, 'late')], 3)
  assert.equal(days[1].checkIns?.length, 1)
  assert.equal(days[0].checkIns, undefined)
})
