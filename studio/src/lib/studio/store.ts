// studio/src/lib/studio/store.ts — the single mutable canvas state (5.3).
// Plain TypeScript, no React: the engine mutates it through Commands (B),
// React reads it through hooks.ts. Local store is the truth; `dirty` is what
// autosave flushes (D-030).
//
// Identity rules every mutator must follow, because reads are compared with
// Object.is by useSyncExternalStore:
//   • replace a block row when it changes:  s.blocks.set(id, { ...row, x })
//   • replace a slice container when it changes: s.selection = new Set(next)
//   • never mutate a row in place after it has been handed to the Map
// `set(mutator, touched)` notifies the per-block listeners of `touched` only;
// global listeners fire on every set. Nothing here marks rows dirty except
// applyPatch / markDirty.

import type {
  AnyBlock, AssetView, Catch, CompassEntry, ConceptRevision, DirtyPatch, DraftSummary,
  Link, Project, ProjectBundle, Rect, SincePayload, Viewport,
} from '@/lib/studio/types'

/** Pointer-machine mode (5.4). Declared here because types.ts is frozen and the store needs it; B's pointer.ts imports it. */
export type Mode =
  | 'idle' | 'pressing' | 'panning' | 'dragging' | 'resizing' | 'marquee'
  | 'linking' | 'placing' | 'editing' | 'pinching'

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'signin'
export type DrawerKind = 'none' | 'talk' | 'compass' | 'draft' | 'revisions'
export type LeftDock = 'none' | 'library' | 'layers'
export type RightDock = 'none' | 'selection' | 'grid' | 'project'

export interface CanvasState {
  project: Project
  concept: ConceptRevision
  blocks: Map<string, AnyBlock>
  links: Map<string, Link>
  compass: CompassEntry[]
  catches: Catch[]
  drafts: DraftSummary[]
  assets: Map<string, AssetView>
  since: SincePayload
  selection: Set<string>
  primary: string | null
  hover: string | null
  editing: string | null
  viewport: Viewport
  mode: Mode
  interactive: boolean
  chip: boolean
  saveState: SaveState
  drawer: { kind: DrawerKind; draftId?: string }
  dock: { left: LeftDock; right: RightDock }
}

export interface CanvasStore {
  get(): CanvasState
  subscribe(fn: () => void): () => void
  subscribeBlock(id: string, fn: () => void): () => void
  /** Run a mutator; `touched` = block ids whose per-block listeners fire. Marks nothing dirty. */
  set(mutator: (s: CanvasState) => void, touched?: string[]): void
  /** Apply rows to state AND merge them into `dirty` (commands + refetch merge). */
  applyPatch(p: DirtyPatch): void
  /** What autosave flushes. Snapshot with `takeDirty()` or read directly. */
  dirty: DirtyPatch
  /** Copy the current rows of `ids` into dirty.upserts (silent writes such as measured heights). */
  markDirty(ids: string[]): void
  clearDirty(): void
  dirtyIsEmpty(): boolean
  /** Atomically snapshot-and-clear dirty (what autosave's flush does). */
  takeDirty(): DirtyPatch
  /** Replace one row and notify its listeners; does not mark dirty. */
  updateBlock(id: string, partial: Partial<AnyBlock>): void
  /** Monotonic counter, bumped on every set/applyPatch (derived-selector memo key). */
  version(): number

  // ── derived, memoised per version ──
  liveBlocks(): AnyBlock[]
  renderable(): AnyBlock[]
  topLevel(): AnyBlock[]
  childrenOf(id: string): AnyBlock[]
  descendants(id: string): AnyBlock[]
  depthOf(id: string): number
  renderOrder(): AnyBlock[]
  bboxAll(): Rect | null
  unplaced(): AnyBlock[]
  childrenStacked(id: string): AnyBlock[]
  isAncestorCollapsed(id: string): boolean
}

export function createEmptyPatch(): DirtyPatch {
  return {
    upserts: new Map(),
    deletes: new Set(),
    restores: new Set(),
    links_add: new Map(),
    links_delete: new Set(),
    project: {},
  }
}

export function patchIsEmpty(p: DirtyPatch): boolean {
  return (
    p.upserts.size === 0 &&
    p.deletes.size === 0 &&
    p.restores.size === 0 &&
    p.links_add.size === 0 &&
    p.links_delete.size === 0 &&
    Object.keys(p.project).length === 0
  )
}

/** Merge `src` into `dst` (later wins per row). Used by autosave to re-merge a failed snapshot. */
export function mergePatchInto(dst: DirtyPatch, src: DirtyPatch, srcWins = true): DirtyPatch {
  for (const [id, row] of src.upserts) {
    if (srcWins || !dst.upserts.has(id)) dst.upserts.set(id, row)
  }
  for (const id of src.deletes) { dst.deletes.add(id); dst.restores.delete(id) }
  for (const id of src.restores) { dst.restores.add(id); dst.deletes.delete(id) }
  for (const [id, link] of src.links_add) {
    if (srcWins || !dst.links_add.has(id)) dst.links_add.set(id, link)
    dst.links_delete.delete(id)
  }
  for (const id of src.links_delete) { dst.links_delete.add(id); dst.links_add.delete(id) }
  dst.project = srcWins ? { ...dst.project, ...src.project } : { ...src.project, ...dst.project }
  return dst
}

