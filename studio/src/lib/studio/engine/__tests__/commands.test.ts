import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import {
  COALESCE_MS, CommandStack, CreateCommand, CreateLinkCommand, DuplicateCommand,
  FlagCommand, FrameSelectionCommand, MoveCommand, NudgeCommand, ResizeCommand,
  SoftDeleteCommand, TidyCommand, ZCommand,
} from '@/lib/studio/engine/commands'
import { createStore } from '@/lib/studio/store'
import type { CanvasStore } from '@/lib/studio/store'
import type { AnyBlock, Link, ProjectBundle, Rect } from '@/lib/studio/types'
import { at, block, resetSeq } from '@/lib/studio/layout/__tests__/factory'

function storeWith(blocks: AnyBlock[], links: Link[] = []): CanvasStore {
  const bundle: ProjectBundle = {
    project: {
      id: 'p-1', user_id: 'u-1', title: 'a project', status: 'active',
      intent: '', rules: [],
      resting_until: null, completed_at: null, completion_note: null,
      viewport: { tx: 80, ty: 80, k: 1 },
    shelf_x: null,
    shelf_y: null,
    vision_x: null,
    vision_y: null,
      settings: { snap: true, grid: true, sizes: false },
      auto_layout: true, composed_at: null, canvas_version: 1,
      last_opened_at: at(0), opened_before_at: at(0), created_at: at(0), updated_at: at(0),
    },
    concept: { id: 'c-1', project_id: 'p-1', body: 'a body', constraints: [], origin: 'creation', created_at: at(0) },
    blocks, links, compass: [], catches: [], drafts: [], assets: [],
    since: {
      cutoff: at(0), last_opened_at: at(0), canvas_version: 1, last_said: null,
      arrived_since: 0, waiting: 0, compass_pending: 0, catches_unmarked: 0, commitments_open: 0,
    },
  }
  return createStore(bundle, true)
}

const rect = (x: number, y: number, w = 320, h = 96): Rect => ({ x, y, w, h })
const posOf = (s: CanvasStore, id: string) => {
  const b = s.get().blocks.get(id)!
  return { x: b.x, y: b.y }
}

test('a move applies, marks dirty, and undoes exactly', () => {
  resetSeq()
  const note = block('note', { x: 0, y: 0 })
  const store = storeWith([note])
  const stack = new CommandStack()

  stack.execute(store, MoveCommand({ store, ids: [note.id], to: new Map([[note.id, rect(160, 240)]]) }))
  assert.deepEqual(posOf(store, note.id), { x: 160, y: 240 })
  assert.ok(store.dirty.upserts.has(note.id), 'autosave has something to send')

  stack.undo(store)
  assert.deepEqual(posOf(store, note.id), { x: 0, y: 0 })
  assert.ok(store.dirty.upserts.has(note.id), 'the undone row is dirty too, so the server hears about it')

  stack.redo(store)
  assert.deepEqual(posOf(store, note.id), { x: 160, y: 240 })
})

test('a moved block becomes hand-placed, which is what keeps tidy off it', () => {
  resetSeq()
  const note = block('note', { placed_by: 'auto', arrival_state: 'unplaced' })
  const store = storeWith([note])
  new CommandStack().execute(store, MoveCommand({ store, ids: [note.id], to: new Map([[note.id, rect(80, 80)]]) }))
  const row = store.get().blocks.get(note.id)!
  assert.equal(row.placed_by, 'person')
  assert.equal(row.arrival_state, 'placed')
})

test('commands with the same key inside the window coalesce into one undo step', () => {
  resetSeq()
  const note = block('note', { x: 0, y: 0 })
  const store = storeWith([note])
  const stack = new CommandStack()

  // the real machine emits these from one drag; they must not become 3 undos
  stack.execute(store, MoveCommand({ store, ids: [note.id], to: new Map([[note.id, rect(8, 0)]]) }))
  stack.execute(store, MoveCommand({ store, ids: [note.id], to: new Map([[note.id, rect(16, 0)]]) }))
  stack.execute(store, MoveCommand({ store, ids: [note.id], to: new Map([[note.id, rect(24, 0)]]) }))
  assert.equal(posOf(store, note.id).x, 24)

  stack.undo(store)
  assert.equal(posOf(store, note.id).x, 0, 'one undo returns to where the drag began')
  assert.equal(stack.canUndo(), false)
})

