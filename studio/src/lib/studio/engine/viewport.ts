// studio/src/lib/studio/engine/viewport.ts — the affine viewport (5.2, D-002…
// D-005, D-009). screen = world·k + t. Pure maths only: the caller decides when
// to write a transform and when to tell the store.

import { clamp } from '@/lib/studio/geometry'
import { grid } from '@/lib/studio/canvas-tokens'
import { alpha, type Theme, type Tokens } from '@/lib/design-tokens'
import type { Point, Rect, Viewport } from '@/lib/studio/types'
import type { CSSProperties } from 'react'

export const K_MIN = 0.1
export const K_MAX = 3
export const FIT_PAD = 80
export const FIT_K_MAX = 1.25
export const ZOOM_STEP = 1.2
/** Below this the blocks render as chips (D-010). */
export const CHIP_K = 0.3
/** How far outside the viewport a block still mounts and still snaps (D-007, D-010). */
export const VIEW_MARGIN = 400

export const clampK = (k: number, max = K_MAX): number => clamp(k, K_MIN, max)

export function screenToWorld(v: Viewport, p: Point): Point {
  return { x: (p.x - v.tx) / v.k, y: (p.y - v.ty) / v.k }
}

export function worldToScreen(v: Viewport, p: Point): Point {
  return { x: p.x * v.k + v.tx, y: p.y * v.k + v.ty }
}

export function worldRectToScreen(v: Viewport, r: Rect): Rect {
  return { x: r.x * v.k + v.tx, y: r.y * v.k + v.ty, w: r.w * v.k, h: r.h * v.k }
}

/** Zoom so the world point under `pScreen` stays under it (D-003). */
export function zoomAt(v: Viewport, pScreen: Point, kNext: number): Viewport {
  const k = clampK(kNext)
  const r = k / v.k
  return { k, tx: pScreen.x - (pScreen.x - v.tx) * r, ty: pScreen.y - (pScreen.y - v.ty) * r }
}

/** Fit a world rect with 80 screen px of padding, centred, k clamped (D-004). */
export function fit(rect: Rect, vw: number, vh: number, kMax = FIT_K_MAX): Viewport {
  const w = Math.max(1, rect.w)
  const h = Math.max(1, rect.h)
  const k = clampK(Math.min((vw - 2 * FIT_PAD) / w, (vh - 2 * FIT_PAD) / h), kMax)
  return {
    k,
    tx: Math.round((vw - w * k) / 2 - rect.x * k),
    ty: Math.round((vh - h * k) / 2 - rect.y * k),
  }
}

export interface WheelLike {
  deltaX: number
  deltaY: number
  deltaMode: number
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
}

/** Normalise the three delta modes to pixels (D-005). */
export function wheelDelta(e: Pick<WheelLike, 'deltaX' | 'deltaY' | 'deltaMode'>, vh: number): Point {
  const f = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1
  return { x: e.deltaX * f, y: e.deltaY * f }
}

/**
 * One wheel event against a viewport (D-003, D-005). ctrl/meta zooms about the
 * cursor — a trackpad pinch arrives as a ctrlKey wheel. Shift with no lateral
 * delta pans sideways. Everything else pans.
 */
export function applyWheel(v: Viewport, e: WheelLike, cursor: Point, vh: number): Viewport {
  const d = wheelDelta(e, vh)
  if (e.ctrlKey || e.metaKey) return zoomAt(v, cursor, v.k * Math.exp(-d.y * 0.0025))
  if (e.shiftKey && d.x === 0) return { ...v, tx: v.tx - d.y }
  return { ...v, tx: v.tx - d.x, ty: v.ty - d.y }
}

/** Two-finger pinch: scale about the gesture's midpoint, then follow the midpoint. */
export function pinch(v0: Viewport, m0: Point, d0: number, m: Point, d: number): Viewport {
  const ratio = d0 > 0.001 ? d / d0 : 1
  const v = zoomAt(v0, m0, v0.k * ratio)
  return { k: v.k, tx: v.tx + (m.x - m0.x), ty: v.ty + (m.y - m0.y) }
}

/** Zoom a step about the centre of the stage. */
export function zoomStep(v: Viewport, factor: number, vw: number, vh: number): Viewport {
  return zoomAt(v, { x: vw / 2, y: vh / 2 }, v.k * factor)
}

/** Set k about the centre of the stage, keeping the world point there put. */
export function zoomToK(v: Viewport, k: number, vw: number, vh: number): Viewport {
  return zoomAt(v, { x: vw / 2, y: vh / 2 }, k)
}

/** The world a viewport shows, grown by `margin` for culling and snapping. */
export function visibleWorldRect(v: Viewport, vw: number, vh: number, margin = VIEW_MARGIN): Rect {
  const tl = screenToWorld(v, { x: 0, y: 0 })
  const br = screenToWorld(v, { x: vw, y: vh })
  return { x: tl.x - margin, y: tl.y - margin, w: br.x - tl.x + 2 * margin, h: br.y - tl.y + 2 * margin }
}

const mod = (n: number, m: number) => ((n % m) + m) % m

/**
 * The dot grid, drawn in SCREEN space on the stage element so the dots never
 * scale (D-009): the step is chosen by zoom, the pattern is offset by the
 * translation, and the whole thing fades out as k approaches 0.25.
 */
export function gridBackground(v: Viewport, theme: Theme, on: boolean, t: Tokens): CSSProperties {
  if (!on) return {}
  const step = grid.step(v.k)
  const size = step * v.k
  const a = grid.dotAlpha[theme] * grid.fade(v.k)
  if (a <= 0 || size < 2) return {}
  const r = grid.dotRadiusPx
  return {
    backgroundImage: `radial-gradient(circle, ${alpha(t.textPrimary, a)} ${r}px, transparent ${r + 0.5}px)`,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${mod(v.tx, size)}px ${mod(v.ty, size)}px`,
  }
}

/** The two style strings the imperative pan/zoom path writes every frame. */
export function worldTransform(v: Viewport): string {
  return `translate(${v.tx}px, ${v.ty}px) scale(${v.k})`
}

export function gridPosition(v: Viewport): { size: string; position: string } {
  const size = grid.step(v.k) * v.k
  return { size: `${size}px ${size}px`, position: `${mod(v.tx, size)}px ${mod(v.ty, size)}px` }
}

export function sameViewport(a: Viewport, b: Viewport): boolean {
  return Math.abs(a.tx - b.tx) < 0.01 && Math.abs(a.ty - b.ty) < 0.01 && Math.abs(a.k - b.k) < 0.0001
}
