'use client'

// src/components/studio/surface/surface.tsx — the bounded canvas.
//
// Level 3 (the shelf) and level 2 (the board) both stand on this. It is a
// window onto a world with edges: you drag the ground to move, roll to move,
// pinch or ⌘-roll to zoom, and the world can never be thrown so far that you
// cannot find it again (lib/studio/surface.ts holds that arithmetic).
//
// The window fades at all four edges. That is not decoration: it is the thing
// that says there is more over there, go and look.

import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject,
} from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { fonts, shell } from '@/lib/design-tokens'
import {
  ZOOM, clampPan, clampZoom, centreOn, toWorld, zoomAbout,
  type Frame, type Point, type World,
} from '@/lib/studio/surface'

const EASE = (x: number) => 1 - Math.pow(1 - x, 3)
const GLIDE_MS = 380

/** Measures the window the canvas is looking through. */
export function useFrame(ref: RefObject<HTMLDivElement | null>): Frame {
  const [frame, setFrame] = useState<Frame>({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setFrame({ w: el.clientWidth, h: el.clientHeight })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return frame
}

export interface Canvas {
  pan: Point
  zoom: number
  frame: Frame
  world: World
  /** True while the ground is being dragged, so cards can drop their hover. */
  dragging: boolean
  setZoom: (k: number, anchor?: Point) => void
  glideTo: (target: Point, k?: number) => void
  jumpTo: (target: Point, k?: number) => void
  /** Glides back to exactly the view this project opens to — the same pan
   *  the very first frame settles on, not a point on the canvas centred by
   *  eye. Centring on a point can still end up pinned off to one side once
   *  clampPan holds it inside the world's edges; this can't drift from the
   *  real thing, because it's computed the same way, once, in both places. */
  resetView: () => void
}

/**
 * Pan and zoom for one surface. The element itself owns the gestures so that
 * anything inside marked `data-hold` (a card being dragged, a field being
 * typed into) keeps them for itself.
 */
export function useCanvas(
  ref: RefObject<HTMLDivElement | null>,
  frame: Frame,
  world: World,
  opts: { initialCentre?: Point | null; minZoom?: number; home?: Point } = {},
): Canvas {
  const [pan, setPanRaw] = useState<Point>({ x: 0, y: 0 })
  const [zoom, setZoomRaw] = useState(1)
  const [dragging, setDragging] = useState(false)
  const live = useRef({ pan, zoom, frame, world })
  live.current = { pan, zoom, frame, world }
  // Some surfaces (the Project Board) must not zoom out past 100%, or the
  // screenful they promise — so many columns by so many rows — stops being true.
  const floor = useRef(opts.minZoom ?? ZOOM.min)
  floor.current = opts.minZoom ?? ZOOM.min
  const clampK = useCallback((k: number) => Math.max(floor.current, clampZoom(k)), [])
  const home = useRef<Point>(opts.home ?? { x: 0, y: 0 })
  home.current = opts.home ?? { x: 0, y: 0 }
  const glide = useRef<number | null>(null)
  const placed = useRef(false)

  const stopGlide = useCallback(() => {
    if (glide.current !== null) cancelAnimationFrame(glide.current)
    glide.current = null
  }, [])

  const settle = useCallback((next: Point, k = live.current.zoom) => {
    const { frame: f, world: w } = live.current
    if (f.w === 0) { setPanRaw(next); return }
    setPanRaw(clampPan(next, k, w, f))
  }, [])

  const setZoom = useCallback((k: number, anchor?: Point) => {
    stopGlide()
    const { pan: p, zoom: z, frame: f, world: w } = live.current
    const next = clampK(k)
    const at = anchor ?? { x: f.w / 2, y: f.h / 2 }
    setZoomRaw(next)
    setPanRaw(clampPan(zoomAbout(at, p, z, next), next, w, f))
  }, [stopGlide, clampK])

  const jumpTo = useCallback((target: Point, k?: number) => {
    stopGlide()
    const { zoom: z, frame: f, world: w } = live.current
    const nextK = k === undefined ? z : clampK(k)
    setZoomRaw(nextK)
    setPanRaw(clampPan(centreOn(target, nextK, f), nextK, w, f))
  }, [stopGlide, clampK])

  /** Eases pan and zoom toward an already-computed destination — shared by
   *  glideTo (which works out that destination by centring a point) and
   *  resetView (which works it out the same way the very first frame does). */
  const animateTo = useCallback((toPan: Point, toK: number) => {
    const { pan: from, zoom: fromK } = live.current
    const started = performance.now()
    const step = (now: number) => {
      const p = Math.min(1, (now - started) / GLIDE_MS)
      const e = EASE(p)
      setZoomRaw(fromK + (toK - fromK) * e)
      setPanRaw({ x: from.x + (toPan.x - from.x) * e, y: from.y + (toPan.y - from.y) * e })
      if (p < 1) glide.current = requestAnimationFrame(step)
      else glide.current = null
    }
    glide.current = requestAnimationFrame(step)
  }, [])

  const glideTo = useCallback((target: Point, k?: number) => {
    stopGlide()
    const { zoom: z, frame: f, world: w } = live.current
    if (f.w === 0) { jumpTo(target, k); return }
    const nextK = k === undefined ? z : clampK(k)
    animateTo(clampPan(centreOn(target, nextK, f), nextK, w, f), nextK)
  }, [animateTo, jumpTo, stopGlide, clampK])

  const resetView = useCallback(() => {
    stopGlide()
    const { frame: f, world: w } = live.current
    if (f.w === 0) { setZoomRaw(1); setPanRaw(home.current); return }
    animateTo(clampPan(home.current, 1, w, f), 1)
  }, [animateTo, stopGlide])

  useEffect(() => stopGlide, [stopGlide])

  // First honest measurement decides where we are standing.
  useEffect(() => {
    if (placed.current || frame.w === 0) return
    placed.current = true
    if (opts.initialCentre) jumpTo(opts.initialCentre)
    else setPanRaw(clampPan(home.current, 1, world, frame))
  }, [frame, world, jumpTo, opts.initialCentre])

  // A resize, or a world that grew, must not strand the view outside the edges.
  useEffect(() => {
    if (frame.w === 0) return
    setPanRaw((p) => clampPan(p, live.current.zoom, world, frame))
  }, [frame, world])

  // Wheel has to be non-passive to stop the page scrolling under us.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      stopGlide()
      const { pan: p, zoom: z } = live.current
      if (e.ctrlKey || e.metaKey) {
        const box = el.getBoundingClientRect()
        const anchor = { x: e.clientX - box.left, y: e.clientY - box.top }
        setZoom(z * (1 - e.deltaY * 0.0035), anchor)
        return
      }
      settle({ x: p.x - e.deltaX, y: p.y - e.deltaY })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref, setZoom, settle, stopGlide])

  // Dragging the ground.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let from: { x: number; y: number; pan: Point } | null = null

    const down = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-hold]')) return
      stopGlide()
      from = { x: e.clientX, y: e.clientY, pan: live.current.pan }
      el.setPointerCapture(e.pointerId)
      setDragging(true)
    }
    const move = (e: PointerEvent) => {
      if (!from) return
      settle({ x: from.pan.x + (e.clientX - from.x), y: from.pan.y + (e.clientY - from.y) })
    }
    const up = (e: PointerEvent) => {
      if (!from) return
      from = null
      setDragging(false)
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
  }, [ref, settle, stopGlide])

  return useMemo(
    () => ({ pan, zoom, frame, world, dragging, setZoom, glideTo, jumpTo, resetView }),
    [pan, zoom, frame, world, dragging, setZoom, glideTo, jumpTo, resetView],
  )
}

