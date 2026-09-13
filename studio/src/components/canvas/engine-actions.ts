'use client'

// studio/src/components/canvas/engine-actions.ts — CanvasActions, backed by the
// engine (the replacement for `createDefaultActions`, same interface so no
// chrome changes). Everything that changes the canvas goes onto the command
// stack and then to autosave; the three lifecycle actions that the server owns
// (strike, place, dismiss) call their routes and take the returned row as truth.

import { api } from '@/lib/studio/api-client'
import { intersects, rectOf, snap8, union } from '@/lib/studio/geometry'
import { defaultSize, registry } from '@/lib/studio/registry'
import { createEmptyPatch } from '@/lib/studio/store'
import type { CanvasStore } from '@/lib/studio/store'
import { compose, regionOf, widthFor } from '@/lib/studio/layout/compose'
import { tidy as runTidy } from '@/lib/studio/layout/tidy'
import type { CanvasActions, ZDirection } from '@/components/canvas/actions'
import { makeBlock } from '@/components/canvas/actions'
import {
  CommandStack, CreateCommand, CreateLinkCommand, DuplicateCommand,
  FlagCommand, FrameSelectionCommand, MoveCommand, NudgeCommand, ResizeCommand,
  SoftDeleteCommand, TidyCommand, ZCommand,
} from '@/lib/studio/engine/commands'
import { collapse as collapseFrame, expand as expandFrame, frameChildren, frameRectFor } from '@/lib/studio/engine/frames'
import { pinSince } from '@/lib/studio/engine/pin'
import { sanitiseSelection } from '@/lib/studio/engine/selection'
import { reorderZ, stepZ as stepZOf, maxZ } from '@/lib/studio/engine/zorder'
import { fit, visibleWorldRect, zoomStep, zoomToK, FIT_K_MAX } from '@/lib/studio/engine/viewport'
import type { Autosave } from '@/lib/studio/engine/autosave'
import type { OverlayApi, LinksApiLike, PointerMachine } from '@/lib/studio/engine/pointer'
import type { AnyBlock, BlockType, CompassEntry, Point, Rect, Viewport } from '@/lib/studio/types'

export interface EngineActionsHost {
  store: CanvasStore
  projectId: string
  stack: CommandStack
  machine: PointerMachine
  autosave: Autosave
  overlay: OverlayApi
  links: LinksApiLike
  stageSize: () => { w: number; h: number }
  worldEl: () => HTMLElement | null
  setViewport: (v: Viewport) => void
}

export interface EngineActionsBundle {
  actions: CanvasActions
  /** Placing mode dropped a type at a world point (the library's drag path). */
  createAt(type: BlockType, at: Point): void
  /** Link mode picked two blocks (D-024); the word arrives later from the popover. */
  createLink(fromId: string, toId: string, word?: string | null): Promise<void>
}

