'use client'

// studio/src/components/canvas/actions.ts — the action interface lane A's chrome
// dispatches through (lane A owns this file).
//
// CROSS-LANE CONTRACT
// Lane B owns the engine (lib/studio/engine/*: commands, viewport, zorder, frames,
// pointer machine, autosave). Lane A's chrome never imports the engine; every
// button, toggle and row calls a method on a `CanvasActions` object that
// canvas-page passes down by props (and provides through ActionsContext for the
// block shell, which lives inside the stage).
//
// `createDefaultActions()` below is the engine-less implementation: direct store
// mutations through applyPatch/markDirty, direct api calls for lifecycle routes
// (strike, arrival), a local viewport maths for zoom/fit, and an interim flusher
// (`createInterimFlush`) so changes reach the server while B's autosave is not
// wired. Lane B replaces it with an engine-backed object of the SAME interface
// (commands on the CommandStack, useAutosave, composeAuto) by swapping the one
// factory call in canvas-page.tsx; nothing in chrome/* changes. Methods that need
// the engine (undo, redo, enterLink, enterPlacing-by-drag) are honest no-ops or
// simplified here and documented inline.

import { createContext, useContext } from 'react'
import { api, ApiError } from '@/lib/studio/api-client'
import { defaultSize, registry } from '@/lib/studio/registry'
import { createEmptyPatch, mergePatchInto, type CanvasStore, type SaveState } from '@/lib/studio/store'
import { tidy as runTidy } from '@/lib/studio/layout/tidy'
import type { AnyBlock, Block, BlockContentMap, BlockType, CompassEntry, DirtyPatch, Point, Rect, Viewport } from '@/lib/studio/types'

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

// ── viewport maths (local; lane B's engine/viewport.ts is the full version) ──

export const K_MIN = 0.1
export const K_MAX = 3
export const FIT_PAD = 80
export const FIT_K_MAX = 1.25
export const ZOOM_STEP = 1.2

export const snap8 = (n: number): number => Math.round(n / 8) * 8
export const ceil8 = (n: number): number => Math.ceil(n / 8) * 8

export function clampK(k: number, max = K_MAX): number {
  return Math.min(max, Math.max(K_MIN, k))
}

/** Zoom about a screen point so the world point under it stays put (D-003). */
export function zoomAt(v: Viewport, p: Point, kNext: number): Viewport {
  const k = clampK(kNext)
  const r = k / v.k
  return { k, tx: p.x - (p.x - v.tx) * r, ty: p.y - (p.y - v.ty) * r }
}

/** Fit a world rect into vw × vh with 80 px padding, k clamped to [0.1, kMax], centred (D-004). */
export function fitViewport(rect: Rect, vw: number, vh: number, kMax = FIT_K_MAX): Viewport {
  const w = Math.max(1, rect.w)
  const h = Math.max(1, rect.h)
  const k = clampK(Math.min((vw - 2 * FIT_PAD) / w, (vh - 2 * FIT_PAD) / h), kMax)
  return {
    k,
    tx: Math.round((vw - w * k) / 2 - rect.x * k),
    ty: Math.round((vh - h * k) / 2 - rect.y * k),
  }
}

export function screenToWorld(v: Viewport, p: Point): Point {
  return { x: (p.x - v.tx) / v.k, y: (p.y - v.ty) / v.k }
}

export function worldToScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.k + v.tx, y: p.y * v.k + v.ty }
}

