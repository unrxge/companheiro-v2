import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropIndex, moveItem } from './reorder'

test('a row moves down the list', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd'])
})

test('a row moves up the list', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c', 'd'], 3, 1), ['a', 'd', 'b', 'c'])
})

test('moving a row where it already is changes nothing', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 1, 1), ['a', 'b', 'c'])
})

test('a place past either end is held to the ends', () => {
  assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 99), ['b', 'c', 'a'])
  assert.deepEqual(moveItem(['a', 'b', 'c'], 2, -5), ['c', 'a', 'b'])
})

test('a row that is not there leaves the list alone', () => {
  assert.deepEqual(moveItem(['a', 'b'], 7, 0), ['a', 'b'])
  assert.deepEqual(moveItem([], 0, 0), [])
})

test('the original list is never changed', () => {
  const list = ['a', 'b', 'c']
  moveItem(list, 0, 2)
  assert.deepEqual(list, ['a', 'b', 'c'])
})

// four rows, 40px each, starting at 0
const tops = [0, 40, 80, 120]
const heights = [40, 40, 40, 40]

test('a row dragged barely at all stays where it is', () => {
  assert.equal(dropIndex(tops, heights, 1, 50), 1)
})

test('a row dragged past the one below it takes that place', () => {
  assert.equal(dropIndex(tops, heights, 0, 70), 1)
})

test('a row dragged to the bottom lands last', () => {
  assert.equal(dropIndex(tops, heights, 0, 300), 3)
})

test('a row dragged to the top lands first', () => {
  assert.equal(dropIndex(tops, heights, 3, 0), 0)
})

test('the place is never off the end of the list', () => {
  assert.equal(dropIndex(tops, heights, 2, -999), 0)
  assert.equal(dropIndex(tops, heights, 2, 9999), 3)
})

test('one row on its own has nowhere to go', () => {
  assert.equal(dropIndex([0], [40], 0, 500), 0)
})
