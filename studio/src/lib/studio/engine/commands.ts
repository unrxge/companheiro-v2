// studio/src/lib/studio/engine/commands.ts — the command stack (5.9, D-029).
//
// One rule holds the whole canvas together: every change is a Command that can
// apply and revert itself, and the patch it produces is what autosave flushes.
// Undo and persistence therefore share one pipe — an undone move is not a
// special case, it is the inverse rows marked dirty like any other edit.
//
// Commands carry FULL rows, never partial ones: PostgREST builds the insert
// tuple before it resolves the conflict, so a partial upsert trips NOT NULL
// (D-030). Deletes are soft so undo is exact.

import { createEmptyPatch } from '@/lib/studio/store'
import type { CanvasStore } from '@/lib/studio/store'
import type { AnyBlock, DirtyPatch, Link, Rect } from '@/lib/studio/types'

export interface Command {
  label: string
  /** Commands with the same key within 500 ms merge into one undo step. */
  key?: string
  at: number
  /** Rows as they should be after the command. */
  rows(): AnyBlock[]
  /** Rows as they were before it. */
  before(): AnyBlock[]
  patch(): DirtyPatch
  inverse(): DirtyPatch
}

export const COALESCE_MS = 500
export const STACK_CAP = 200

const patchOf = (rows: AnyBlock[]): DirtyPatch => {
  const p = createEmptyPatch()
  for (const r of rows) p.upserts.set(r.id, r)
  return p
}

/** The common case: a command is a set of before-rows and a set of after-rows. */
class RowsCommand implements Command {
  readonly at: number
  constructor(
    readonly label: string,
    private readonly beforeRows: AnyBlock[],
    private readonly afterRows: AnyBlock[],
    readonly key?: string,
    at = Date.now(),
  ) {
    this.at = at
  }
  rows() { return this.afterRows }
  before() { return this.beforeRows }
  patch() { return patchOf(this.afterRows) }
  inverse() { return patchOf(this.beforeRows) }
  /** Coalescing keeps the original before-rows and takes the newer after-rows. */
  merge(next: RowsCommand): RowsCommand {
    const keptBefore = new Map(next.beforeRows.map((r) => [r.id, r]))
    for (const r of this.beforeRows) keptBefore.set(r.id, r)
    return new RowsCommand(next.label, [...keptBefore.values()], next.afterRows, next.key, next.at)
  }
}

const touch = (row: AnyBlock, patch: Partial<AnyBlock>): AnyBlock => ({ ...row, ...patch } as AnyBlock)

// ── movement and size ──────────────────────────────────────────────────────

/**
 * A drag (D-033): every moved block becomes hand-placed, which is what tells
 * tidy to leave it alone afterwards. A reparent and a frame's growth ride in the
 * same command so one undo puts all three back.
 */
export function MoveCommand(opts: {
  store: CanvasStore
  ids: string[]
  to: Map<string, Rect>
  reparent?: { id: string; parent_id: string | null } | null
  frameGrow?: { id: string; rect: Rect } | null
}): Command {
  const s = opts.store.get()
  const before: AnyBlock[] = []
  const after: AnyBlock[] = []
  for (const id of opts.ids) {
    const row = s.blocks.get(id)
    const r = opts.to.get(id)
    if (!row || !r) continue
    before.push(row)
    after.push(touch(row, {
      x: r.x, y: r.y, w: r.w, h: r.h,
      placed_by: 'person',
      arrival_state: 'placed',
      parent_id: opts.reparent && opts.reparent.id === id ? opts.reparent.parent_id : row.parent_id,
    }))
  }
  if (opts.frameGrow) {
    const f = s.blocks.get(opts.frameGrow.id)
    if (f && !opts.ids.includes(f.id)) {
      before.push(f)
      after.push(touch(f, { ...opts.frameGrow.rect }))
    }
  }
  const key = `move:${[...opts.ids].sort().join(',')}`
  return new RowsCommand(opts.ids.length > 1 ? 'move' : 'move', before, after, key)
}