export function visibleWorldRect(v: Viewport, vw: number, vh: number, margin = 0): Rect {
  const tl = screenToWorld(v, { x: -margin, y: -margin })
  const br = screenToWorld(v, { x: vw + margin, y: vh + margin })
  return { x: tl.x, y: tl.y, w: br.x - tl.x, h: br.y - tl.y }
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const r of rects) {
    x0 = Math.min(x0, r.x)
    y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.w)
    y1 = Math.max(y1, r.y + r.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export const rectOf = (b: Pick<AnyBlock, 'x' | 'y' | 'w' | 'h'>): Rect => ({ x: b.x, y: b.y, w: b.w, h: b.h })

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

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

// ── interim flusher (replaced by lane B's useAutosave, 5.10) ──────────────

export interface InterimFlush {
  schedule(): void
  flush(reason?: 'debounce' | 'maxwait' | 'hidden' | 'manual'): Promise<void>
  /** Add the pagehide / visibilitychange listeners (call from an effect; safe to call again after detach). */
  attach(): void
  /** Remove the listeners and clear pending timers; dirty rows stay in the store. */
  detach(): void
  /** Alias of detach(). */
  dispose(): void
}

const CHUNK = 40
const DEBOUNCE_MS = 600
const MAX_WAIT_MS = 3000
const RETRY_MS = [1000, 3000, 9000, 30000]

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * Flushes `store.dirty` as full rows (D-030): debounce 600 ms / maxWait 3000 ms,
 * chunks of 40, keepalive on pagehide/hidden, retry ladder 1 s → 3 s → 9 s → 30 s,
 * 401 → `signin` with dirty kept in memory. No polling, no two-tab merge — B's
 * autosave adds those.
 */
export function createInterimFlush(store: CanvasStore, projectId: string): InterimFlush {
  let timer: ReturnType<typeof setTimeout> | null = null
  let maxTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let inflight = false
  let again = false
  let attached = false

  const setSave = (v: SaveState) =>
    store.set((s) => {
      if (s.saveState !== v) s.saveState = v
    })

  const clearTimers = () => {
    if (timer) clearTimeout(timer)
    if (maxTimer) clearTimeout(maxTimer)
    timer = null
    maxTimer = null
  }

  const schedule = () => {
    if (store.dirtyIsEmpty()) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush('debounce'), DEBOUNCE_MS)
    if (!maxTimer) maxTimer = setTimeout(() => void flush('maxwait'), MAX_WAIT_MS)
  }

  const flush = async (reason: 'debounce' | 'maxwait' | 'hidden' | 'manual' = 'manual') => {
    if (inflight) {
      again = true
      return
    }
    if (store.dirtyIsEmpty()) return
    clearTimers()
    if (retryTimer) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
    const snap = store.takeDirty()
    inflight = true
    setSave('saving')
    const keepalive = reason === 'hidden'
    try {
      const rows = [...snap.upserts.values()]
      const deletes = [...snap.deletes]
      const restores = [...snap.restores]
      if (rows.length || deletes.length || restores.length) {
        const chunks = chunk(rows, CHUNK)
        if (chunks.length === 0) chunks.push([])
        let version: number | null = null
        for (let i = 0; i < chunks.length; i++) {
          const res = await api.blocks.batch(
            projectId,
            { upserts: chunks[i], deletes: i === 0 ? deletes : [], restores: i === 0 ? restores : [] },
            { keepalive }
          )
          version = res.canvas_version
        }
        if (version !== null) {
          const v = version
          store.set((s) => {
            s.project = { ...s.project, canvas_version: v }
          })
        }
      }
      for (const link of snap.links_add.values()) {
        await api.links.create(projectId, { id: link.id, from_block_id: link.from_block_id, to_block_id: link.to_block_id, word: link.word })
      }
      for (const id of snap.links_delete) await api.links.delete(projectId, id)
      if (Object.keys(snap.project).length > 0) await api.projects.patch(projectId, snap.project, { keepalive })
      attempt = 0
      setSave(store.dirtyIsEmpty() ? 'saved' : 'saving')
    } catch (e) {
      // newer local edits win over the failed snapshot
      mergePatchInto(store.dirty, snap, false)
      const status = e instanceof ApiError ? e.status : 0
      if (status === 401) {
        setSave('signin')
      } else {
        setSave('unsaved')
        const retryable = status === 0 || status >= 500 || status === 429
        if (retryable) {
          const delay = RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)]
          attempt += 1
          retryTimer = setTimeout(() => void flush('manual'), delay)
        } else {
          console.error('studio: save failed', e)
        }
      }
    } finally {
      inflight = false
      if (again) {
        again = false
        schedule()
      }
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') void flush('hidden')
  }
  const onPageHide = () => void flush('hidden')

  const attach = () => {
    if (attached || typeof window === 'undefined') return
    attached = true
    window.addEventListener('pagehide', onPageHide)
    document.addEventListener('visibilitychange', onVisibility)
  }
  const detach = () => {
    clearTimers()
    if (retryTimer) clearTimeout(retryTimer)
    retryTimer = null
    if (!attached || typeof window === 'undefined') return
    attached = false
    window.removeEventListener('pagehide', onPageHide)
    document.removeEventListener('visibilitychange', onVisibility)
  }

  return { schedule, flush, attach, detach, dispose: detach }
}

