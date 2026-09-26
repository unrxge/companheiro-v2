import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  countWords,
  joinText,
  settleSentences,
  splitSentences,
  stripRecognizerPunctuation,
  wordsUnchanged,
} from './dictation-text'

// These rules decide what gets written into someone's text while they talk.
// The complaint they exist to fix: a pause to think became a full stop, and
// the person had to go back and stitch their sentences together by hand.

test('only punctuation and case may change', () => {
  assert.ok(wordsUnchanged('so i was thinking about it', 'So I was thinking about it.'))
  assert.ok(wordsUnchanged('well i mean you know', 'Well — I mean, you know…'))
  assert.ok(!wordsUnchanged('so i was thinking', 'So I was really thinking.'))
  assert.ok(!wordsUnchanged('um so i was thinking', 'So I was thinking.'))
})

test('accented words are compared as words', () => {
  assert.ok(wordsUnchanged('the café was naïve', 'The café was naïve.'))
  // Before this was Unicode-aware, "café" and "caf" both reduced to "caf".
  assert.ok(!wordsUnchanged('café', 'caf'))
})

test('joining or splitting words is rejected, so word counts stay aligned', () => {
  assert.ok(!wordsUnchanged('this that', 'this—that'))
  assert.ok(!wordsUnchanged('self aware', 'self-aware'))
  assert.ok(wordsUnchanged('this that', 'this — that'))
})

test("the recognizer's own pause punctuation is stripped", () => {
  assert.equal(stripRecognizerPunctuation('I was thinking. About the way, it goes?'), 'I was thinking About the way it goes')
  // Only marks at the end of a word: numbers and contractions survive.
  assert.equal(stripRecognizerPunctuation("version 3.5 isn't out"), "version 3.5 isn't out")
})

test('sentences split only at a mark followed by a space', () => {
  assert.deepEqual(splitSentences('It was 3.5 metres. Then it grew! Did it?'), ['It was 3.5 metres.', 'Then it grew!', 'Did it?'])
  assert.deepEqual(splitSentences('She said “stop.” And I did'), ['She said “stop.”', 'And I did'])
  assert.deepEqual(splitSentences('and then I'), ['and then I'])
})

test('a lone dash is not a word', () => {
  assert.equal(countWords('this — that'), 2)
})

test('while talking, the last sentence always stays open', () => {
  const r = settleSentences('I went to the shop and then I thought about it.', { final: false, minFollowingWords: 6 })
  assert.equal(r.settled, '')
  assert.equal(r.settledWords, 0)
  assert.equal(r.open, 'I went to the shop and then I thought about it.')
})

test('a sentence settles only once enough speech has followed it', () => {
  const text = 'I went to the shop. And then I'
  // Three words after it: not yet — the next words could still join it on.
  assert.equal(settleSentences(text, { final: false, minFollowingWords: 6 }).settled, '')
  const longer = 'I went to the shop. And then I kept thinking about what she said'
  const r = settleSentences(longer, { final: false, minFollowingWords: 6 })
  assert.equal(r.settled, 'I went to the shop.')
  assert.equal(r.settledWords, 5)
  assert.equal(r.open, 'And then I kept thinking about what she said')
})

test('several finished sentences settle together, keeping enough open', () => {
  const text = 'One two three. Four five six. Seven eight nine ten eleven twelve'
  const r = settleSentences(text, { final: false, minFollowingWords: 6 })
  assert.equal(r.settled, 'One two three. Four five six.')
  assert.equal(r.settledWords, 6)
  assert.equal(r.open, 'Seven eight nine ten eleven twelve')
})

test('when they stop, everything settles', () => {
  const r = settleSentences('So that was it. I think.', { final: true, minFollowingWords: 6 })
  assert.equal(r.settled, 'So that was it. I think.')
  assert.equal(r.settledWords, 6)
  assert.equal(r.open, '')
})

test('joinText adds one space only where needed', () => {
  assert.equal(joinText('', 'a'), 'a')
  assert.equal(joinText('a', ''), 'a')
  assert.equal(joinText('a', 'b'), 'a b')
  assert.equal(joinText('a ', 'b'), 'a b')
  assert.equal(joinText('a\n', 'b'), 'a\nb')
})