export function NudgeCommand(opts: { store: CanvasStore; ids: string[]; dx: number; dy: number }): Command {
  const s = opts.store.get()
  const before: AnyBlock[] = []
  const after: AnyBlock[] = []
  for (const id of opts.ids) {
    const row = s.blocks.get(id)
    if (!row) continue
    before.push(row)
    after.push(touch(row, { x: row.x + opts.dx, y: row.y + opts.dy, placed_by: 'person', arrival_state: 'placed' }))
  }
  return new RowsCommand('nudge', before, after, `nudge:${[...opts.ids].sort().join(',')}`)
}

export function ResizeCommand(opts: { store: CanvasStore; id: string; to: Rect }): Command {
  const row = opts.store.get().blocks.get(opts.id)
  if (!row) return new RowsCommand('resize', [], [])
  return new RowsCommand(
    'resize',
    [row],
    [touch(row, { ...opts.to, placed_by: 'person', arrival_state: 'placed' })],
    `resize:${opts.id}`,
  )
}

// ── content and flags ──────────────────────────────────────────────────────

/** One edit session (focus → blur) is one command, so undo steps by intention. */
export function EditCommand(opts: { store: CanvasStore; id: string; content: AnyBlock['content'] }): Command {
  const row = opts.store.get().blocks.get(opts.id)
  if (!row) return new RowsCommand('edit', [], [])
  return new RowsCommand('edit', [row], [touch(row, { content: opts.content } as Partial<AnyBlock>)])
}

export function FlagCommand(opts: {
  store: CanvasStore
  ids: string[]
  label: string
  patch: Partial<AnyBlock> | ((row: AnyBlock) => Partial<AnyBlock>)
}): Command {
  const s = opts.store.get()
  const before: AnyBlock[] = []
  const after: AnyBlock[] = []
  for (const id of opts.ids) {
    const row = s.blocks.get(id)
    if (!row) continue
    before.push(row)
    after.push(touch(row, typeof opts.patch === 'function' ? opts.patch(row) : opts.patch))
  }
  return new RowsCommand(opts.label, before, after)
}

export function ZCommand(opts: { store: CanvasStore; changes: Map<string, number> }): Command {
  const s = opts.store.get()
  const before: AnyBlock[] = []
  const after: AnyBlock[] = []
  for (const [id, z] of opts.changes) {
    const row = s.blocks.get(id)
    if (!row) continue
    before.push(row)
    after.push(touch(row, { z, placed_by: 'person' }))
  }
  return new RowsCommand('stacking', before, after)
}

// ── existence ──────────────────────────────────────────────────────────────

export function CreateCommand(opts: { block: AnyBlock }): Command {
  const p = createEmptyPatch()
  p.upserts.set(opts.block.id, opts.block)
  const inv = createEmptyPatch()
  inv.deletes.add(opts.block.id)
  return {
    label: 'add',
    at: Date.now(),
    rows: () => [opts.block],
    before: () => [],
    patch: () => p,
    inverse: () => inv,
  }
}

/** Soft delete, so undo is exact and the links come back with the block. */
export function SoftDeleteCommand(opts: { store: CanvasStore; ids: string[]; links: Link[] }): Command {
  const s = opts.store.get()
  const rows = opts.ids.map((id) => s.blocks.get(id)).filter((b): b is AnyBlock => !!b)
  const p = createEmptyPatch()
  for (const r of rows) p.deletes.add(r.id)
  for (const l of opts.links) p.links_delete.add(l.id)
  const inv = createEmptyPatch()
  for (const r of rows) inv.restores.add(r.id)
  for (const l of opts.links) inv.links_add.set(l.id, l)
  return {
    label: rows.length > 1 ? 'delete' : 'delete',
    at: Date.now(),
    rows: () => [],
    before: () => rows,
    patch: () => p,
    inverse: () => inv,
  }
}

export function DuplicateCommand(opts: { copies: AnyBlock[] }): Command {
  const p = createEmptyPatch()
  for (const c of opts.copies) p.upserts.set(c.id, c)
  const inv = createEmptyPatch()
  for (const c of opts.copies) inv.deletes.add(c.id)
  return {
    label: 'duplicate',
    at: Date.now(),
    rows: () => opts.copies,
    before: () => [],
    patch: () => p,
    inverse: () => inv,
  }
}

