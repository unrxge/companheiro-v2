import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isVerbatim, normalise } from '@/lib/studio/talk/verbatim'

test('normalise: lowercases, strips punctuation and symbols, collapses whitespace', () => {
  assert.equal(normalise('  I’ll   write — tomorrow!  '), 'i ll write tomorrow')
  assert.equal(normalise('“Não vou fazer isso.”'), 'não vou fazer isso')
  assert.equal(normalise('a\n\tb'), 'a b')
  assert.equal(normalise('…'), '')
})

test('isVerbatim: accepts a span across punctuation and case differences', () => {
  const source = 'Right, so — I’ll write the second part tomorrow. Not the third.'
  assert.ok(isVerbatim("i'll write the second part tomorrow", source))
  assert.ok(isVerbatim('I’LL WRITE THE SECOND PART TOMORROW!', source))
  assert.ok(isVerbatim('Not the third', source))
  assert.ok(isVerbatim('tomorrow. Not', source))
})

test('isVerbatim: rejects a paraphrase', () => {
  const source = 'I’ll write the second part tomorrow.'
  assert.equal(isVerbatim('I will write part two tomorrow', source), false)
  assert.equal(isVerbatim('writing the second part', source), false)
  assert.equal(isVerbatim('the second part tomorrow morning', source), false)
})

test('isVerbatim: needs whole words, not fragments inside words', () => {
  assert.equal(isVerbatim('art', 'I want to start over'), false)
  assert.ok(isVerbatim('start over', 'I want to start over'))
})

test('isVerbatim: empty or punctuation-only spans never match', () => {
  assert.equal(isVerbatim('', 'anything'), false)
  assert.equal(isVerbatim('…', 'anything …'), false)
  assert.equal(isVerbatim('word', ''), false)
})

test('isVerbatim: keeps diacritics as letters (Portuguese)', () => {
  const source = 'Amanhã não vou gravar nada.'
  assert.ok(isVerbatim('não vou gravar', source))
  assert.equal(isVerbatim('nao vou gravar', source), false)
})
