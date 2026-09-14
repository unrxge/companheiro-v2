import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { pinSince, pinnedRect, SINCE_GAP } from '@/lib/studio/engine/pin'
import { createStore } from '@/lib/studio/store'
import type { AnyBlock, ProjectBundle } from '@/lib/studio/types'
import { at, block, resetSeq } from '@/lib/studio/layout/__tests__/factory'

function storeWith(blocks: AnyBlock[]) {
  const bundle: ProjectBundle = {
    project: {
      id: 'p-1', user_id: 'u-1', title: 't', status: 'active',
      intent: '', rules: [],
      resting_until: null, completed_at: null, completion_note: null,
      viewport: { tx: 0, ty: 0, k: 1 },
      settings: { snap: true, grid: true, sizes: false },
      auto_layout: false, composed_at: null, canvas_version: 1,
      last_opened_at: at(0), opened_before_at: at(0), created_at: at(0), updated_at: at(0),
    },
    concept: { id: 'c', project_id: 'p-1', body: '', constraints: [], origin: 'creation', created_at: at(0) },
    blocks, links: [], compass: [], catches: [], drafts: [], assets: [],
    since: {
      cutoff: at(0), last_opened_at: at(0), canvas_version: 1, last_said: null,
      arrived_since: 0, waiting: 0, compass_pending: 0, catches_unmarked: 0, commitments_open: 0,
    },
  }
  return createStore(bundle, true)
}

test('the since row is pinned under the concept', () => {
  resetSeq()
  const concept = block('concept', { x: 80, y: 80, w: 1008, h: 160 })
  const since = block('since', { x: 0, y: 999, w: 320, h: 40 })
  const store = storeWith([concept, since])

  const changed = pinSince(store)
  assert.deepEqual(changed, [since.id])
  const row = store.get().blocks.get(since.id)!
  assert.equal(row.x, 80)
  assert.equal(row.w, 1008)
  assert.equal(row.y, 80 + 160 + SINCE_GAP)
})

test('a concept that grows takes its since row down with it', () => {
  resetSeq()
  const concept = block('concept', { x: 80, y: 80, w: 1008, h: 80 })
  const since = block('since', { x: 80, y: 168, w: 1008, h: 48 })
  const store = storeWith([concept, since])
  assert.deepEqual(pinSince(store), [], 'already in place: nothing to do')

  // the body got longer and the measurer wrote a taller concept
  store.updateBlock(concept.id, { h: 240 })
  assert.deepEqual(pinSince(store), [since.id])
  assert.equal(store.get().blocks.get(since.id)!.y, 80 + 240 + SINCE_GAP)
})

test('pinning marks the row dirty so the move is actually saved', () => {
  resetSeq()
  const concept = block('concept', { x: 0, y: 0, w: 1008, h: 80 })
  const since = block('since', { x: 500, y: 500, w: 320, h: 48 })
  const store = storeWith([concept, since])
  pinSince(store)
  assert.ok(store.dirty.upserts.has(since.id))
})

test('pinning is safe with no concept or no since row', () => {
  resetSeq()
  assert.deepEqual(pinSince(storeWith([block('note')])), [])
  assert.deepEqual(pinSince(storeWith([block('concept')])), [])
})

test('a deleted since row is not pinned', () => {
  resetSeq()
  const concept = block('concept', { x: 0, y: 0, w: 1008, h: 80 })
  const since = block('since', { x: 900, y: 900, deleted_at: at(9) })
  assert.deepEqual(pinSince(storeWith([concept, since])), [])
})

test('pinnedRect is the 8 px rule, stated once', () => {
  resetSeq()
  const concept = block('concept', { x: 24, y: 48, w: 800, h: 96 })
  assert.deepEqual(pinnedRect(concept), { x: 24, y: 48 + 96 + 8, w: 800 })
})