interface Index {
  live: AnyBlock[]
  byParent: Map<string, AnyBlock[]>
  byStack: Map<string, AnyBlock[]>
  depth: Map<string, number>
  hiddenByAncestor: Set<string>
  renderable: AnyBlock[]
  topLevel: AnyBlock[]
  unplaced: AnyBlock[]
}

const byCreatedAsc = (a: AnyBlock, b: AnyBlock) => a.created_at.localeCompare(b.created_at)
const byCreatedDesc = (a: AnyBlock, b: AnyBlock) => b.created_at.localeCompare(a.created_at)
const byZ = (a: AnyBlock, b: AnyBlock) => a.z - b.z

function buildIndex(blocks: Map<string, AnyBlock>): Index {
  const live: AnyBlock[] = []
  for (const b of blocks.values()) if (!b.deleted_at) live.push(b)
  live.sort(byZ)

  const liveIds = new Set(live.map((b) => b.id))
  const byParent = new Map<string, AnyBlock[]>()
  const byStack = new Map<string, AnyBlock[]>()
  for (const b of live) {
    if (b.parent_id && liveIds.has(b.parent_id)) {
      const arr = byParent.get(b.parent_id) ?? []
      arr.push(b)
      byParent.set(b.parent_id, arr)
    }
    if (b.stacked_in && liveIds.has(b.stacked_in)) {
      const arr = byStack.get(b.stacked_in) ?? []
      arr.push(b)
      byStack.set(b.stacked_in, arr)
    }
  }
  for (const arr of byStack.values()) arr.sort(byCreatedDesc)

  // depth: 0 for top-level; parent depth + 1; a dangling or cyclic parent counts as top-level
  const depth = new Map<string, number>()
  const hiddenByAncestor = new Set<string>()
  const resolve = (b: AnyBlock, trail: Set<string>): number => {
    const known = depth.get(b.id)
    if (known !== undefined) return known
    if (!b.parent_id || !liveIds.has(b.parent_id) || trail.has(b.id)) {
      depth.set(b.id, 0)
      return 0
    }
    trail.add(b.id)
    const parent = blocks.get(b.parent_id)!
    const d = Math.min(2, resolve(parent, trail) + 1)
    depth.set(b.id, d)
    if (parent.collapsed || parent.hidden || hiddenByAncestor.has(parent.id)) hiddenByAncestor.add(b.id)
    return d
  }
  for (const b of live) resolve(b, new Set())

  const renderable = live.filter((b) => !b.hidden && !b.stacked_in && !hiddenByAncestor.has(b.id))
  const topLevel = live.filter((b) => depth.get(b.id) === 0 && !b.stacked_in)
  const unplaced = live.filter((b) => b.arrival_state === 'unplaced').sort(byCreatedAsc)

  return { live, byParent, byStack, depth, hiddenByAncestor, renderable, topLevel, unplaced }
}