export function FrameSelectionCommand(opts: { store: CanvasStore; frame: AnyBlock; children: string[] }): Command {
  const s = opts.store.get()
  const kids = opts.children.map((id) => s.blocks.get(id)).filter((b): b is AnyBlock => !!b)
  const p = createEmptyPatch()
  p.upserts.set(opts.frame.id, opts.frame)
  for (const k of kids) p.upserts.set(k.id, touch(k, { parent_id: opts.frame.id }))
  const inv = createEmptyPatch()
  inv.deletes.add(opts.frame.id)
  for (const k of kids) inv.upserts.set(k.id, k)
  return {
    label: 'frame',
    at: Date.now(),
    rows: () => [opts.frame, ...kids.map((k) => touch(k, { parent_id: opts.frame.id }))],
    before: () => kids,
    patch: () => p,
    inverse: () => inv,
  }
}

/** Tidy is one undo step however many blocks it moved (D-034). */
export function TidyCommand(opts: {
  store: CanvasStore
  moves: Map<string, Rect>
  stacked?: { timeline?: AnyBlock; ids: string[] }
}): Command {
  const s = opts.store.get()
  const before: AnyBlock[] = []
  const after: AnyBlock[] = []
  for (const [id, r] of opts.moves) {
    const row = s.blocks.get(id)
    if (!row) continue
    before.push(row)
    after.push(touch(row, { ...r }))
  }
  if (opts.stacked) {
    if (opts.stacked.timeline) after.push(opts.stacked.timeline)
    for (const id of opts.stacked.ids) {
      const row = s.blocks.get(id)
      if (!row || !opts.stacked.timeline) continue
      before.push(row)
      after.push(touch(row, { stacked_in: opts.stacked.timeline.id }))
    }
  }
  return new RowsCommand('tidy', before, after)
}

export function UnstackCommand(opts: { store: CanvasStore; id: string; to: Rect }): Command {
  const row = opts.store.get().blocks.get(opts.id)
  if (!row) return new RowsCommand('unstack', [], [])
  return new RowsCommand('unstack', [row], [touch(row, { ...opts.to, stacked_in: null, placed_by: 'person' })])
}

// ── links ──────────────────────────────────────────────────────────────────

export function CreateLinkCommand(opts: { link: Link }): Command {
  const p = createEmptyPatch()
  p.links_add.set(opts.link.id, opts.link)
  const inv = createEmptyPatch()
  inv.links_delete.add(opts.link.id)
  return { label: 'link', at: Date.now(), rows: () => [], before: () => [], patch: () => p, inverse: () => inv }
}

export function DeleteLinkCommand(opts: { link: Link }): Command {
  const p = createEmptyPatch()
  p.links_delete.add(opts.link.id)
  const inv = createEmptyPatch()
  inv.links_add.set(opts.link.id, opts.link)
  return { label: 'unlink', at: Date.now(), rows: () => [], before: () => [], patch: () => p, inverse: () => inv }
}

// ── the stack ──────────────────────────────────────────────────────────────

export class CommandStack {
  private done: Command[] = []
  private undone: Command[] = []

  /** Apply and record. A command with the same key inside 500 ms merges. */
  execute(store: CanvasStore, cmd: Command): void {
    store.applyPatch(cmd.patch())
    this.undone = []
    const last = this.done[this.done.length - 1]
    if (
      last instanceof RowsCommand &&
      cmd instanceof RowsCommand &&
      last.key &&
      cmd.key &&
      last.key === cmd.key &&
      cmd.at - last.at <= COALESCE_MS
    ) {
      this.done[this.done.length - 1] = last.merge(cmd)
      return
    }
    this.done.push(cmd)
    if (this.done.length > STACK_CAP) this.done.shift()
  }

  /** Record without applying — for changes the DOM already made. */
  push(cmd: Command): void {
    this.undone = []
    this.done.push(cmd)
    if (this.done.length > STACK_CAP) this.done.shift()
  }

  undo(store: CanvasStore): void {
    const cmd = this.done.pop()
    if (!cmd) return
    store.applyPatch(cmd.inverse())
    this.undone.push(cmd)
  }

  redo(store: CanvasStore): void {
    const cmd = this.undone.pop()
    if (!cmd) return
    store.applyPatch(cmd.patch())
    this.done.push(cmd)
  }

  canUndo(): boolean { return this.done.length > 0 }
  canRedo(): boolean { return this.undone.length > 0 }
  lastLabel(): string | null { return this.done[this.done.length - 1]?.label ?? null }
  clear(): void { this.done = []; this.undone = [] }
}
