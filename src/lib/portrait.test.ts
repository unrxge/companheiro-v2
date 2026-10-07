import { test } from 'node:test'
import assert from 'node:assert/strict'
import { overCap } from './portrait'

// What this guards: the portrait drifting past its limit. The old trim retired
// one entry per call while two could be added, and reached 59 entries for
// three people against a cap of 15 each.
const entry = (id: string, kind: string, count: number, day: number) => ({
  id, kind, reinforcement_count: count, last_reinforced_at: new Date(2026, 0, day).toISOString(),
})

test('retires everything over the cap in a section, weakest first', () => {
  const list = Array.from({ length: 14 }, (_, i) => entry(`t${i}`, 'recurring_theme', i + 1, 1))
  assert.deepEqual(overCap(list).sort(), ['t0', 't1', 't2', 't3'])
})

test('sections are capped separately', () => {
  const list = [
    ...Array.from({ length: 10 }, (_, i) => entry(`a${i}`, 'recurring_theme', 1, i + 1)),
    ...Array.from({ length: 10 }, (_, i) => entry(`b${i}`, 'guidance_note', 1, i + 1)),
  ]
  assert.deepEqual(overCap(list), [])
})

test('on equal reinforcement the one seen longest ago goes', () => {
  const list = Array.from({ length: 11 }, (_, i) => entry(`c${i}`, 'creative_pattern', 2, i + 1))
  assert.deepEqual(overCap(list), ['c0'])
})
