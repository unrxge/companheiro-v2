import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseSignals, hasSignals, canOfferLab, LAB_OFFER_MIN_WORDS } from './check-in-prompt'

// What this guards: a parse failure here writes a plausible-looking emotional
// reading into a permanent record that the person will later read back as
// their own history, and that the companion will carry into future sessions.
// A wrong reading is worse than an absent one, so the fallback has to be
// visibly unread rather than a convincing guess.

const block = (json: string) => `Some reflection text.\n\n<signals>\n${json}\n</signals>`

test('reads a well-formed signals block', () => {
  const s = parseSignals(
    block('{"energy":"low","inner_weather":"foggy but clearing","creative_readiness":false,"arc_texture":"Integration"}')
  )
  assert.equal(s.energy, 'low')
  assert.equal(s.inner_weather, 'foggy but clearing')
  assert.equal(s.creative_readiness, false)
  assert.equal(s.arc_texture, 'Integration')
})

test('a missing block reads as unclear, never as a plausible mood', () => {
  const s = parseSignals('Just a reflection with no signals at all.')
  assert.equal(s.inner_weather, 'unclear')
})

test('malformed JSON reads as unclear rather than inventing a reading', () => {
  const s = parseSignals(block('{"energy":"low", oops'))
  assert.equal(s.inner_weather, 'unclear')
})

test('a partial block keeps what was given and marks nothing else', () => {
  const s = parseSignals(block('{"energy":"high"}'))
  assert.equal(s.energy, 'high')
  assert.equal(s.inner_weather, 'unclear')
})

test('hasSignals distinguishes a usable block from a broken one', () => {
  // The respond route relies on this: a broken block on a later turn must
  // leave the previous turn's reading standing rather than overwrite it.
  assert.equal(hasSignals(block('{"energy":"low"}')), true)
  assert.equal(hasSignals(block('{"energy": broken')), false)
  assert.equal(hasSignals('no block here'), false)
})

// What this guards: the Idea Lab door appearing on thin check-ins. The model's
// flag alone is not enough — there has to be material to carry over.
const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')

test('the Lab is not offered on a short check-in, even when the model says ready', () => {
  assert.equal(canOfferLab(true, ['Bit tired today but I had an idea about rivers.']), false)
})

test('the Lab is offered once enough has been said, counted across turns', () => {
  const half = Math.ceil(LAB_OFFER_MIN_WORDS / 2)
  assert.equal(canOfferLab(true, [words(half), words(half)]), true)
})

test('plenty said is never enough without the model reading it as ready', () => {
  assert.equal(canOfferLab(false, [words(LAB_OFFER_MIN_WORDS * 3)]), false)
  assert.equal(canOfferLab(undefined, [words(LAB_OFFER_MIN_WORDS * 3)]), false)
})
