import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ASSISTANT_INTRO, assistantRules } from './writing-assistant-rules'

const open = assistantRules({ selectedText: null, lockedUntil: null })

test('there is one way of working, and no mode to be in', () => {
  assert.doesNotMatch(open, /WRITE MODE|SUGGEST MODE|coach mode/i)
  assert.match(open, /BY DEFAULT YOU GUIDE/)
  assert.match(ASSISTANT_INTRO, /only when they tell you to/)
})

test('a direct order is obliged at once, including on the first message', () => {
  assert.match(open, /WHEN THEY ORDER IT/)
  assert.match(open, /right away/i)
  assert.match(open, /very first message/)
  assert.doesNotMatch(open, /first exchange/)
})

test('being stuck is not an order; an example is offered once, then waited on', () => {
  assert.match(open, /Being stuck is not an order/)
  assert.match(open, /OFFER, once/)
  assert.match(open, /Write nothing until they say yes/)
})

test('whatever it writes stays in the conversation and is never placed in the draft', () => {
  assert.match(open, /It goes in your reply/)
  assert.match(open, /Nothing you write is placed in their draft/)
  assert.doesNotMatch(open, /<proposed_edit>/)
  assert.doesNotMatch(open, /Approve|accept or reject|pending edit/i)
  assert.doesNotMatch(ASSISTANT_INTRO, /proposed_edit/)
})

test('a highlighted passage is where it starts', () => {
  assert.match(assistantRules({ selectedText: 'one line', lockedUntil: null }), /They highlighted a specific passage/)
  assert.doesNotMatch(open, /They highlighted a specific passage/)
})

test('a lock someone set on themselves is kept until it runs out', () => {
  const kept = assistantRules({ selectedText: null, lockedUntil: '2026-10-20T18:00:00Z' })
  assert.match(kept, /EVEN ON A DIRECT ORDER/)
  assert.match(kept, /2026-10-20T18:00:00Z/)
  assert.doesNotMatch(kept, /WHEN THEY ORDER IT/)
})
