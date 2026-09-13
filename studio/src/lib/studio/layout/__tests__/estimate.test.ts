import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateH, innerWidth, lines } from '@/lib/studio/layout/estimate'
import { registry } from '@/lib/studio/registry'
import { BLOCK_TYPES } from '@/lib/studio/types'
import { W, WIDE, FULL } from '@/lib/studio/layout/constants'

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i % 7}`).join(' ')

test('estimate: monotone in text length for every text block', () => {
  const cases: Array<[Parameters<typeof estimateH>[0], (t: string) => unknown, number]> = [
    ['update', (text) => ({ text }), W],
    ['note', (text) => ({ text }), W],
    ['anchor', (text) => ({ text, source_block_id: null }), WIDE],
    ['heading', (text) => ({ text, size: 'lg' }), 384],
    ['commitment', (text) => ({ text }), W],
    ['reference', (note) => ({ url: 'https://x', title: 't', note }), W],
    ['recording', (note) => ({ asset_id: 'a', title: 't', note }), W],
    ['concept', (body) => ({ body, constraints: ['a', 'b'] }), FULL],
  ]
  for (const [type, make, w] of cases) {
    let prev = -1
    for (let n = 0; n <= 400; n += 25) {
      const h = estimateH(type, make(words(n)), w)
      assert.ok(h >= prev, `${type}: h(${n} words)=${h} < previous ${prev}`)
      prev = h
    }
    assert.ok(prev > estimateH(type, make(''), w), `${type}: long text taller than empty`)
  }
})

test('estimate: every result is a multiple of 8 and respects the type minimum', () => {
  const samples: Array<[Parameters<typeof estimateH>[0], unknown, number, Parameters<typeof estimateH>[3]]> = [
    ['concept', {}, FULL, undefined],
    ['concept', { body: words(60), constraints: ['one'] }, FULL, undefined],
    ['since', {}, FULL, undefined],
    ['since', {}, FULL, { rows: 3 }],
    ['update', { text: words(13) }, W, undefined],
    ['timeline', { title: null }, W, { rows: 11 }],
    ['timeline', { title: null }, W, undefined],
    ['draft', { draft_id: 'd' }, W, { sections: 4 }],
    ['anchor', { text: words(9) }, WIDE, undefined],
    ['note', { text: 'a\nb\nc' }, W, undefined],
    ['reference', { url: 'u', title: 'a title', note: words(5) }, W, undefined],
    ['commitment', { entry_id: 'c' }, W, undefined],
    ['commitment', { text: words(7) }, W, undefined],
    ['compass', {}, W, { rows: 5 }],
    ['heading', { text: 'part one', size: 'md' }, 384, undefined],
    ['divider', {}, 256, undefined],
    ['image', { aspect: 1.5, caption: 'a caption' }, W, undefined],
    ['image', { aspect: 1.5, caption: '' }, 328, undefined],
    ['gallery', { items: [], columns: 3 }, WIDE, undefined],
    ['frame', { expanded_h: 300, tint: 'none' }, 512, undefined],
    ['recording', { asset_id: 'a', title: 't', note: '', transcript: words(30) }, W, undefined],
    ['palette', { swatches: Array.from({ length: 11 }, () => ({ hex: '#000', name: null })) }, W, undefined],
  ]
  for (const [type, content, w, extra] of samples) {
    const h = estimateH(type, content, w, extra)
    assert.equal(h % 8, 0, `${type}: ${h} not a multiple of 8`)
    assert.ok(h >= registry[type].minH, `${type}: ${h} below minH ${registry[type].minH}`)
    assert.ok(Number.isFinite(h) && h > 0, `${type}: ${h} not a positive number`)
  }
  for (const type of BLOCK_TYPES) {
    const h = estimateH(type, {}, registry[type].defaultW)
    assert.equal(h % 8, 0, `${type} with empty content: ${h}`)
    assert.ok(h >= registry[type].minH)
  }
})

test('estimate: divider is 8, image follows its aspect, caption adds 52 px', () => {
  assert.equal(estimateH('divider', {}, 256), 8)
  assert.equal(estimateH('image', { aspect: 2, caption: '' }, 320), 160)
  assert.equal(estimateH('image', { aspect: 2, caption: 'x' }, 320), 160 + 52 + 4) // ceil8(212) = 216
})

test('estimate: paper types lose 32 px of width, paperless keep it', () => {
  assert.equal(innerWidth('note', 320), 288)
  assert.equal(innerWidth('image', 320), 288)
  assert.equal(innerWidth('anchor', 320), 320)
  // 16 px text at 0.5 em → 8 px per char; 36 chars fill a 288 px line exactly, 37 wrap
  assert.equal(lines('x'.repeat(36), 16, 1.5, 288), 24)
  assert.equal(lines('x'.repeat(37), 16, 1.5, 288), 48)
  assert.equal(lines('', 16, 1.5, 288), 24)
  assert.equal(lines('a\nb', 16, 1.5, 288), 48)
})

test('estimate: timeline folds after 6 rows', () => {
  const six = estimateH('timeline', { title: null }, W, { rows: 6 })
  const seven = estimateH('timeline', { title: null }, W, { rows: 7 })
  const twenty = estimateH('timeline', { title: null }, W, { rows: 20 })
  assert.ok(seven > six)
  assert.equal(seven, twenty)
})
