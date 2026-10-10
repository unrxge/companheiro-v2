import { test } from 'node:test'
import assert from 'node:assert/strict'
import { phoneSized } from './use-phone'

// Screen sizes in CSS pixels, as the devices report them.

test('phones are phones, upright or on their side', () => {
  assert.equal(phoneSized(393, 852), true)  // iPhone 15
  assert.equal(phoneSized(852, 393), true)  // the same, turned
  assert.equal(phoneSized(320, 568), true)  // iPhone SE, first generation
  assert.equal(phoneSized(412, 915), true)  // Pixel 8
})

test('tablets are not', () => {
  assert.equal(phoneSized(744, 1133), false)  // iPad mini
  assert.equal(phoneSized(820, 1180), false)  // iPad Air
  assert.equal(phoneSized(600, 960), false)   // a small Android tablet
  assert.equal(phoneSized(1280, 800), false)  // one on its side
})

test('a foldable is a phone shut and not one open', () => {
  assert.equal(phoneSized(344, 882), true)   // Galaxy Z Fold 5, cover screen
  assert.equal(phoneSized(690, 829), false)  // the same, opened
  assert.equal(phoneSized(280, 653), true)   // the first Galaxy Fold, cover screen
  assert.equal(phoneSized(717, 512), false)  // opened: short side under 600, but near square
  assert.equal(phoneSized(841, 701), false)  // Pixel Fold, opened
  assert.equal(phoneSized(540, 720), false)  // Surface Duo, one screen
})