/**
 * The window. `children` are laid out in world coordinates — absolutely
 * positioned at their own x/y — and this moves the whole plane under them.
 */
export function Surface({
  canvas,
  innerRef,
  children,
  /** Drawn in screen space, over the world, unfaded: zoom pills, headers. */
  chrome,
  ariaLabel,
}: {
  canvas: Canvas
  /** The same ref given to useFrame and useCanvas — this is what they listen on. */
  innerRef: RefObject<HTMLDivElement | null>
  children: ReactNode
  chrome?: ReactNode
  ariaLabel: string
}) {
  const { theme } = useTheme()
  const dot = theme === 'dark' ? 'rgba(236,233,226,0.10)' : 'rgba(236,233,226,0.14)'
  const step = 28 * canvas.zoom

  return (
    <>
      <div
        ref={innerRef}
        aria-label={ariaLabel}
        style={{
          position: 'absolute', inset: 0, overflow: 'hidden',
          touchAction: 'none',
          cursor: canvas.dragging ? 'grabbing' : 'grab',
          backgroundImage: `radial-gradient(circle, ${dot} 1px, transparent 1px)`,
          backgroundSize: `${step}px ${step}px`,
          backgroundPosition: `${canvas.pan.x}px ${canvas.pan.y}px`,
        }}
      >
        <div style={fadeStyle(canvas.frame)}>
          <div
            style={{
              position: 'absolute', top: 0, left: 0,
              width: canvas.world.w, height: canvas.world.h,
              transform: `translate3d(${canvas.pan.x}px, ${canvas.pan.y}px, 0) scale(${canvas.zoom})`,
              transformOrigin: '0 0',
            }}
          >
            {children}
          </div>
        </div>
      </div>
      {chrome}
    </>
  )
}