test('different keys do not coalesce', () => {
  resetSeq()
  const a = block('note', { x: 0, y: 0 })
  const b = block('note', { x: 0, y: 0 })
  const store = storeWith([a, b])
  const stack = new CommandStack()
  stack.execute(store, MoveCommand({ store, ids: [a.id], to: new Map([[a.id, rect(80, 0)]]) }))
  stack.execute(store, MoveCommand({ store, ids: [b.id], to: new Map([[b.id, rect(80, 0)]]) }))
  stack.undo(store)
  assert.equal(posOf(store, b.id).x, 0)
  assert.equal(posOf(store, a.id).x, 80, 'the first move is still there')
})

test('a nudge coalesces with itself but keeps the original starting point', () => {
  resetSeq()
  const note = block('note', { x: 0, y: 0 })
  const store = storeWith([note])
  const stack = new CommandStack()
  stack.execute(store, NudgeCommand({ store, ids: [note.id], dx: 8, dy: 0 }))
  stack.execute(store, NudgeCommand({ store, ids: [note.id], dx: 8, dy: 0 }))
  assert.equal(posOf(store, note.id).x, 16)
  stack.undo(store)
  assert.equal(posOf(store, note.id).x, 0)
})

test('a resize undoes to the exact former rect', () => {
  resetSeq()
  const note = block('note', { x: 0, y: 0, w: 320, h: 96 })
  const store = storeWith([note])
  const stack = new CommandStack()
  stack.execute(store, ResizeCommand({ store, id: note.id, to: rect(0, 0, 512, 96) }))
  assert.equal(store.get().blocks.get(note.id)!.w, 512)
  stack.undo(store)
  assert.equal(store.get().blocks.get(note.id)!.w, 320)
})

test('a delete is soft and takes its links with it, and undo brings both back', () => {
  resetSeq()
  const a = block('note')
  const b = block('note')
  const link: Link = {
    id: 'l-1', user_id: 'u-1', project_id: 'p-1',
    from_block_id: a.id, to_block_id: b.id, word: 'because', created_at: at(1),
  }
  const store = storeWith([a, b], [link])
  const stack = new CommandStack()

  stack.execute(store, SoftDeleteCommand({ store, ids: [a.id], links: [link] }))
  assert.ok(store.get().blocks.get(a.id)!.deleted_at, 'the row is still there, marked gone')
  assert.equal(store.get().links.has(link.id), false)

  stack.undo(store)
  assert.equal(store.get().blocks.get(a.id)!.deleted_at, null)
  assert.equal(store.get().links.get(link.id)?.word, 'because')
})

test('a deleted block leaves the selection', () => {
  resetSeq()
  const a = block('note')
  const store = storeWith([a])
  store.set((s) => { s.selection = new Set([a.id]); s.primary = a.id })
  new CommandStack().execute(store, SoftDeleteCommand({ store, ids: [a.id], links: [] }))
  assert.equal(store.get().selection.size, 0)
  assert.equal(store.get().primary, null)
})

test('create then undo removes the block; redo brings it back', () => {
  resetSeq()
  const store = storeWith([])
  const note = block('note')
  const stack = new CommandStack()
  stack.execute(store, CreateCommand({ block: note }))
  assert.equal(store.liveBlocks().length, 1)
  stack.undo(store)
  assert.equal(store.liveBlocks().length, 0)
  stack.redo(store)
  assert.equal(store.liveBlocks().length, 1)
})

test('duplicate adds copies and undo removes only the copies', () => {
  resetSeq()
  const a = block('note')
  const store = storeWith([a])
  const copy = { ...a, id: 'note-copy', x: a.x + 16, y: a.y + 16 }
  const stack = new CommandStack()
  stack.execute(store, DuplicateCommand({ copies: [copy] }))
  assert.equal(store.liveBlocks().length, 2)
  stack.undo(store)
  assert.equal(store.liveBlocks().length, 1)
  assert.ok(store.get().blocks.get(a.id))
})

