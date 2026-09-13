// studio/src/lib/studio/engine/pointer.ts — the pointer state machine (5.4).
//
// The rule that shapes this file: during a drag NOTHING goes through React. The
// machine writes transforms straight onto the block elements and tells the
// overlay imperatively; one Command on pointer-up re-renders only what moved.
// That is what keeps 300 blocks at 60fps on a laptop.

import { rectOf, snap8 } from '@/lib/studio/geometry'
import { registry } from '@/lib/studio/registry'
import type { CanvasStore, Mode } from '@/lib/studio/store'
import type { AnyBlock, Handle, Point, Rect, Viewport } from '@/lib/studio/types'
import {
  CommandStack, MoveCommand, ResizeCommand, type Command,
} from '@/lib/studio/engine/commands'
import {
  frameUnderCentre, reparentFor,
} from '@/lib/studio/engine/frames'
import {
  collectNeighbours, resizeRect, snapMove, snapResize, type GapLabel, type Guide,
} from '@/lib/studio/engine/snap'
import {
  blocksIntersecting, canSelect, closure, sanitiseSelection, toggle,
} from '@/lib/studio/engine/selection'
import {
  pinch, screenToWorld, visibleWorldRect, worldTransform, gridPosition, applyWheel, sameViewport,
} from '@/lib/studio/engine/viewport'

export const DRAG_THRESHOLD = 4
export const DOUBLE_MS = 350

export interface OverlayApi {
  guides(g: Guide[], gaps: GapLabel[]): void
  clearGuides(): void
  marquee(r: Rect | null): void
  /** The frame a drop would land in, highlighted. */
  dropFrame(id: string | null): void
  /** The rubber line while a link is being drawn. */
  rubber(from: Point | null, to: Point | null): void
  ghost(rect: Rect | null): void
  /** Redraw selection outline and handles from the store. */
  sync(): void
}

export interface LinksApiLike {
  updateFor(ids: Set<string>, d: Point): void
  redraw(): void
}

export interface PointerEnv {
  store: CanvasStore
  /** Block id → its positioned element, registered by BlockView. */
  refs: Map<string, HTMLElement>
  overlay: OverlayApi
  links: LinksApiLike
  stack: CommandStack
  stageEl: () => HTMLElement | null
  worldEl: () => HTMLElement | null
  vw(): number
  vh(): number
  now?(): number
  /** Ask the host to persist whatever the command marked dirty. */
  onCommit(cmd: Command): void
  /** Viewport settled (pan/zoom end, or a frame tick). */
  onViewport(v: Viewport): void
  /** The machine wants a block edited, or opened. */
  onEdit(id: string): void
  onOpen(id: string): void
  /** Link mode picked two blocks. */
  onLink(fromId: string, toId: string): void
  /** Placing mode dropped a type at a world point. */
  onPlace(type: AnyBlock['type'], at: Point): void
  /** Ids currently being dragged, so autosave's refetch leaves them alone. */
  onBusy(ids: Set<string>): void
}

interface Gesture {
  pointerId: number
  p0: Point
  v0: Viewport
  moved: boolean
  /** Rects as they were when the gesture began. */
  from: Map<string, Rect>
  moveSet: Set<string>
  primary: string | null
  handle: Handle | null
  neighbours: Rect[]
  marqueeCandidate: boolean
  shift: boolean
}

export interface PointerMachine {
  down(e: PointerEvent): void
  move(e: PointerEvent): void
  up(e: PointerEvent): void
  cancel(): void
  wheel(e: WheelEvent): void
  keydown(e: KeyboardEvent): void
  keyup(e: KeyboardEvent): void
  enterLink(): void
  enterPlacing(type: AnyBlock['type']): void
  exitMode(): void
  enterEdit(id: string): void
  exitEdit(commit: boolean): void
  mode(): Mode
  /** The live viewport, including mid-gesture values React has not seen. */
  viewport(): Viewport
  setViewport(v: Viewport, persist?: boolean): void
  dispose(): void
}