/** Both axes at once, so the corners fade too. Narrower windows get a
 *  narrower fade — on a phone an 80px veil each side eats the work. */
function fadeStyle(frame: Frame): React.CSSProperties {
  const x = Math.max(16, Math.min(80, Math.round(frame.w * 0.06)))
  const top = Math.max(12, Math.min(52, Math.round(frame.h * 0.06)))
  const bottom = Math.max(16, Math.min(64, Math.round(frame.h * 0.07)))
  const mask =
    `linear-gradient(to right, transparent 0, #000 ${x}px, #000 calc(100% - ${x}px), transparent 100%),`
    + `linear-gradient(to bottom, transparent 0, #000 ${top}px, #000 calc(100% - ${bottom}px), transparent 100%)`
  return {
    position: 'absolute', inset: 0,
    maskImage: mask, maskComposite: 'intersect',
    WebkitMaskImage: mask, WebkitMaskComposite: 'source-in',
  }
}

/** − ⌾ + in the corner. The only chrome the canvas needs. */
export function ZoomPill({
  canvas, onHome, after,
}: {
  canvas: Canvas
  onHome?: () => void
  /** Extra tools sharing this same glass pill, after a thin divider — e.g.
   *  the board's "rearrange everything" button. */
  after?: ReactNode
}) {
  const at = Math.round(canvas.zoom * 100)
  return (
    <div
      data-hold
      style={{
        position: 'absolute', left: 16, bottom: 16, zIndex: 6,
        display: 'flex', alignItems: 'center', gap: 4,
        padding: 5, borderRadius: 999,
        background: 'rgba(13,12,11,0.74)', backdropFilter: 'blur(18px) saturate(1.1)',
        border: `1px solid ${shell.line}`,
      }}
    >
      <PillButton label="further out" onClick={() => canvas.setZoom(canvas.zoom - ZOOM.step)}>
        <line x1="6" y1="12" x2="18" y2="12" />
      </PillButton>
      <span aria-label={`${at}%`} title={`${at}%`} style={{ ...PILL_TEXT, padding: '0 8px', minWidth: 44, textAlign: 'center' }}>
        {at}%
      </span>
      <PillButton label="closer in" onClick={() => canvas.setZoom(canvas.zoom + ZOOM.step)}>
        <line x1="6" y1="12" x2="18" y2="12" />
        <line x1="12" y1="6" x2="12" y2="18" />
      </PillButton>
      {onHome && (
        <PillButton label="fit to screen — back to 100%" onClick={onHome}>
          <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
        </PillButton>
      )}
      {after && (
        <>
          <div aria-hidden style={{ width: 1, alignSelf: 'stretch', margin: '3px 2px', background: shell.line }} />
          {after}
        </>
      )}
    </div>
  )
}

const PILL_TEXT: React.CSSProperties = {
  fontFamily: fonts.ui,
  fontSize: 10, lineHeight: 1.2, color: shell.muted, fontVariantNumeric: 'tabular-nums',
}

function PillButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 30, height: 30, borderRadius: 999, padding: 0, border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', color: shell.muted, cursor: 'pointer',
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        {children}
      </svg>
    </button>
  )
}

export { toWorld }