export function createEngineActions(host: EngineActionsHost): EngineActionsBundle {
  const { store, projectId, stack, machine, autosave, overlay, links } = host

  const get = (id: string) => store.get().blocks.get(id)
  const userId = () => store.get().project.user_id
  /** Resting and completed projects open read-only (D-060). */
  const canArrange = () => store.get().interactive
  const after = () => {
    // the since row follows the concept wherever it ends up (D-026)
    pinSince(store)
    autosave.schedule()
    overlay.sync()
    links.redraw()
  }
  const viewport = () => machine.viewport()

  /** Where a new block lands when it was not dropped anywhere (D-017). */
  const stageCentreWorld = (): Point => {
    const { w, h } = host.stageSize()
    const v = viewport()
    return { x: snap8((w / 2 - v.tx) / v.k), y: snap8((h / 2 - v.ty) / v.k) }
  }

  /**
   * While the project has never been arranged by hand, a new block flows into
   * its region instead of landing wherever the click was (D-064). The first
   * hand placement turns this off for good.
   */
  const composeAuto = (block: AnyBlock): AnyBlock => {
    const s = store.get()
    if (!s.project.auto_layout) return block
    if (block.type === 'heading' || block.type === 'divider' || block.type === 'frame') return block
    const obstacles: Rect[] = []
    for (const b of store.renderable()) {
      if (b.id === block.id) continue
      if (b.placed_by === 'person' || b.locked || b.arrival_state === 'unplaced' || b.type === 'frame') {
        obstacles.push(rectOf(b))
      }
    }
    const placements = compose({
      blocks: [...store.renderable().filter((b) => b.id !== block.id && b.placed_by === 'auto'), block],
      obstacles,
    })
    const mine = placements.find((p) => p.id === block.id)
    return mine ? ({ ...block, x: mine.x, y: mine.y, w: mine.w, h: mine.h } as AnyBlock) : block
  }

  const createBlock = (type: BlockType, at: Point, byHand: boolean): AnyBlock | null => {
    if (!canArrange()) return null
    const size = defaultSize(type)
    const w = widthFor(regionOf(type), type)
    let block = makeBlock({
      type,
      userId: userId(),
      projectId,
      x: at.x,
      y: at.y,
      z: maxZ(store.liveBlocks()) + 1,
      w: store.get().project.auto_layout ? w : size.w,
      h: size.h,
    }) as AnyBlock
    block = composeAuto(block)
    stack.execute(store, CreateCommand({ block }))
    if (byHand) markHandArranged()
    store.set((s) => { s.selection = new Set([block.id]); s.primary = block.id })
    after()
    return block
  }

  /** D-064 is one-way and outside the undo stack: it records a fact about the person. */
  const markHandArranged = () => {
    if (!store.get().project.auto_layout) return
    store.set((s) => { s.project = { ...s.project, auto_layout: false } })
    store.dirty.project = { ...store.dirty.project, auto_layout: false }
    autosave.schedule()
  }

  const takeServerRow = (row: AnyBlock) => {
    store.set((s) => { s.blocks.set(row.id, row) }, [row.id])
    overlay.sync()
  }

  const mergeCompass = (entry: CompassEntry | null | undefined) => {
    if (!entry) return
    store.set((s) => {
      const i = s.compass.findIndex((e) => e.id === entry.id)
      s.compass = i >= 0
        ? [...s.compass.slice(0, i), entry, ...s.compass.slice(i + 1)]
        : [entry, ...s.compass]
    })
  }

  const actions: CanvasActions = {
    select(ids) {
      const sane = sanitiseSelection(store.get(), ids)
      store.set((s) => { s.selection = sane.selection; s.primary = sane.primary })
      overlay.sync()
    },

    zoomBy(f) {
      const { w, h } = host.stageSize()
      host.setViewport(zoomStep(viewport(), f, w, h))
    },

    zoomTo(k) {
      const { w, h } = host.stageSize()
      host.setViewport(zoomToK(viewport(), k, w, h))
    },

    fitAll() {
      const box = store.bboxAll()
      const { w, h } = host.stageSize()
      if (!box || w === 0) return
      host.setViewport(fit(box, w, h))
    },

    fitIds(ids) {
      const rects = ids.map((id) => get(id)).filter((b): b is AnyBlock => !!b).map(rectOf)
      const box = union(rects)
      const { w, h } = host.stageSize()
      if (!box || w === 0) return
      host.setViewport(fit(box, w, h, FIT_K_MAX))
    },

    tidy(everything) {
      if (!canArrange()) return
      const heights = new Map<string, number>()
      for (const b of store.renderable()) heights.set(b.id, b.h)
      const result = runTidy({ blocks: store.liveBlocks(), heights, projectId, userId: userId() }, { everything })
      const moves = new Map<string, Rect>()
      for (const [id, { to }] of result.moves) moves.set(id, to)
      const timeline = result.stack.newTimeline ?? result.stack.timeline
      if (moves.size === 0 && !result.stack.ids.length) return

      // the transition is a one-off class so the blocks glide into place without
      // every later drag inheriting an animation
      const world = host.worldEl()
      world?.classList.add('tidying')
      const cmd = TidyCommand({
        store,
        moves,
        stacked: timeline ? { timeline: result.stack.newTimeline ?? undefined, ids: result.stack.ids } : undefined,
      })
      stack.execute(store, cmd)
      if (everything) {
        // "tidy everything" also hands the arrangement back to the system
        stack.push(FlagCommand({ store, ids: [...moves.keys()], label: 'tidy everything', patch: { placed_by: 'auto' } }))
        store.applyPatch(patchOfFlags([...moves.keys()], { placed_by: 'auto' }))
      }
      setTimeout(() => world?.classList.remove('tidying'), 340)
      after()

      const { w, h } = host.stageSize()
      const view = visibleWorldRect(viewport(), w, h, 0)
      if ([...moves.values()].some((r) => !intersects(r, view))) actions.fitAll()
    },

    duplicate(ids) {
      if (!canArrange()) return
      let z = maxZ(store.liveBlocks())
      const now = new Date().toISOString()
      const copies: AnyBlock[] = []
      for (const id of ids) {
        const b = get(id)
        if (!b || !registry[b.type].duplicable) continue
        z += 1
        copies.push({
          ...b,
          id: crypto.randomUUID(),
          x: b.x + 16,
          y: b.y + 16,
          z,
          placed_by: 'person',
          arrival_state: 'placed',
          arrived_from: null,
          struck_at: null,
          struck_by: null,
          created_at: now,
          updated_at: now,
        } as AnyBlock)
      }
      if (copies.length === 0) return
      stack.execute(store, DuplicateCommand({ copies }))
      store.set((s) => {
        s.selection = new Set(copies.map((c) => c.id))
        s.primary = copies[copies.length - 1].id
      })
      markHandArranged()
      after()
    },

    softDelete(ids) {
      if (!canArrange()) return
      const deletable = ids.filter((id) => {
        const b = get(id)
        return !!b && registry[b.type].deletable
      })
      if (deletable.length === 0) return
      // a frame's children stay where they are; a timeline's rows come back out
      const orphans: string[] = []
      for (const id of deletable) {
        const b = get(id)
        if (!b) continue
        if (b.type === 'frame') for (const c of store.childrenOf(id)) orphans.push(c.id)
        if (b.type === 'timeline') for (const c of store.childrenStacked(id)) orphans.push(c.id)
      }
      const doomed = new Set(deletable)
      const gone = [...store.get().links.values()].filter(
        (l) => doomed.has(l.from_block_id) || doomed.has(l.to_block_id),
      )
      if (orphans.length) {
        stack.execute(store, FlagCommand({
          store,
          ids: orphans,
          label: 'delete',
          patch: (row) => (row.stacked_in ? { stacked_in: null } : { parent_id: null }),
        }))
      }
      stack.execute(store, SoftDeleteCommand({ store, ids: deletable, links: gone }))
      after()
    },

    lock(ids, v) {
      if (!canArrange()) return
      stack.execute(store, FlagCommand({ store, ids, label: v ? 'lock' : 'unlock', patch: { locked: v } }))
      if (v) actions.select([])
      after()
    },

    hide(ids, v) {
      if (!canArrange()) return
      stack.execute(store, FlagCommand({ store, ids, label: v ? 'hide' : 'show', patch: { hidden: v } }))
      if (v) actions.select([])
      after()
    },

    rename(id, name) {
      if (!canArrange()) return
      const clean = name.trim().slice(0, 80)
      stack.execute(store, FlagCommand({ store, ids: [id], label: 'rename', patch: { name: clean || null } }))
      after()
    },

    resize(id, size) {
      if (!canArrange()) return
      const b = get(id)
      if (!b) return
      const spec = registry[b.type]
      const w = size.w === undefined ? b.w : Math.min(spec.maxW, Math.max(spec.minW, snap8(size.w)))
      const h = spec.autoHeight || size.h === undefined
        ? b.h
        : Math.min(spec.maxH, Math.max(spec.minH, snap8(size.h)))
      if (w === b.w && h === b.h) return
      stack.execute(store, ResizeCommand({ store, id, to: { x: b.x, y: b.y, w, h } }))
      markHandArranged()
      after()
    },

    nudge(ids, dx, dy) {
      if (!canArrange()) return
      const movable = ids.filter((id) => {
        const b = get(id)
        return !!b && !b.locked && b.type !== 'since'
      })
      if (movable.length === 0) return
      stack.execute(store, NudgeCommand({ store, ids: movable, dx, dy }))
      markHandArranged()
      after()
    },

    enterOrOpen(id) {
      const b = get(id)
      if (!b) return
      const spec = registry[b.type]
      if (spec.editableInPlace && canArrange()) {
        machine.enterEdit(id)
        return
      }
      if (spec.opens === 'draft' && b.type === 'draft') {
        store.set((s) => { s.drawer = { kind: 'draft', draftId: b.content.draft_id } })
      } else if (spec.opens === 'compass') {
        store.set((s) => { s.drawer = { kind: 'compass' } })
      } else if (b.type === 'frame') {
        actions.collapse(id, !b.collapsed)
      }
    },

    stepZ(ids, dir: ZDirection) {
      if (!canArrange() || ids.length === 0) return
      const changes = stepZOf(store.get(), new Set(ids), dir, store.liveBlocks())
      if (changes.size === 0) return
      stack.execute(store, ZCommand({ store, changes }))
      after()
    },

    reorderZ(orderedIds) {
      if (!canArrange()) return
      const changes = reorderZ(store.get(), orderedIds)
      if (changes.size === 0) return
      stack.execute(store, ZCommand({ store, changes }))
      after()
    },

    async strike(id, sentence) {
      const text = sentence.trim().slice(0, 280)
      if (!get(id) || !text) return
      const { block } = await api.blocks.strike(projectId, id, { sentence: text })
      takeServerRow(block)
    },

    async unstrike(id) {
      if (!get(id)) return
      const { block } = await api.blocks.unstrike(projectId, id)
      takeServerRow(block)
    },

    frameSelection(ids) {
      if (!canArrange()) return
      const s = store.get()
      const children = frameChildren(s, new Set(ids), store.depthOf)
      const rect = frameRectFor(s, new Set(children))
      if (!rect || children.length === 0) return
      const frame = makeBlock({
        type: 'frame',
        userId: userId(),
        projectId,
        x: rect.x,
        y: rect.y,
        w: rect.w,
        h: rect.h,
        z: maxZ(store.liveBlocks()) + 1,
      }) as AnyBlock
      stack.execute(store, FrameSelectionCommand({ store, frame, children }))
      store.set((st) => { st.selection = new Set([frame.id]); st.primary = frame.id })
      markHandArranged()
      after()
    },

    enterLink() {
      if (!canArrange()) return
      machine.enterLink()
    },

    enterPlacing(type) {
      if (!canArrange()) return
      // the library's click path: straight to the stage centre (D-017). The
      // drag path goes through the machine's placing mode instead.
      createBlock(type, stageCentreWorld(), true)
    },

    collapse(id, v) {
      if (!canArrange()) return
      const b = get(id)
      if (!b || b.type !== 'frame') return
      stack.execute(store, FlagCommand({
        store,
        ids: [id],
        label: v ? 'collapse' : 'expand',
        patch: v ? collapseFrame(b) : expandFrame(b),
      }))
      after()
    },

    async place(id) {
      const b = get(id)
      if (!b || b.arrival_state !== 'unplaced') return
      const res = await api.blocks.arrival(projectId, id, { action: 'place' })
      takeServerRow(res.block)
      mergeCompass(res.compass_entry)
      // while nothing has been arranged by hand, a placed arrival flows into
      // its region rather than staying at the edge (D-037)
      if (store.get().project.auto_layout) {
        const composed = composeAuto(res.block)
        if (composed.x !== res.block.x || composed.y !== res.block.y) {
          stack.execute(store, MoveCommand({
            store,
            ids: [id],
            to: new Map([[id, rectOf(composed)]]),
          }))
          // it flowed by itself, so it is still the system's to arrange
          store.applyPatch(patchOfFlags([id], { placed_by: 'auto' }))
        }
      }
      after()
    },

    async dismiss(id) {
      const b = get(id)
      if (!b || b.arrival_state !== 'unplaced') return
      const res = await api.blocks.arrival(projectId, id, { action: 'dismiss' })
      takeServerRow({ ...res.block, deleted_at: res.block.deleted_at ?? new Date().toISOString() } as AnyBlock)
      mergeCompass(res.compass_entry)
      store.set((s) => {
        if (!s.selection.has(id)) return
        const next = new Set(s.selection)
        next.delete(id)
        s.selection = next
        if (s.primary === id) s.primary = null
      })
      after()
    },

    undo() {
      stack.undo(store)
      after()
    },

    redo() {
      stack.redo(store)
      after()
    },

    undoLabel: () => stack.lastLabel(),

    dispose() {
      void autosave.flush('manual')
    },
  }

  function patchOfFlags(ids: string[], patch: Partial<AnyBlock>) {
    const p = createEmptyPatch()
    for (const id of ids) {
      const row = get(id)
      if (row) p.upserts.set(id, { ...row, ...patch } as AnyBlock)
    }
    return p
  }

  return {
    actions,
    createAt(type, at) { createBlock(type, at, true) },
    createLink: (fromId, toId, word = null) => createLinkBetween(host, fromId, toId, word),
  }
}

/** The engine's own link creation: optimistic row, then the server's. */
export async function createLinkBetween(
  host: Pick<EngineActionsHost, 'store' | 'projectId' | 'stack' | 'autosave'>,
  fromId: string,
  toId: string,
  word: string | null,
): Promise<void> {
  const { store, projectId, stack, autosave } = host
  const exists = [...store.get().links.values()].some(
    (l) =>
      (l.from_block_id === fromId && l.to_block_id === toId) ||
      (l.from_block_id === toId && l.to_block_id === fromId),
  )
  if (exists || fromId === toId) return
  const link = {
    id: crypto.randomUUID(),
    user_id: store.get().project.user_id,
    project_id: projectId,
    from_block_id: fromId,
    to_block_id: toId,
    word,
    created_at: new Date().toISOString(),
  }
  stack.execute(store, CreateLinkCommand({ link }))
  autosave.schedule()
}