test('framing the selection reparents the children, and undo un-parents them', () => {
  resetSeq()
  const a = block('note')
  const b = block('note')
  const store = storeWith([a, b])
  const frame = block('frame', { id: 'frame-x' } as never)
  const stack = new CommandStack()
  stack.execute(store, FrameSelectionCommand({ store, frame, children: [a.id, b.id] }))
  assert.equal(store.get().blocks.get(a.id)!.parent_id, frame.id)
  assert.equal(store.childrenOf(frame.id).length, 2)
  stack.undo(store)
  assert.equal(store.get().blocks.get(a.id)!.parent_id, null)
  assert.ok(store.get().blocks.get(frame.id)!.deleted_at, 'the frame itself is gone again')
})

test('tidy is a single undo step however many blocks moved', () => {
  resetSeq()
  const a = block('note', { x: 0, y: 0 })
  const b = block('note', { x: 0, y: 0 })
  const c = block('note', { x: 0, y: 0 })
  const store = storeWith([a, b, c])
  const stack = new CommandStack()
  stack.execute(store, TidyCommand({
    store,
    moves: new Map([[a.id, rect(0, 0)], [b.id, rect(0, 120)], [c.id, rect(0, 240)]]),
  }))
  assert.equal(posOf(store, c.id).y, 240)
  stack.undo(store)
  assert.equal(posOf(store, c.id).y, 0)
  assert.equal(posOf(store, b.id).y, 0)
  assert.equal(stack.canUndo(), false, 'one step, not three')
})

test('flags round-trip', () => {
  resetSeq()
  const a = block('note')
  const store = storeWith([a])
  const stack = new CommandStack()
  stack.execute(store, FlagCommand({ store, ids: [a.id], label: 'lock', patch: { locked: true } }))
  assert.equal(store.get().blocks.get(a.id)!.locked, true)
  stack.undo(store)
  assert.equal(store.get().blocks.get(a.id)!.locked, false)
})

test('a z change swaps and undoes', () => {
  resetSeq()
  const a = block('note', { z: 1 })
  const b = block('note', { z: 2 })
  const store = storeWith([a, b])
  const stack = new CommandStack()
  stack.execute(store, ZCommand({ store, changes: new Map([[a.id, 2], [b.id, 1]]) }))
  assert.equal(store.get().blocks.get(a.id)!.z, 2)
  stack.undo(store)
  assert.equal(store.get().blocks.get(a.id)!.z, 1)
})

test('a link command round-trips through the dirty patch', () => {
  resetSeq()
  const a = block('note')
  const b = block('note')
  const store = storeWith([a, b])
  const link: Link = {
    id: 'l-2', user_id: 'u-1', project_id: 'p-1',
    from_block_id: a.id, to_block_id: b.id, word: null, created_at: at(2),
  }
  const stack = new CommandStack()
  stack.execute(store, CreateLinkCommand({ link }))
  assert.ok(store.get().links.has(link.id))
  assert.ok(store.dirty.links_add.has(link.id))
  stack.undo(store)
  assert.equal(store.get().links.has(link.id), false)
  assert.ok(store.dirty.links_delete.has(link.id))
})

test('a new command clears the redo branch', () => {
  resetSeq()
  const a = block('note', { x: 0, y: 0 })
  const store = storeWith([a])
  const stack = new CommandStack()
  stack.execute(store, MoveCommand({ store, ids: [a.id], to: new Map([[a.id, rect(80, 0)]]) }))
  stack.undo(store)
  assert.equal(stack.canRedo(), true)
  stack.execute(store, NudgeCommand({ store, ids: [a.id], dx: 8, dy: 0 }))
  assert.equal(stack.canRedo(), false)
})

test('undo and redo on an empty stack are harmless', () => {
  const store = storeWith([])
  const stack = new CommandStack()
  stack.undo(store)
  stack.redo(store)
  assert.equal(stack.canUndo(), false)
  assert.equal(stack.lastLabel(), null)
})

test('the coalescing window is the documented 500 ms', () => {
  assert.equal(COALESCE_MS, 500)
})
