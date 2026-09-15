import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildTree, plainText, previewOf } from '@/lib/studio/tree'
import type { WorkNode } from '@/lib/studio/node-types'

const NOW = '2026-09-15T00:00:00.000Z'
const node = (p: Partial<WorkNode> & { id: string }): WorkNode => ({
  user_id: 'u', project_id: 'p', parent_id: null, position: 0, title: '', intent: '', beat: '',
  stands_whole: false, rules: [], body: '', extent: 0, status: 'open', created_at: NOW, updated_at: NOW, ...p,
})

test('paragraphs do not run together', () => {
  assert.equal(plainText('<p>one</p><p>two</p>'), 'one\n\ntwo')
})

test('entities and breaks come through readably', () => {
  assert.equal(plainText('<p>a&nbsp;&amp;&nbsp;b<br>c</p>'), 'a & b\nc')
})

test('empty html is empty text', () => {
  assert.equal(plainText('<p></p>'), '')
})

test('a preview reads the leaves in order, however deep', () => {
  const roots = buildTree([
    node({ id: 'piece' }),
    node({ id: 'a', parent_id: 'piece', position: 0 }),
    node({ id: 'a1', parent_id: 'a', position: 0, body: '<p>first</p>' }),
    node({ id: 'b', parent_id: 'piece', position: 1, body: '<p>second</p>' }),
  ])
  assert.equal(previewOf(roots[0]), 'first\n\nsecond')
})

test('a preview is cut, with a mark that it was cut', () => {
  const roots = buildTree([node({ id: 'x', body: `<p>${'word '.repeat(80)}</p>` })])
  const out = previewOf(roots[0], 40)
  assert.equal(out.length, 41)
  assert.ok(out.endsWith('…'))
})