export function createPointerMachine(env: PointerEnv): PointerMachine {
  const { store } = env
  const now = env.now ?? (() => Date.now())

  let mode: Mode = 'idle'
  let g: Gesture | null = null
  let v: Viewport = store.get().viewport
  let spaceHeld = false
  let lastClick = { id: '', at: 0 }
  let placingType: AnyBlock['type'] | null = null
  let linkFrom: string | null = null
  let rafViewport = 0
  let rafMarquee = 0
  let pinchState: { d0: number; m0: Point; v0: Viewport; ids: [number, number] } | null = null
  const active = new Map<number, Point>()

  const setMode = (m: Mode) => {
    if (mode === m) return
    mode = m
    store.set((s) => { s.mode = m })
  }

  // ── viewport writes: imperative during a gesture, store once per frame ────

  const paintViewport = () => {
    const world = env.worldEl()
    const stage = env.stageEl()
    if (world) world.style.transform = worldTransform(v)
    if (stage && store.get().project.settings.grid) {
      const g2 = gridPosition(v)
      stage.style.backgroundSize = g2.size
      stage.style.backgroundPosition = g2.position
    }
  }

  const pushViewport = (persist: boolean) => {
    if (rafViewport) cancelAnimationFrame(rafViewport)
    rafViewport = requestAnimationFrame(() => {
      rafViewport = 0
      env.onViewport(v)
      if (persist) env.overlay.sync()
    })
  }

  const setViewport = (next: Viewport, persist = true) => {
    if (sameViewport(v, next)) return
    v = next
    paintViewport()
    pushViewport(persist)
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  const stagePoint = (e: PointerEvent | WheelEvent): Point => {
    const el = env.stageEl()
    if (!el) return { x: e.clientX, y: e.clientY }
    const r = el.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  const blockIdFrom = (target: EventTarget | null): string | null => {
    if (!(target instanceof Element)) return null
    const el = target.closest('[data-block-id]')
    return el?.getAttribute('data-block-id') ?? null
  }

  const handleFrom = (target: EventTarget | null): Handle | null => {
    if (!(target instanceof Element)) return null
    const el = target.closest('[data-handle]')
    const h = el?.getAttribute('data-handle')
    return (h as Handle) ?? null
  }

  const insideNoDrag = (target: EventTarget | null): boolean =>
    target instanceof Element && !!target.closest('[data-no-drag]')

  const writeRect = (id: string, r: Rect) => {
    const el = env.refs.get(id)
    if (!el) return
    el.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`
    el.style.width = `${r.w}px`
    if (!registry[store.get().blocks.get(id)?.type ?? 'note'].autoHeight) el.style.height = `${r.h}px`
  }

  const restoreRects = () => {
    if (!g) return
    for (const [id, r] of g.from) writeRect(id, r)
    env.links.redraw()
  }

  const startDragStyles = (on: boolean) => {
    const world = env.worldEl()
    if (world) world.style.willChange = on ? 'transform' : ''
    const stage = env.stageEl()
    if (stage) stage.toggleAttribute('data-dragging', on)
    if (!on) setTimeout(() => { if (world && mode === 'idle') world.style.willChange = '' }, 300)
  }

  // ── pointerdown ──────────────────────────────────────────────────────────

  const down = (e: PointerEvent) => {
    const s = store.get()
    active.set(e.pointerId, { x: e.clientX, y: e.clientY })

    // a second finger during a pan becomes a pinch
    if (active.size === 2 && (mode === 'panning' || mode === 'pressing' || mode === 'idle')) {
      const [a, b] = [...active.entries()]
      pinchState = {
        d0: Math.hypot(a[1].x - b[1].x, a[1].y - b[1].y),
        m0: { x: (a[1].x + b[1].x) / 2, y: (a[1].y + b[1].y) / 2 },
        v0: v,
        ids: [a[0], b[0]],
      }
      setMode('pinching')
      return
    }

    if (insideNoDrag(e.target)) return                                      // D-028

    if (s.editing) {
      const id = blockIdFrom(e.target)
      if (id === s.editing) return
      exitEdit(true)
    }

    const p = stagePoint(e)
    env.stageEl()?.setPointerCapture(e.pointerId)

    const base: Gesture = {
      pointerId: e.pointerId,
      p0: p,
      v0: v,
      moved: false,
      from: new Map(),
      moveSet: new Set(),
      primary: null,
      handle: null,
      neighbours: [],
      marqueeCandidate: false,
      shift: e.shiftKey,
    }

    // panning: middle button, space held, or a surface that cannot be arranged
    if (e.button === 1 || spaceHeld || !s.interactive) {
      g = base
      setMode('panning')
      return
    }

    if (mode === 'placing' && placingType) {
      const world = screenToWorld(v, p)
      env.onPlace(placingType, { x: snap8(world.x), y: snap8(world.y) })
      placingType = null
      env.overlay.ghost(null)
      setMode('idle')
      return
    }

    if (mode === 'linking') {
      const id = blockIdFrom(e.target)
      if (!id) return
      if (!linkFrom) {
        linkFrom = id
        env.overlay.rubber(centreScreenOf(id), p)
      } else if (linkFrom !== id) {
        env.onLink(linkFrom, id)
        linkFrom = null
        env.overlay.rubber(null, null)
        setMode('idle')
      }
      return
    }

    const handle = handleFrom(e.target)
    if (handle && s.primary) {
      const row = s.blocks.get(s.primary)
      if (row) {
        g = { ...base, handle, primary: row.id, from: new Map([[row.id, rectOf(row)]]) }
        g.neighbours = collectNeighbours(store.liveBlocks(), new Set([row.id]), visibleWorldRect(v, env.vw(), env.vh()))
        setMode('resizing')
        return
      }
    }

    const hitId = blockIdFrom(e.target)
    if (hitId) {
      const row = s.blocks.get(hitId)
      if (!row || !canSelect(row, false)) { g = base; setMode('panning'); return }

      let selection = s.selection
      if (e.shiftKey) {
        selection = toggle(selection, hitId)
      } else if (!selection.has(hitId)) {
        selection = new Set([hitId])
      }
      const sane = sanitiseSelection(s, selection)
      store.set((st) => {
        st.selection = sane.selection
        st.primary = sane.selection.has(hitId) ? hitId : sane.primary
      })
      env.overlay.sync()

      const moveSet = closure(store.get(), store.get().selection)
      const from = new Map<string, Rect>()
      for (const id of moveSet) {
        const b = store.get().blocks.get(id)
        if (b) from.set(id, rectOf(b))
      }
      g = { ...base, primary: hitId, moveSet, from }
      g.neighbours = collectNeighbours(store.liveBlocks(), moveSet, visibleWorldRect(v, env.vw(), env.vh()))
      setMode('pressing')
      return
    }

    // empty ground
    if (!e.shiftKey && s.selection.size > 0) {
      store.set((st) => { st.selection = new Set(); st.primary = null })
      env.overlay.sync()
    }
    g = { ...base, marqueeCandidate: true }
    setMode('pressing')
  }

  const centreScreenOf = (id: string): Point | null => {
    const b = store.get().blocks.get(id)
    if (!b) return null
    return { x: (b.x + b.w / 2) * v.k + v.tx, y: (b.y + b.h / 2) * v.k + v.ty }
  }

  // ── pointermove ──────────────────────────────────────────────────────────

  const move = (e: PointerEvent) => {
    if (active.has(e.pointerId)) active.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (mode === 'pinching' && pinchState) {
      const a = active.get(pinchState.ids[0])
      const b = active.get(pinchState.ids[1])
      if (!a || !b) return
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      v = pinch(pinchState.v0, pinchState.m0, pinchState.d0, m, d)
      paintViewport()
      pushViewport(false)
      return
    }

    if (mode === 'linking' && linkFrom) {
      env.overlay.rubber(centreScreenOf(linkFrom), stagePoint(e))
      return
    }
    if (mode === 'placing' && placingType) {
      const w = screenToWorld(v, stagePoint(e))
      const spec = registry[placingType]
      env.overlay.ghost({ x: snap8(w.x), y: snap8(w.y), w: spec.defaultW, h: spec.defaultH })
      return
    }

    if (!g) return
    const p = stagePoint(e)
    const dScreen = { x: p.x - g.p0.x, y: p.y - g.p0.y }

    if (mode === 'panning') {
      v = { k: g.v0.k, tx: g.v0.tx + dScreen.x, ty: g.v0.ty + dScreen.y }
      paintViewport()
      pushViewport(false)
      return
    }

    if (mode === 'pressing') {
      if (Math.hypot(dScreen.x, dScreen.y) < DRAG_THRESHOLD) return
      g.moved = true
      if (g.marqueeCandidate) {
        setMode('marquee')
      } else {
        setMode('dragging')
        startDragStyles(true)
        env.onBusy(g.moveSet)
      }
    }

    if (mode === 'dragging' && g.primary) {
      const raw = { x: dScreen.x / v.k, y: dScreen.y / v.k }
      const from0 = g.from.get(g.primary)
      if (!from0) return
      const wanted: Rect = { ...from0, x: from0.x + raw.x, y: from0.y + raw.y }
      const settings = store.get().project.settings
      const useSnap = settings.snap && !e.shiftKey
      const snapped = snapMove(wanted, g.neighbours, v.k, { grid: useSnap, guides: useSnap })
      const d = { x: raw.x + snapped.dx, y: raw.y + snapped.dy }
      for (const [id, r] of g.from) writeRect(id, { ...r, x: r.x + d.x, y: r.y + d.y })
      env.links.updateFor(g.moveSet, d)
      env.overlay.guides(snapped.guides, snapped.gaps)
      const primaryRect = { ...from0, x: from0.x + d.x, y: from0.y + d.y }
      env.overlay.dropFrame(
        frameUnderCentre(store.get(), primaryRect, g.moveSet, store.liveBlocks(), store.depthOf),
      )
      return
    }

    if (mode === 'resizing' && g.primary && g.handle) {
      const from0 = g.from.get(g.primary)
      const row = store.get().blocks.get(g.primary)
      if (!from0 || !row) return
      const d = { x: dScreen.x / v.k, y: dScreen.y / v.k }
      let rect = resizeRect(from0, g.handle, d, row.type)
      const settings = store.get().project.settings
      const useSnap = settings.snap && !e.shiftKey
      const sn = snapResize(rect, g.handle, g.neighbours, v.k, { grid: useSnap, guides: useSnap })
      if (sn.dx || sn.dy) {
        // a snap moves the dragged EDGE; whichever edge it is, that is the same
        // as having dragged the pointer that much further, so re-run the resize
        // and let it re-apply the type's bounds and aspect lock
        rect = resizeRect(from0, g.handle, { x: d.x + sn.dx, y: d.y + sn.dy }, row.type)
      }
      writeRect(g.primary, rect)
      env.overlay.guides(sn.guides, sn.gaps)
      g.from.set('__resize__', rect)
      return
    }

    if (mode === 'marquee') {
      const a = screenToWorld(v, g.p0)
      const b = screenToWorld(v, p)
      const r: Rect = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }
      env.overlay.marquee(r)
      if (rafMarquee) return
      rafMarquee = requestAnimationFrame(() => {
        rafMarquee = 0
        const hit = blocksIntersecting(store.get(), r, store.renderable())
        const sane = sanitiseSelection(store.get(), hit)
        store.set((st) => { st.selection = sane.selection; st.primary = sane.primary })
        env.overlay.sync()
      })
    }
  }

  // ── pointerup ────────────────────────────────────────────────────────────

  const up = (e: PointerEvent) => {
    active.delete(e.pointerId)
    if (mode === 'pinching') {
      if (active.size < 2) {
        pinchState = null
        setMode('idle')
        env.onViewport(v)
        env.overlay.sync()
      }
      return
    }

    if (!g) { setMode('idle'); return }

    if (mode === 'panning') {
      env.onViewport(v)
      env.overlay.sync()
      g = null
      setMode('idle')
      return
    }

    if (mode === 'pressing' && g.primary) {
      const t = now()
      const isDouble = lastClick.id === g.primary && t - lastClick.at <= DOUBLE_MS
      lastClick = { id: g.primary, at: t }
      const row = store.get().blocks.get(g.primary)
      if (isDouble && row) {
        const spec = registry[row.type]
        if (spec.editableInPlace) env.onEdit(row.id)
        else if (spec.opens !== 'none') env.onOpen(row.id)
      }
      g = null
      setMode('idle')
      return
    }

    if (mode === 'dragging' && g.primary) {
      const primaryEl = env.refs.get(g.primary)
      const to = new Map<string, Rect>()
      // read back what the imperative writes landed on
      const d = readDelta(g)
      for (const [id, r] of g.from) {
        if (id === '__resize__') continue
        to.set(id, { ...r, x: snap8(r.x + d.x), y: snap8(r.y + d.y) })
      }
      const primaryRect = to.get(g.primary)
      const rep = primaryRect
        ? reparentFor(store.get(), g.primary, primaryRect, g.moveSet, store.liveBlocks(), store.depthOf)
        : { parent_id: null, grow: null }
      const cmd = MoveCommand({
        store,
        ids: [...to.keys()],
        to,
        reparent: { id: g.primary, parent_id: rep.parent_id },
        frameGrow: rep.grow,
      })
      env.stack.execute(store, cmd)
      env.onCommit(cmd)
      void primaryEl
      env.overlay.clearGuides()
      env.overlay.dropFrame(null)
      startDragStyles(false)
      env.links.redraw()
      env.onBusy(new Set())
      g = null
      setMode('idle')
      env.overlay.sync()
      return
    }

    if (mode === 'resizing' && g.primary) {
      const rect = g.from.get('__resize__')
      if (rect) {
        const cmd = ResizeCommand({ store, id: g.primary, to: rect })
        env.stack.execute(store, cmd)
        env.onCommit(cmd)
      }
      env.overlay.clearGuides()
      env.links.redraw()
      g = null
      setMode('idle')
      env.overlay.sync()
      return
    }

    if (mode === 'marquee') {
      env.overlay.marquee(null)
      g = null
      setMode('idle')
      env.overlay.sync()
      return
    }

    g = null
    setMode('idle')
  }

  /** How far the primary actually travelled, from the element's own transform. */
  const readDelta = (gesture: Gesture): Point => {
    if (!gesture.primary) return { x: 0, y: 0 }
    const el = env.refs.get(gesture.primary)
    const r0 = gesture.from.get(gesture.primary)
    if (!el || !r0) return { x: 0, y: 0 }
    const m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(el.style.transform)
    if (!m) return { x: 0, y: 0 }
    return { x: Number(m[1]) - r0.x, y: Number(m[2]) - r0.y }
  }

  const cancel = () => {
    if (g && (mode === 'dragging' || mode === 'resizing')) {
      restoreRects()
      env.overlay.clearGuides()
      env.overlay.dropFrame(null)
      startDragStyles(false)
      env.onBusy(new Set())
    }
    if (mode === 'marquee') env.overlay.marquee(null)
    active.clear()
    pinchState = null
    g = null
    setMode('idle')
    env.overlay.sync()
  }

  // ── wheel ────────────────────────────────────────────────────────────────

  const wheel = (e: WheelEvent) => {
    e.preventDefault()
    setViewport(applyWheel(v, e, stagePoint(e), env.vh()), false)
  }

  // ── editing ──────────────────────────────────────────────────────────────

  const enterEdit = (id: string) => {
    const row = store.get().blocks.get(id)
    if (!row || !registry[row.type].editableInPlace) return
    store.set((s) => { s.editing = id; s.selection = new Set([id]); s.primary = id })
    setMode('editing')
    env.overlay.sync()
  }

  const exitEdit = (commit: boolean) => {
    void commit                                   // the renderer commits on blur
    if (!store.get().editing) return
    store.set((s) => { s.editing = null })
    setMode('idle')
    env.overlay.sync()
  }

  // ── keys the machine owns (the rest live in keyboard.ts) ──────────────────

  const keydown = (e: KeyboardEvent) => {
    if (e.code === 'Space' && !spaceHeld) {
      const el = document.activeElement
      const typing = el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (typing) return
      spaceHeld = true
      const stage = env.stageEl()
      if (stage) stage.style.cursor = 'grab'
      e.preventDefault()
    }
  }

  const keyup = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      spaceHeld = false
      const stage = env.stageEl()
      if (stage) stage.style.cursor = ''
    }
  }

  const exitMode = () => {
    placingType = null
    linkFrom = null
    env.overlay.rubber(null, null)
    env.overlay.ghost(null)
    env.overlay.marquee(null)
    if (mode === 'editing') exitEdit(true)
    else setMode('idle')
  }

  return {
    down, move, up, cancel, wheel, keydown, keyup,
    enterLink() {
      linkFrom = null
      setMode('linking')
    },
    enterPlacing(type) {
      placingType = type
      setMode('placing')
    },
    exitMode,
    enterEdit,
    exitEdit,
    mode: () => mode,
    viewport: () => v,
    setViewport(next, persist = true) {
      v = next
      paintViewport()
      if (persist) {
        env.onViewport(v)
        env.overlay.sync()
      }
    },
    dispose() {
      if (rafViewport) cancelAnimationFrame(rafViewport)
      if (rafMarquee) cancelAnimationFrame(rafMarquee)
      active.clear()
    },
  }
}
