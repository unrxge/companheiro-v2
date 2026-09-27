import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diagnose, variantOf, type CallRow } from './diagnose'
import { describeRequest } from './ai-calls'

const base: CallRow = {
  id: 1, at: '2026-09-27T00:00:00Z', route: 'write/chat', model: 'claude-sonnet-4-6', requested_model: 'claude-sonnet-4-6',
  input: 500, output: 300, cache_write: 0, cache_read: 9000, cost: 10000, ms: 4000, stop: 'end_turn', context: {}, user: 'abc',
}
const norms = { avg_input: 10000, avg_output: 300, cache_read_share: 0.8 }

test('a cut-off reply is the serious finding', () => {
  const f = diagnose({ ...base, stop: 'max_tokens', context: { max: 8192 } }, norms)
  assert.equal(f[0].level, 'serious')
  assert.match(f[0].text, /8\.2k-token cap/)
})

test('a cache miss on a cached task is named', () => {
  const f = diagnose({ ...base, cache_read: 0, cache_write: 9000, context: { sysCached: 30000 } }, norms)
  assert.ok(f.some((x) => /cache miss/.test(x.text)))
})

test('long history and a dominant labelled part are named', () => {
  const f = diagnose({ ...base, context: { turns: 30, history: 50000, parts: { core_concept: 2000, preceding_sections: 20000 } } }, norms)
  assert.ok(f.some((x) => /30 earlier messages/.test(x.text)))
  assert.ok(f.some((x) => /preceding sections/.test(x.text)))
})

test('the fast-model swap is reported', () => {
  const f = diagnose({ ...base, model: 'claude-haiku-4-5' }, norms)
  assert.ok(f.some((x) => /soft fair-use/.test(x.text)))
})

test('an ordinary call says nothing stands out', () => {
  assert.equal(diagnose(base, norms)[0].level, 'good')
})

test('variantOf picks the first labelled key', () => {
  assert.equal(variantOf({ phase: 3 }), 'phase: 3')
  assert.equal(variantOf({}), 'all')
})

test('describeRequest measures shape, never keeps text', () => {
  const shape = describeRequest({
    max_tokens: 1024,
    system: [{ type: 'text', text: 'x'.repeat(100), cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'y'.repeat(20) }],
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: [{ type: 'text', text: 'hi there' }] },
      { role: 'user', content: 'abc' },
    ],
  })
  assert.deepEqual(shape, { sys: [100, 20], sysCached: 100, turns: 2, history: 13, last: 3, histCached: false, media: 0, tools: 0, max: 1024 })
  assert.ok(!JSON.stringify(shape).includes('hello'))
})
