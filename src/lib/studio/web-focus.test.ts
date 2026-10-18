import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isLit, lineKey, litBy } from './web-focus'

//  a ── t1 ── b        t2 runs through b and c
//  a has an image on it, shared with c
const web = {
  threads: [
    { id: 't1', on: ['a', 'b'] },
    { id: 't2', on: ['b', 'c'] },
    { id: 'alone', on: [] },
  ],
  items: [
    { id: 'img', on: ['a', 'c'] },
    { id: 'tasks', on: ['b'] },
    { id: 'loose', on: [] },
  ],
}

test('nothing rested on leaves everything reading normally', () => {
  assert.equal(litBy(null, web), null)
  assert.equal(isLit(null, 'piece', 'anything'), true)
})

test('resting on a piece lights its threads whole, to the other pieces too', () => {
  const lit = litBy({ kind: 'piece', id: 'a' }, web)!
  assert.deepEqual([...lit.threads].sort(), ['t1'])
  // t1 also runs through b, so b lights up — that is the half you cannot see
  assert.deepEqual([...lit.pieces].sort(), ['a', 'b', 'c'])
  assert.ok(lit.lines.has(lineKey('t1', 'b')))
  // the image on a is also on c, so c and that strand light too
  assert.deepEqual([...lit.items].sort(), ['img'])
  assert.ok(lit.lines.has(lineKey('img', 'c')))
  // t2 touches b but not a: it is not this piece's thread
  assert.equal(lit.threads.has('t2'), false)
  assert.equal(lit.lines.has(lineKey('t2', 'b')), false)
})

test('resting on a thread lights the pieces it runs through, and stops there', () => {
  const lit = litBy({ kind: 'hub', id: 't2' }, web)!
  assert.deepEqual([...lit.pieces].sort(), ['b', 'c'])
  assert.deepEqual([...lit.threads], ['t2'])
  // not b's other thread, and not what hangs under either piece
  assert.equal(lit.threads.has('t1'), false)
  assert.equal(lit.items.size, 0)
})

test('resting on something hanging there lights the pieces it is on', () => {
  const lit = litBy({ kind: 'item', id: 'img' }, web)!
  assert.deepEqual([...lit.pieces].sort(), ['a', 'c'])
  assert.deepEqual([...lit.items], ['img'])
  assert.equal(lit.threads.size, 0)
})

test('something connected to nothing lights nothing, rather than darkening the board', () => {
  assert.equal(litBy({ kind: 'hub', id: 'alone' }, web), null)
  assert.equal(litBy({ kind: 'item', id: 'loose' }, web), null)
  assert.equal(litBy({ kind: 'item', id: 'not-here' }, web), null)
  assert.equal(litBy({ kind: 'piece', id: 'nobody' }, web), null)
})

test('isLit answers for each kind', () => {
  const lit = litBy({ kind: 'piece', id: 'a' }, web)!
  assert.equal(isLit(lit, 'piece', 'a'), true)
  assert.equal(isLit(lit, 'piece', 'c'), true)
  assert.equal(isLit(lit, 'hub', 't2'), false)
  assert.equal(isLit(lit, 'item', 'tasks'), false)
  assert.equal(isLit(lit, 'item', 'img'), true)
})
