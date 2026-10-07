import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatDateAsRelative, formatDateShort } from './dates'

// What this guards: dates that read like "Thursday (20 days ago)". A weekday
// only helps inside the current week.
const now = new Date(2026, 9, 7, 15, 0) // Wed 7 Oct 2026
const ago = (days: number, hour = 12) => new Date(2026, 9, 7 - days, hour).toISOString()

test('today and yesterday are said plainly, by calendar day', () => {
  assert.equal(formatDateAsRelative(ago(0, 1), now), 'Today')
  assert.equal(formatDateAsRelative(ago(1, 23), now), 'Yesterday')
})

test('within the week the weekday leads', () => {
  assert.equal(formatDateAsRelative(ago(3), now), 'Sunday (3 days ago)')
})

test('past a week it is the date, with a span that grows coarser', () => {
  assert.equal(formatDateAsRelative(ago(9), now), '28 Sep (9 days ago)')
  assert.equal(formatDateAsRelative(ago(20), now), '17 Sep (2 weeks ago)')
  assert.equal(formatDateAsRelative(ago(90), now), '9 Jul (3 months ago)')
  assert.equal(formatDateAsRelative(ago(400), now), '2 Sep 2025 (1 year ago)')
})

test('the short form drops to the bare date after a week', () => {
  assert.equal(formatDateShort(ago(0), now), 'today')
  assert.equal(formatDateShort(ago(4), now), '4 days ago')
  assert.equal(formatDateShort(ago(30), now), '7 Sep')
})