// ── the default (engine-less) actions ─────────────────────────────────────

export interface DefaultActionsOptions {
  store: CanvasStore
  projectId: string
  userId: string
  /** The stage's size in screen px (the fixed root minus the top bar). */
  stageSize: () => { w: number; h: number }
  /** Pass an existing flusher to share it; otherwise one is created and disposed with the actions. */
  flush?: InterimFlush
}

export function createDefaultActions(opts: DefaultActionsOptions): CanvasActions {
  const { store, projectId, userId } = opts
  const flush = opts.flush ?? createInterimFlush(store, projectId)
  const ownsFlush = !opts.flush
  if (ownsFlush) flush.attach()

  const canArrange = () => store.get().interactive
  const get = (id: string): AnyBlock | undefined => {
    const b = store.get().blocks.get(id)
    return b && !b.deleted_at ? b : undefined
  }
  const maxZ = () => store.liveBlocks().reduce((m, b) => Math.max(m, b.z), 0)

  const patch = (p: Partial<DirtyPatch>) => {
    store.applyPatch({ ...createEmptyPatch(), ...p })
    flush.schedule()
  }
  const upsertRows = (rows: AnyBlock[]) => {
    if (rows.length === 0) return
    const now = new Date().toISOString()
    patch({ upserts: new Map(rows.map((r) => [r.id, { ...r, updated_at: now } as AnyBlock])) })
  }
  const mapRows = (ids: string[], fn: (b: AnyBlock) => AnyBlock | null) => {
    const out: AnyBlock[] = []
    for (const id of ids) {
      const b = get(id)
      if (!b) continue
      const next = fn(b)
      if (next) out.push(next)
    }
    upsertRows(out)
  }
  /** After a lifecycle route returns the server row: replace it locally and refresh a pending dirty copy. */
  const takeServerRow = (row: AnyBlock, extra?: Partial<AnyBlock>) => {
    const local = store.get().blocks.get(row.id)
    const merged = { ...(local ?? row), ...row, ...extra } as AnyBlock
    store.updateBlock(row.id, merged)
    if (store.dirty.upserts.has(row.id)) store.markDirty([row.id])
  }
  const mergeCompass = (entry: CompassEntry | undefined) => {
    if (!entry) return
    store.set((s) => {
      const i = s.compass.findIndex((e) => e.id === entry.id)
      s.compass = i === -1 ? [...s.compass, entry] : s.compass.map((e) => (e.id === entry.id ? entry : e))
    })
  }

  let viewportTimer: ReturnType<typeof setTimeout> | null = null
  const setViewport = (v: Viewport) => {
    store.set((s) => {
      s.viewport = v
      s.chip = v.k < 0.3
    })
    if (viewportTimer) clearTimeout(viewportTimer)
    viewportTimer = setTimeout(() => {
      store.dirty.project = { ...store.dirty.project, viewport: store.get().viewport }
      flush.schedule()
    }, 1000)
  }
  const centre = (): Point => {
    const { w, h } = opts.stageSize()
    return { x: w / 2, y: h / 2 }
  }
  const fitRect = (r: Rect | null) => {
    if (!r) return
    const { w, h } = opts.stageSize()
    setViewport(fitViewport(r, w, h))
  }

  const actions: CanvasActions = {
    select(ids) {
      store.set((s) => {
        const next = new Set<string>()
        let last: string | null = null
        for (const id of ids) {
          const b = s.blocks.get(id)
          if (!b || b.deleted_at || b.hidden || !registry[b.type].selectable) continue
          next.add(id)
          last = id
        }
        s.selection = next
        s.primary = last
      })
    },

    zoomBy(f) {
      const v = store.get().viewport
      setViewport(zoomAt(v, centre(), v.k * f))
    },

    zoomTo(k) {
      setViewport(zoomAt(store.get().viewport, centre(), k))
    },

    fitAll() {
      fitRect(store.bboxAll())
    },

    fitIds(ids) {
      const rects: Rect[] = []
      for (const id of ids) {
        const b = get(id)
        if (b) rects.push(rectOf(b))
      }
      fitRect(unionRects(rects))
    },

    tidy(everything) {
      if (!canArrange()) return
      const result = runTidy(
        { blocks: store.liveBlocks(), heights: new Map(), projectId, userId },
        { everything }
      )
      const rows: AnyBlock[] = []
      for (const [id, { to }] of result.moves) {
        const b = get(id)
        if (!b) continue
        rows.push({ ...b, x: to.x, y: to.y, w: to.w, h: to.h, placed_by: everything ? 'auto' : b.placed_by } as AnyBlock)
      }
      const timeline = result.stack.newTimeline ?? result.stack.timeline
      if (result.stack.newTimeline) rows.push(result.stack.newTimeline)
      if (timeline && result.stack.ids.length) {
        for (const id of result.stack.ids) {
          const b = get(id)
          if (b) rows.push({ ...b, stacked_in: timeline.id } as AnyBlock)
        }
      }
      if (rows.length === 0) return
      const world = typeof document !== 'undefined' ? document.querySelector('[data-world]') : null
      world?.classList.add('tidying')
      upsertRows(rows)
      setTimeout(() => world?.classList.remove('tidying'), 340)
      const { w, h } = opts.stageSize()
      const view = visibleWorldRect(store.get().viewport, w, h)
      const left = [...result.moves.values()].some(({ to }) => !intersects(to, view))
      if (left) actions.fitAll()
    },

    duplicate(ids) {
      if (!canArrange()) return
      let z = maxZ()
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
          created_at: now,
          updated_at: now,
        } as AnyBlock)
      }
      if (copies.length === 0) return
      upsertRows(copies)
      actions.select(copies.map((c) => c.id))
    },

    softDelete(ids) {
      if (!canArrange()) return
      const deletes = new Set<string>()
      const keep: AnyBlock[] = []
      for (const id of ids) {
        const b = get(id)
        if (!b || !registry[b.type].deletable) continue
        deletes.add(id)
        if (b.type === 'frame') {
          for (const c of store.childrenOf(id)) keep.push({ ...c, parent_id: null } as AnyBlock)
        }
        if (b.type === 'timeline') {
          for (const c of store.childrenStacked(id)) keep.push({ ...c, stacked_in: null } as AnyBlock)
        }
      }
      if (deletes.size === 0) return
      const now = new Date().toISOString()
      patch({
        deletes,
        upserts: new Map(keep.filter((k) => !deletes.has(k.id)).map((k) => [k.id, { ...k, updated_at: now } as AnyBlock])),
      })
    },

    lock(ids, v) {
      if (!canArrange()) return
      mapRows(ids, (b) => (b.locked === v ? null : ({ ...b, locked: v } as AnyBlock)))
    },

    hide(ids, v) {
      if (!canArrange()) return
      mapRows(ids, (b) => (b.hidden === v ? null : ({ ...b, hidden: v } as AnyBlock)))
      if (v) {
        store.set((s) => {
          const next = new Set(s.selection)
          for (const id of ids) next.delete(id)
          s.selection = next
          if (s.primary && !next.has(s.primary)) s.primary = null
        })
      }
    },

    rename(id, name) {
      if (!canArrange()) return
      const trimmed = name.trim().slice(0, 120)
      mapRows([id], (b) => ((b.name ?? '') === trimmed ? null : ({ ...b, name: trimmed || null } as AnyBlock)))
    },

    resize(id, size) {
      if (!canArrange()) return
      mapRows([id], (b) => {
        const s = registry[b.type]
        const w = size.w === undefined ? b.w : Math.min(s.maxW, Math.max(s.minW, snap8(size.w)))
        const h = size.h === undefined || s.autoHeight ? b.h : Math.min(s.maxH, Math.max(s.minH, ceil8(size.h)))
        if (w === b.w && h === b.h) return null
        return { ...b, w, h, placed_by: 'person' } as AnyBlock
      })
    },

    stepZ(ids, dir) {
      if (!canArrange()) return
      const set = new Set(ids)
      const live = store.liveBlocks()
      const members = live.filter((b) => set.has(b.id)).sort((a, b) => a.z - b.z)
      if (members.length === 0) return
      const rows: AnyBlock[] = []
      if (dir === 'front') {
        let z = maxZ()
        for (const b of members) rows.push({ ...b, z: ++z } as AnyBlock)
      } else if (dir === 'back_all') {
        let z = live.reduce((m, b) => Math.min(m, b.z), 0) - members.length
        for (const b of members) rows.push({ ...b, z: ++z } as AnyBlock)
      } else {
        const ordered = dir === 'forward' ? [...members].reverse() : members
        const taken = new Set<string>()
        for (const b of ordered) {
          const siblings = live.filter((o) => o.parent_id === b.parent_id && !set.has(o.id) && !taken.has(o.id))
          const neighbour =
            dir === 'forward'
              ? siblings.filter((o) => o.z > b.z).sort((p, q) => p.z - q.z)[0]
              : siblings.filter((o) => o.z < b.z).sort((p, q) => q.z - p.z)[0]
          if (!neighbour) continue
          taken.add(neighbour.id)
          rows.push({ ...b, z: neighbour.z } as AnyBlock, { ...neighbour, z: b.z } as AnyBlock)
        }
      }
      upsertRows(rows)
    },

    reorderZ(orderedIds) {
      if (!canArrange()) return
      const blocks = orderedIds.map(get).filter((b): b is AnyBlock => !!b)
      if (blocks.length < 2) return
      const zs = blocks.map((b) => b.z).sort((a, b) => b - a)
      const rows: AnyBlock[] = []
      blocks.forEach((b, i) => {
        if (b.z !== zs[i]) rows.push({ ...b, z: zs[i], placed_by: 'person' } as AnyBlock)
      })
      upsertRows(rows)
    },

    async strike(id, sentence) {
      const b = get(id)
      const text = sentence.trim().slice(0, 280)
      if (!b || !text) return
      const { block } = await api.blocks.strike(projectId, id, { sentence: text })
      takeServerRow(block)
    },

    async unstrike(id) {
      if (!get(id)) return
      const { block } = await api.blocks.unstrike(projectId, id)
      takeServerRow(block, { struck_at: null, struck_by: null })
    },

    frameSelection(ids) {
      if (!canArrange()) return
      const members = ids
        .map(get)
        .filter((b): b is AnyBlock => !!b && b.type !== 'since' && b.type !== 'concept' && b.type !== 'compass')
        // a frame holding a frame cannot go one level deeper (D-019)
        .filter((b) => !(b.type === 'frame' && store.childrenOf(b.id).some((c) => c.type === 'frame')))
      if (members.length === 0) return
      const rects = members.flatMap((b) => [rectOf(b), ...store.descendants(b.id).map(rectOf)])
      const bbox = unionRects(rects)
      if (!bbox) return
      const x = snap8(bbox.x - 24)
      const y = snap8(bbox.y - 24)
      const w = Math.max(registry.frame.minW, snap8(bbox.x + bbox.w + 24) - x)
      const h = Math.max(registry.frame.minH, ceil8(bbox.y + bbox.h + 24) - y)
      const frame = makeBlock({
        type: 'frame',
        userId,
        projectId,
        x,
        y,
        w,
        h,
        z: maxZ() + 1,
        content: { expanded_h: h, tint: 'none' },
        placed_by: 'person',
      })
      const rows: AnyBlock[] = [frame, ...members.map((b) => ({ ...b, parent_id: frame.id }) as AnyBlock)]
      upsertRows(rows)
      actions.select([frame.id])
    },

    enterLink() {
      if (!canArrange()) return
      // The pointer machine (B) completes the gesture; here only the mode changes.
      store.set((s) => {
        s.mode = 'linking'
      })
    },

    enterPlacing(type) {
      if (!canArrange()) return
      const c = screenToWorld(store.get().viewport, centre())
      const size = defaultSize(type)
      const x = snap8(c.x - size.w / 2)
      const y = snap8(c.y - size.h / 2)

      if (type === 'draft') {
        void api.drafts
          .create(projectId, { x, y })
          .then(({ draft, block }) => {
            store.set(
              (s) => {
                s.blocks.set(block.id, block)
                s.drafts = [...s.drafts.filter((d) => d.id !== draft.id), draft]
              },
              [block.id]
            )
            actions.select([block.id])
            store.set((s) => {
              s.drawer = { kind: 'draft', draftId: draft.id }
            })
          })
          .catch((e) => console.error('studio: draft create failed', e))
        return
      }

      const block = makeBlock({ type, userId, projectId, x, y, z: maxZ() + 1, placed_by: 'person' })
      store.set(
        (s) => {
          s.blocks.set(block.id, block)
        },
        [block.id]
      )
      actions.select([block.id])
      void api.blocks
        .create(projectId, block)
        .then(({ block: saved }) => {
          const local = store.get().blocks.get(saved.id)
          // keep any local change made while the request was in flight; take the server's z and stamps
          store.updateBlock(saved.id, { ...(local ?? saved), z: saved.z, created_at: saved.created_at, updated_at: saved.updated_at })
          if (store.dirty.upserts.has(saved.id)) store.markDirty([saved.id])
        })
        .catch((e) => {
          console.error('studio: block create failed', e)
          store.set(
            (s) => {
              s.blocks.delete(block.id)
              const next = new Set(s.selection)
              next.delete(block.id)
              s.selection = next
              if (s.primary === block.id) s.primary = null
            },
            [block.id]
          )
        })
    },

    collapse(id, v) {
      if (!canArrange()) return
      mapRows([id], (b) => {
        if (b.type !== 'frame' || b.collapsed === v) return null
        if (v) {
          return { ...b, collapsed: true, h: 48, content: { ...b.content, expanded_h: b.h } } as AnyBlock
        }
        const h = Math.max(registry.frame.minH, b.content.expanded_h || registry.frame.defaultH)
        return { ...b, collapsed: false, h } as AnyBlock
      })
    },

    async place(id) {
      const b = get(id)
      if (!b || b.arrival_state !== 'unplaced') return
      const res = await api.blocks.arrival(projectId, id, { action: 'place' })
      takeServerRow(res.block, { arrival_state: 'placed' })
      mergeCompass(res.compass_entry)
      // While auto_layout is on, B's composeAuto() flows the block into its region (D-037); until then it stays put.
    },

    async dismiss(id) {
      const b = get(id)
      if (!b || b.arrival_state !== 'unplaced') return
      const res = await api.blocks.arrival(projectId, id, { action: 'dismiss' })
      takeServerRow(res.block, { deleted_at: res.block.deleted_at ?? new Date().toISOString() })
      mergeCompass(res.compass_entry)
      store.set((s) => {
        if (s.selection.has(id)) {
          const next = new Set(s.selection)
          next.delete(id)
          s.selection = next
          if (s.primary === id) s.primary = null
        }
      })
    },

    undo() {
      // Lane B's CommandStack; nothing to undo without it.
    },

    redo() {
      // Lane B's CommandStack.
    },

    undoLabel() {
      return null
    },

    dispose() {
      if (viewportTimer) clearTimeout(viewportTimer)
      if (ownsFlush) flush.detach()
    },
  }

  return actions
}
