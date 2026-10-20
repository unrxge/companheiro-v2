import { test } from 'node:test'
import assert from 'node:assert/strict'
import { suggestedThemes, suggestionCount } from './territories'

test('three suggestions for up to two themes, two for three, none from four', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 6].map(suggestionCount), [3, 3, 3, 2, 0, 0])
})

test('a suggestion never repeats a theme they already have', () => {
  const s = suggestedThemes(['Creativity, devotion & curiosity', 'Slow living & life in service'], 3)
  assert.equal(s.length, 3)
  assert.ok(s.every((x) => !/creativity|devotion|slow|living/i.test(x)))
  assert.deepEqual(suggestedThemes(['Grief'], 0), [])
})