export function createStore(bundle: ProjectBundle, interactive: boolean): CanvasStore {
  const state: CanvasState = {
    project: bundle.project,
    concept: bundle.concept,
    blocks: new Map(bundle.blocks.map((b) => [b.id, b])),
    links: new Map(bundle.links.map((l) => [l.id, l])),
    compass: bundle.compass,
    catches: bundle.catches,
    drafts: bundle.drafts,
    assets: new Map(bundle.assets.map((a) => [a.id, a])),
    since: bundle.since,
    selection: new Set(),
    primary: null,
    hover: null,
    editing: null,
    viewport: bundle.project.viewport,
    mode: 'idle',
    interactive,
    chip: bundle.project.viewport.k < 0.3,
    saveState: 'saved',
    drawer: { kind: 'none' },
    dock: { left: 'none', right: 'none' },
  }

  let version = 0
  const listeners = new Set<() => void>()
  const blockListeners = new Map<string, Set<() => void>>()

  let index: Index | null = null
  let indexVersion = -1
  const idx = (): Index => {
    if (!index || indexVersion !== version) {
      index = buildIndex(state.blocks)
      indexVersion = version
    }
    return index
  }

  let renderOrderCache: AnyBlock[] | null = null
  let renderOrderVersion = -1
  let bboxCache: Rect | null | undefined
  let bboxVersion = -1

  const notify = (touched?: string[]) => {
    version += 1
    if (touched) {
      for (const id of touched) {
        const set = blockListeners.get(id)
        if (set) for (const fn of set) fn()
      }
    }
    for (const fn of listeners) fn()
  }

  const dirty = createEmptyPatch()

  const store: CanvasStore = {
    dirty,
    get: () => state,
    version: () => version,

    subscribe(fn) {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },

    subscribeBlock(id, fn) {
      let set = blockListeners.get(id)
      if (!set) { set = new Set(); blockListeners.set(id, set) }
      set.add(fn)
      return () => {
        const s = blockListeners.get(id)
        if (!s) return
        s.delete(fn)
        if (s.size === 0) blockListeners.delete(id)
      }
    },

    set(mutator, touched) {
      mutator(state)
      notify(touched)
    },

    updateBlock(id, partial) {
      const row = state.blocks.get(id)
      if (!row) return
      state.blocks.set(id, { ...row, ...partial } as AnyBlock)
      notify([id])
    },

    applyPatch(p) {
      const touched: string[] = []
      const now = new Date().toISOString()
      for (const [id, row] of p.upserts) {
        state.blocks.set(id, row)
        dirty.upserts.set(id, row)
        touched.push(id)
      }
      for (const id of p.deletes) {
        const row = state.blocks.get(id)
        if (row && !row.deleted_at) state.blocks.set(id, { ...row, deleted_at: now } as AnyBlock)
        dirty.deletes.add(id)
        dirty.restores.delete(id)
        touched.push(id)
      }
      for (const id of p.restores) {
        const row = state.blocks.get(id)
        if (row && row.deleted_at) state.blocks.set(id, { ...row, deleted_at: null } as AnyBlock)
        dirty.restores.add(id)
        dirty.deletes.delete(id)
        touched.push(id)
      }
      for (const [id, link] of p.links_add) {
        state.links.set(id, link)
        dirty.links_add.set(id, link)
        dirty.links_delete.delete(id)
      }
      for (const id of p.links_delete) {
        state.links.delete(id)
        dirty.links_delete.add(id)
        dirty.links_add.delete(id)
      }
      if (Object.keys(p.project).length > 0) {
        const { settings, ...rest } = p.project
        state.project = {
          ...state.project,
          ...rest,
          settings: settings ? { ...state.project.settings, ...settings } : state.project.settings,
        } as Project
        if (p.project.viewport) state.viewport = p.project.viewport
        dirty.project = { ...dirty.project, ...p.project }
      }
      if (p.deletes.size || p.restores.size) {
        // a deleted block leaves the selection; a restored one does not re-enter it
        const next = new Set(state.selection)
        for (const id of p.deletes) next.delete(id)
        if (next.size !== state.selection.size) {
          state.selection = next
          if (state.primary && !next.has(state.primary)) state.primary = null
        }
      }
      notify(touched)
    },

    markDirty(ids) {
      for (const id of ids) {
        const row = state.blocks.get(id)
        if (row) dirty.upserts.set(id, row)
      }
    },

    clearDirty() {
      dirty.upserts.clear()
      dirty.deletes.clear()
      dirty.restores.clear()
      dirty.links_add.clear()
      dirty.links_delete.clear()
      dirty.project = {}
    },

    dirtyIsEmpty: () => patchIsEmpty(dirty),

    takeDirty() {
      const snap: DirtyPatch = {
        upserts: new Map(dirty.upserts),
        deletes: new Set(dirty.deletes),
        restores: new Set(dirty.restores),
        links_add: new Map(dirty.links_add),
        links_delete: new Set(dirty.links_delete),
        project: { ...dirty.project },
      }
      store.clearDirty()
      return snap
    },

    // ── derived ──
    liveBlocks: () => idx().live,
    renderable: () => idx().renderable,
    topLevel: () => idx().topLevel,
    childrenOf: (id) => idx().byParent.get(id) ?? [],
    descendants(id) {
      const out: AnyBlock[] = []
      const walk = (pid: string, guard: number) => {
        if (guard > 3) return
        for (const c of idx().byParent.get(pid) ?? []) {
          out.push(c)
          walk(c.id, guard + 1)
        }
      }
      walk(id, 0)
      return out
    },
    depthOf: (id) => idx().depth.get(id) ?? 0,
    renderOrder() {
      if (!renderOrderCache || renderOrderVersion !== version) {
        const i = idx()
        renderOrderCache = [...i.renderable].sort((a, b) => {
          const da = i.depth.get(a.id) ?? 0
          const db = i.depth.get(b.id) ?? 0
          return da !== db ? da - db : a.z - b.z
        })
        renderOrderVersion = version
      }
      return renderOrderCache
    },
    bboxAll() {
      if (bboxCache === undefined || bboxVersion !== version) {
        const rs = idx().renderable
        if (rs.length === 0) {
          bboxCache = null
        } else {
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
          for (const b of rs) {
            if (b.x < x0) x0 = b.x
            if (b.y < y0) y0 = b.y
            if (b.x + b.w > x1) x1 = b.x + b.w
            if (b.y + b.h > y1) y1 = b.y + b.h
          }
          bboxCache = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
        }
        bboxVersion = version
      }
      return bboxCache
    },
    unplaced: () => idx().unplaced,
    childrenStacked: (id) => idx().byStack.get(id) ?? [],
    isAncestorCollapsed: (id) => idx().hiddenByAncestor.has(id),
  }

  return store
}
