import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ASSISTANT_INTRO, assistantRules } from './writing-assistant-rules'

const open = assistantRules({ canPlace: true, selectedText: null, lockedUntil: null })

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

test('a change to the text is only placed into an open, focused section', () => {
  assert.match(open, /<proposed_edit>\nthe revised text\n<\/proposed_edit>/)
  const locked = assistantRules({ canPlace: false, whyNot: 'locked-section', selectedText: null, lockedUntil: null })
  assert.doesNotMatch(locked, /the revised text/)
  assert.match(locked, /this section is locked/)
  const nowhere = assistantRules({ canPlace: false, whyNot: 'no-section', selectedText: null, lockedUntil: null })
  assert.doesNotMatch(nowhere, /the revised text/)
  assert.match(nowhere, /no section is in focus/)
})

test('a highlighted passage is the whole scope of a change', () => {
  const picked = assistantRules({ canPlace: true, selectedText: 'one line', lockedUntil: null })
  assert.match(picked, /ENTIRE scope/)
  assert.match(open, /whole section/)
})

test('a lock someone set on themselves is kept until it runs out', () => {
  const kept = assistantRules({ canPlace: false, selectedText: null, lockedUntil: '2026-10-20T18:00:00Z' })
  assert.match(kept, /EVEN ON A DIRECT ORDER/)
  assert.match(kept, /2026-10-20T18:00:00Z/)
  assert.doesNotMatch(kept, /WHEN THEY ORDER IT/)
  assert.doesNotMatch(kept, /the revised text/)
})
