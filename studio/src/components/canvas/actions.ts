'use client'

// studio/src/components/canvas/actions.ts — the action interface the chrome
// dispatches through, and the factory for a new block row.
//
// The chrome never imports the engine: every button, toggle and row calls a
// method on a `CanvasActions` object, which canvas-page passes down by props and
// through ActionsContext (for the block shell, which lives inside the stage).
// The implementation is `createEngineActions` in engine-actions.ts — commands on
// the CommandStack, autosave, composeAuto. Keeping the interface here and the
// implementation there is what lets the whole engine be replaced without a
// single chrome file changing.

import { createContext, useContext } from 'react'
import { defaultSize, registry } from '@/lib/studio/registry'
import { ceil8, snap8 } from '@/lib/studio/geometry'
import type { AnyBlock, Block, BlockContentMap, BlockType } from '@/lib/studio/types'

// ── the interface ──────────────────────────────────────────────────────────

export type ZDirection = 'forward' | 'back' | 'front' | 'back_all'

export interface CanvasActions {
  /** Replace the selection (since, hidden and deleted rows are dropped; primary = last). */
  select(ids: string[]): void
  /** Multiply k by f about the stage centre. */
  zoomBy(f: number): void
  /** Set k about the stage centre. */
  zoomTo(k: number): void
  /** Fit every renderable block (D-004). */
  fitAll(): void
  /** Fit the union of these blocks, k capped at 1.25. */
  fitIds(ids: string[]): void
  /** Tidy (D-034); `everything` also moves person-placed blocks. */
  tidy(everything: boolean): void
  /** Copies at +16,+16 with new ids; links not copied; arrival fields cleared (D-041). */
  duplicate(ids: string[]): void
  /** Soft delete (deleted_at); concept, since and compass refuse; a frame's children stay in place. */
  softDelete(ids: string[]): void
  lock(ids: string[], v: boolean): void
  hide(ids: string[], v: boolean): void
  rename(id: string, name: string): void
  /** Width in 8 px steps within the type's bounds; height only for fixed-size types. Marks the block person-placed. */
  resize(id: string, size: { w?: number; h?: number }): void
  /** Move by whole grid units (arrow keys). Marks the blocks person-placed. */
  nudge(ids: string[], dx: number, dy: number): void
  /** Enter on a single selection: edit it in place, or open what it opens. */
  enterOrOpen(id: string): void
  stepZ(ids: string[], dir: ZDirection): void
  /** `orderedIds` front first (the layers list top → bottom); z values are reassigned within the same range. */
  reorderZ(orderedIds: string[]): void
  strike(id: string, sentence: string): Promise<void>
  unstrike(id: string): Promise<void>
  /** Wrap the selection in a new frame (D-022). */
  frameSelection(ids: string[]): void
  /** Enter link mode (L / context bar); the pointer machine (B) does the rest. */
  enterLink(): void
  /** Library tile clicked: create the block at the stage centre (D-017). */
  enterPlacing(type: BlockType): void
  /** Collapse / expand a frame (D-021). */
  collapse(id: string, v: boolean): void
  /** Arrival: place (stays where it is unless auto_layout composes it). */
  place(id: string): Promise<void>
  /** Arrival: dismiss = soft delete. */
  dismiss(id: string): Promise<void>
  undo(): void
  redo(): void
  /** The label of the last command, for the grid panel; null when nothing can be undone. */
  undoLabel(): string | null
  /** Release timers and listeners. */
  dispose(): void
}

export const ActionsContext = createContext<CanvasActions | null>(null)

/** The actions object, or null outside a CanvasProvider (a block rendered in isolation). */
export function useActions(): CanvasActions | null {
  return useContext(ActionsContext)
}

export function useActionsStrict(): CanvasActions {
  const a = useContext(ActionsContext)
  if (!a) throw new Error('useActionsStrict: no ActionsContext above this component')
  return a
}


// ── maths, re-exported from the engine ─────────────────────────────────────
//
// These used to be a second copy of the viewport maths, kept here while the
// engine did not exist. There is one definition of each now: two `zoomAt`s in a
// canvas is a bug waiting to be found on a Tuesday. The names stay so the
// chrome's imports do not move.

export {
  K_MIN, K_MAX, FIT_PAD, FIT_K_MAX, ZOOM_STEP, clampK, zoomAt,
  screenToWorld, worldToScreen, visibleWorldRect, fit as fitViewport,
} from '@/lib/studio/engine/viewport'
export { snap8, ceil8, rectOf, union as unionRects } from '@/lib/studio/geometry'

// ── new rows ───────────────────────────────────────────────────────────────

/** The empty content a library-made block starts with (types.ts shapes). */
export function defaultContent<T extends BlockType>(type: T, now = new Date().toISOString()): BlockContentMap[T] {
  const table: { [K in BlockType]: BlockContentMap[K] } = {
    concept: {},
    since: {},
    update: { text: '', said_at: now, entry_id: null, origin: 'posted' },
    timeline: { title: null },
    draft: { draft_id: '' },
    anchor: { text: '', source_block_id: null },
    note: { text: '' },
    reference: { url: '', title: '', note: '' },
    commitment: { entry_id: '' },
    compass: {},
    frame: { expanded_h: registry.frame.defaultH, tint: 'none' },
    heading: { text: '', size: 'lg' },
    divider: {},
    image: { asset_id: '', caption: '', fit: 'cover', aspect: 4 / 3 },
    gallery: { items: [], columns: 2 },
    recording: { asset_id: '', title: '', note: '' },
    palette: { swatches: [] },
  }
  return table[type]
}

/** The row for one type; for the whole union it is AnyBlock. */
export type BlockOf<T extends BlockType> = Extract<AnyBlock, { type: T }>

export function makeBlock<T extends BlockType>(input: {
  type: T
  userId: string
  projectId: string
  x: number
  y: number
  z: number
  w?: number
  h?: number
  content?: BlockContentMap[T]
  placed_by?: AnyBlock['placed_by']
  parent_id?: string | null
  id?: string
}): BlockOf<T> {
  const now = new Date().toISOString()
  const size = defaultSize(input.type)
  const row: Block<T> = {
    id: input.id ?? crypto.randomUUID(),
    user_id: input.userId,
    project_id: input.projectId,
    type: input.type,
    x: snap8(input.x),
    y: snap8(input.y),
    w: snap8(input.w ?? size.w),
    h: ceil8(input.h ?? size.h),
    z: input.z,
    parent_id: input.parent_id ?? null,
    stacked_in: null,
    name: null,
    locked: false,
    hidden: false,
    collapsed: false,
    placed_by: input.placed_by ?? 'person',
    arrival_state: 'placed',
    arrived_from: null,
    struck_at: null,
    struck_by: null,
    content: input.content ?? defaultContent(input.type, now),
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }
  return row as unknown as BlockOf<T>
}

