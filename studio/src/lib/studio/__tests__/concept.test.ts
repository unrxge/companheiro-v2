import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanTitle, diffSummary, extractUrls, isVerbatim, normalise, parseModelJson, referencesFrom, sameRevision,
  sentenceAround, sortRevisions, splitConstraints, validateDraft,
} from '../concept'
import type { ConceptRevision } from '../types'

const rev = (body: string, constraints: string[], created_at = '2026-09-12T10:00:00Z', id = 'a'): ConceptRevision => ({
  id, project_id: 'p', body, constraints, origin: 'edit', created_at,
})

test('normalise lowercases, strips punctuation and collapses spaces', () => {
  assert.equal(normalise('  I WON\'T use   stock photos!  '), 'i wont use stock photos')
})

test('isVerbatim accepts a span across punctuation and case, rejects a paraphrase', () => {
  const source = 'A quiet essay about my grandmother. I won\'t use stock photos, ever.'
  assert.equal(isVerbatim('i wont use stock photos', source), true)
  assert.equal(isVerbatim('quiet essay about my grandmother', source), true)
  assert.equal(isVerbatim('no stock photography', source), false)
  assert.equal(isVerbatim('', source), false)
})

test('splitConstraints drops bullets, blanks and duplicates', () => {
  assert.deepEqual(splitConstraints('- one line\n\n• one line\n* two lines\n'), ['one line', 'two lines'])
})

test('diffSummary counts lines and constraints', () => {
  const prev = rev('first line\nsecond line', ['keep it short'])
  const next = rev('first line\nsecond line\nthird line\nfourth line', [])
  assert.equal(diffSummary(prev, next), '+2 lines · −1 constraint')
  assert.equal(diffSummary(null, next), 'first version')
  assert.equal(diffSummary(prev, rev('first line\nsecond line', ['keep it short'])), 'no change')
  assert.equal(diffSummary(prev, rev('first line\nsecond line', ['keep it short', 'no photos'])), '+1 constraint')
})

test('sameRevision compares body and constraints', () => {
  assert.equal(sameRevision(rev('a', ['x']), rev('a ', ['x'])), true)
  assert.equal(sameRevision(rev('a', ['x']), rev('a', ['y'])), false)
})

test('sortRevisions is newest first', () => {
  const list = [rev('a', [], '2026-09-01T00:00:00Z', 'a'), rev('b', [], '2026-09-03T00:00:00Z', 'b'), rev('c', [], '2026-09-02T00:00:00Z', 'c')]
  assert.deepEqual(sortRevisions(list).map((r) => r.id), ['b', 'c', 'a'])
})

test('extractUrls finds each url once and drops trailing punctuation', () => {
  const text = 'see https://example.com/a. and (https://example.com/b), again https://example.com/a and www.site.org/x.'
  assert.deepEqual(extractUrls(text), ['https://example.com/a', 'https://example.com/b', 'www.site.org/x'])
})

test('sentenceAround returns the sentence with the url removed', () => {
  const text = 'A first sentence. The tone I want is here https://example.com/tone, roughly. Another one.'
  assert.equal(sentenceAround(text, 'https://example.com/tone'), 'The tone I want is here, roughly.')
  assert.deepEqual(referencesFrom(text), [{ url: 'https://example.com/tone', title: '', note: 'The tone I want is here, roughly.' }])
})

test('parseModelJson tolerates fences and prose', () => {
  assert.deepEqual(parseModelJson('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(parseModelJson('here it is: {"a":{"b":2}} thanks'), { a: { b: 2 } })
  assert.equal(parseModelJson('nothing'), null)
})

test('cleanTitle lowercases and caps at six words', () => {
  assert.equal(cleanTitle('A Long Title With Far Too Many Words.'), 'a long title with far too')
  assert.equal(cleanTitle(42), '')
})

test('validateDraft keeps only verbatim anchors and quotes, builds references from the input', () => {
  const source = 'An essay for my sister about leaving the city. I won\'t make it nostalgic. It must keep her voice. Ref https://a.io/x here.'
  const out = validateDraft(
    {
      title: 'Leaving The City, For Her',
      body: 'An essay for your sister.',
      constraints: ['short', '- short', 'plain'],
      anchor_candidates: ['leaving the city', 'a paraphrase that was never said', 'keep her voice', 'keep her voice'],
      references: [{ url: 'https://model-invented.example', title: 'x', note: 'y' }],
      compass_seed: [
        { kind: 'refusal', statement: 'no nostalgia', quote: 'I won\'t make it nostalgic' },
        { kind: 'non_negotiable', statement: 'her voice stays', quote: 'invented words' },
        { kind: 'drift', statement: 'nope', quote: 'It must keep her voice' },
      ],
    },
    source
  )
  assert.equal(out.title, 'leaving the city, for her')
  assert.deepEqual(out.constraints, ['short', 'plain'])
  assert.deepEqual(out.anchor_candidates, ['leaving the city', 'keep her voice'])
  assert.deepEqual(out.references, [{ url: 'https://a.io/x', title: '', note: 'Ref here.' }])
  assert.deepEqual(out.compass_seed, [{ kind: 'refusal', statement: 'no nostalgia', quote: 'I won\'t make it nostalgic' }])
})

test('validateDraft survives garbage', () => {
  const out = validateDraft(null, 'plain words')
  assert.deepEqual(out, { title: '', body: '', constraints: [], anchor_candidates: [], references: [], compass_seed: [] })
})
