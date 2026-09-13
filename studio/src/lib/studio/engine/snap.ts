// studio/src/lib/studio/engine/snap.ts — grid snapping, smart guides and equal
// gaps (5.5, D-006, D-007). Pure. The threshold is 6 SCREEN px, so it becomes
// 6/k world px: snapping feels the same at every zoom.

import { geometry } from '@/lib/studio/canvas-tokens'
import { intersects, rectOf, snap8, U } from '@/lib/studio/geometry'
import { registry } from '@/lib/studio/registry'
import type { AnyBlock, Handle, Point, Rect } from '@/lib/studio/types'

export const SNAP_SCREEN = 6
/** D-007: at most this many neighbours feed one gesture. */
export const NEIGHBOUR_CAP = 200

export interface Guide {
  axis: 'x' | 'y'
  /** World coordinate of the line. */
  value: number
  /** The span to draw, along the other axis. */
  from: number
  to: number
}

export interface GapLabel {
  axis: 'x' | 'y'
  at: Point
  value: number
  equal: boolean
}

export interface SnapResult {
  dx: number
  dy: number
  guides: Guide[]
  gaps: GapLabel[]
}

export interface SnapOpts {
  grid: boolean
  guides: boolean
}

const EMPTY: SnapResult = { dx: 0, dy: 0, guides: [], gaps: [] }

/**
 * The rects a gesture snaps against (D-007): live, visible, unstacked blocks in
 * view, minus the move set, nearest first and capped. A frame also offers its
 * inner edges, so a block lands on a frame's padding rather than its border.
 */
export function collectNeighbours(all: AnyBlock[], moveSet: Set<string>, view: Rect): Rect[] {
  const pad = geometry.frameInnerPad
  const scored: Array<{ r: Rect; d: number }> = []
  const cx = view.x + view.w / 2
  const cy = view.y + view.h / 2
  for (const b of all) {
    if (moveSet.has(b.id)) continue
    if (b.deleted_at || b.hidden || b.stacked_in) continue
    const r = rectOf(b)
    if (!intersects(r, view)) continue
    const d = Math.hypot(r.x + r.w / 2 - cx, r.y + r.h / 2 - cy)
    scored.push({ r, d })
    if (b.type === 'frame' && !b.collapsed && r.w > 2 * pad && r.h > 2 * pad) {
      scored.push({ r: { x: r.x + pad, y: r.y + pad, w: r.w - 2 * pad, h: r.h - 2 * pad }, d })
    }
  }
  scored.sort((a, b) => a.d - b.d)
  return scored.slice(0, NEIGHBOUR_CAP).map((s) => s.r)
}

interface Candidate {
  /** How far the rect must move for the edge to meet the target. */
  delta: number
  /** The world coordinate both sides share once snapped. */
  value: number
  /** A guide beats the grid at equal distance (D-006). */
  guide: boolean
  /** Neighbour rect the guide came from, for drawing the span. */
  source: Rect | null
}

/** Best candidate on one axis: inside the tolerance, guides before grid, then nearest. */
function best(cands: Candidate[], tol: number): Candidate | null {
  let out: Candidate | null = null
  for (const c of cands) {
    const d = Math.abs(c.delta)
    if (d > tol) continue
    if (!out) { out = c; continue }
    if (c.guide !== out.guide) { if (c.guide) out = c; continue }
    if (d < Math.abs(out.delta)) out = c
  }
  return out
}

/** The three snapping edges of a rect on each axis: the two sides and the centre. */
function edgesX(r: Rect): number[] { return [r.x, r.x + r.w / 2, r.x + r.w] }
function edgesY(r: Rect): number[] { return [r.y, r.y + r.h / 2, r.y + r.h] }

function candidatesFor(
  movingEdges: number[],
  neighbours: Rect[],
  edgesOf: (r: Rect) => number[],
  opts: SnapOpts,
  centres: boolean,
): Candidate[] {
  const out: Candidate[] = []
  if (opts.guides) {
    for (const n of neighbours) {
      const targets = edgesOf(n)
      for (let ti = 0; ti < targets.length; ti++) {
        if (!centres && ti === 1) continue
        for (const e of movingEdges) {
          out.push({ delta: targets[ti] - e, value: targets[ti], guide: true, source: n })
        }
      }
    }
  }
  if (opts.grid) {
    for (const e of movingEdges) {
      const t = snap8(e)
      out.push({ delta: t - e, value: t, guide: false, source: null })
    }
  }
  return out
}

/** Every neighbour sharing a snapped line, so the guide spans the whole alignment. */
function guideFor(axis: 'x' | 'y', c: Candidate, moving: Rect, neighbours: Rect[], tol: number): Guide {
  const alongMin = axis === 'x' ? moving.y : moving.x
  const alongMax = axis === 'x' ? moving.y + moving.h : moving.x + moving.w
  let from = alongMin
  let to = alongMax
  const edgesOf = axis === 'x' ? edgesX : edgesY
  for (const n of neighbours) {
    if (!edgesOf(n).some((e) => Math.abs(e - c.value) <= Math.max(tol, 0.5))) continue
    const a = axis === 'x' ? n.y : n.x
    const b = axis === 'x' ? n.y + n.h : n.x + n.w
    if (a < from) from = a
    if (b > to) to = b
  }
  return { axis, value: c.value, from, to }
}

/**
 * Equal-spacing snap on one axis: if the moving rect's gap to its nearest
 * neighbour can be made equal to that neighbour's gap to its own, snap to it and
 * label both gaps. This is what makes a hand-placed row come out even.
 */
function equalGap(
  moving: Rect,
  neighbours: Rect[],
  axis: 'x' | 'y',
  tol: number,
): { delta: number; gaps: GapLabel[] } | null {
  const lo = (r: Rect) => (axis === 'x' ? r.x : r.y)
  const hi = (r: Rect) => (axis === 'x' ? r.x + r.w : r.y + r.h)
  const crossLo = (r: Rect) => (axis === 'x' ? r.y : r.x)
  const crossHi = (r: Rect) => (axis === 'x' ? r.y + r.h : r.x + r.w)
  const overlaps = (r: Rect) => crossLo(r) < crossHi(moving) && crossLo(moving) < crossHi(r)

  const band = neighbours.filter(overlaps)
  const mid = (r: Rect) => (lo(r) + hi(r)) / 2

  for (const side of [-1, 1] as const) {
    // the nearest neighbour on this side of the moving rect
    const near = band
      .filter((n) => (side < 0 ? hi(n) <= lo(moving) + tol : lo(n) >= hi(moving) - tol))
      .sort((a, b) => (side < 0 ? mid(b) - mid(a) : mid(a) - mid(b)))[0]
    if (!near) continue
    const gap = side < 0 ? lo(moving) - hi(near) : lo(near) - hi(moving)
    // that neighbour's own gap, further out on the same side
    const next = band
      .filter((n) => n !== near && (side < 0 ? hi(n) <= lo(near) + tol : lo(n) >= hi(near) - tol))
      .sort((a, b) => (side < 0 ? mid(b) - mid(a) : mid(a) - mid(b)))[0]
    if (!next) continue
    const other = side < 0 ? lo(near) - hi(next) : lo(next) - hi(near)
    if (other <= 0) continue
    if (Math.abs(gap - other) > tol) continue

    const delta = side < 0 ? other - gap : gap - other
    const at = (a: number, b: number): Point => {
      const along = (a + b) / 2
      const cross = (Math.max(crossLo(moving), crossLo(near)) + Math.min(crossHi(moving), crossHi(near))) / 2
      return axis === 'x' ? { x: along, y: cross } : { x: cross, y: along }
    }
    const movedLo = lo(moving) + delta
    const movedHi = hi(moving) + delta
    const gaps: GapLabel[] = [
      {
        axis,
        at: side < 0 ? at(hi(near), movedLo) : at(movedHi, lo(near)),
        value: Math.round(other),
        equal: true,
      },
      {
        axis,
        at: side < 0 ? at(hi(next), lo(near)) : at(hi(near), lo(next)),
        value: Math.round(other),
        equal: true,
      },
    ]
    return { delta, gaps }
  }
  return null
}

/**
 * Snap a moving rect (D-006). x and y are independent. Returns the extra delta
 * to add to the raw drag, plus what to draw.
 */
export function snapMove(moving: Rect, neighbours: Rect[], k: number, opts: SnapOpts): SnapResult {
  if (!opts.grid && !opts.guides) return EMPTY
  const tol = SNAP_SCREEN / Math.max(k, 0.001)

  const eq = opts.guides
    ? { x: equalGap(moving, neighbours, 'x', tol), y: equalGap(moving, neighbours, 'y', tol) }
    : { x: null, y: null }

  const guides: Guide[] = []
  const gaps: GapLabel[] = []

  let dx: number
  if (eq.x) {
    dx = eq.x.delta
    gaps.push(...eq.x.gaps)
  } else {
    const cx = best(candidatesFor(edgesX(moving), neighbours, edgesX, opts, true), tol)
    dx = cx?.delta ?? 0
    if (cx?.guide) guides.push(guideFor('x', cx, moving, neighbours, tol))
  }

  let dy: number
  if (eq.y) {
    dy = eq.y.delta
    gaps.push(...eq.y.gaps)
  } else {
    const cy = best(candidatesFor(edgesY(moving), neighbours, edgesY, opts, true), tol)
    dy = cy?.delta ?? 0
    if (cy?.guide) guides.push(guideFor('y', cy, moving, neighbours, tol))
  }

  return { dx, dy, guides, gaps }
}

const TOUCHES_W = (h: Handle) => h === 'w' || h === 'nw' || h === 'sw'
const TOUCHES_E = (h: Handle) => h === 'e' || h === 'ne' || h === 'se'
const TOUCHES_N = (h: Handle) => h === 'n' || h === 'ne' || h === 'nw'
const TOUCHES_S = (h: Handle) => h === 's' || h === 'se' || h === 'sw'

/**
 * Snap only the edge(s) being dragged, and never to a centre line (D-007):
 * resizing to a neighbour's midline is a coincidence, not an intention.
 */
export function snapResize(rect: Rect, handle: Handle, neighbours: Rect[], k: number, opts: SnapOpts): SnapResult {
  if (!opts.grid && !opts.guides) return EMPTY
  const tol = SNAP_SCREEN / Math.max(k, 0.001)
  const guides: Guide[] = []

  const edgesMovingX: number[] = []
  if (TOUCHES_W(handle)) edgesMovingX.push(rect.x)
  if (TOUCHES_E(handle)) edgesMovingX.push(rect.x + rect.w)
  const edgesMovingY: number[] = []
  if (TOUCHES_N(handle)) edgesMovingY.push(rect.y)
  if (TOUCHES_S(handle)) edgesMovingY.push(rect.y + rect.h)

  const cx = edgesMovingX.length ? best(candidatesFor(edgesMovingX, neighbours, edgesX, opts, false), tol) : null
  const cy = edgesMovingY.length ? best(candidatesFor(edgesMovingY, neighbours, edgesY, opts, false), tol) : null
  if (cx?.guide) guides.push(guideFor('x', cx, rect, neighbours, tol))
  if (cy?.guide) guides.push(guideFor('y', cy, rect, neighbours, tol))

  return { dx: cx?.delta ?? 0, dy: cy?.delta ?? 0, guides, gaps: [] }
}

/** Distance labels to the nearest neighbour on each side, shown while X is on. */
export function gapLabels(moving: Rect, neighbours: Rect[]): GapLabel[] {
  const out: GapLabel[] = []
  for (const axis of ['x', 'y'] as const) {
    const lo = (r: Rect) => (axis === 'x' ? r.x : r.y)
    const hi = (r: Rect) => (axis === 'x' ? r.x + r.w : r.y + r.h)
    const crossLo = (r: Rect) => (axis === 'x' ? r.y : r.x)
    const crossHi = (r: Rect) => (axis === 'x' ? r.y + r.h : r.x + r.w)
    const band = neighbours.filter((n) => crossLo(n) < crossHi(moving) && crossLo(moving) < crossHi(n))
    for (const side of [-1, 1] as const) {
      const near = band
        .filter((n) => (side < 0 ? hi(n) <= lo(moving) : lo(n) >= hi(moving)))
        .sort((a, b) => (side < 0 ? hi(b) - hi(a) : lo(a) - lo(b)))[0]
      if (!near) continue
      const value = Math.round(side < 0 ? lo(moving) - hi(near) : lo(near) - hi(moving))
      if (value <= 0) continue
      const along = side < 0 ? (hi(near) + lo(moving)) / 2 : (hi(moving) + lo(near)) / 2
      const cross = (Math.max(crossLo(moving), crossLo(near)) + Math.min(crossHi(moving), crossHi(near))) / 2
      out.push({ axis, at: axis === 'x' ? { x: along, y: cross } : { x: cross, y: along }, value, equal: false })
    }
  }
  return out
}

/**
 * A resize in world px, clamped to the type's bounds, on the 8 px grid, with the
 * aspect locked where the registry says so (D-012, D-014). Auto-height types
 * ignore vertical handles: their height is the content's.
 */
export function resizeRect(rect0: Rect, handle: Handle, d: Point, type: AnyBlock['type']): Rect {
  const spec = registry[type]
  const vertical = !spec.autoHeight

  let x = rect0.x
  let y = rect0.y
  let w = rect0.w
  let h = rect0.h

  if (TOUCHES_W(handle)) { w = rect0.w - d.x; x = rect0.x + d.x }
  if (TOUCHES_E(handle)) { w = rect0.w + d.x }
  if (vertical) {
    if (TOUCHES_N(handle)) { h = rect0.h - d.y; y = rect0.y + d.y }
    if (TOUCHES_S(handle)) { h = rect0.h + d.y }
  }

  w = Math.round(Math.min(spec.maxW, Math.max(spec.minW, w)) / U) * U
  if (vertical) h = Math.round(Math.min(spec.maxH, Math.max(spec.minH, h)) / U) * U

  if (spec.aspectLocked && rect0.w > 0) {
    // width leads; the caption keeps whatever the measured height adds
    h = Math.round((w * rect0.h) / rect0.w / U) * U
  }

  // The edge that was NOT dragged stays exactly where it was. Position is never
  // re-snapped here: w and h are already on the grid, and snapping x as well
  // would shove the anchored edge off whatever it was aligned to.
  x = TOUCHES_W(handle) ? rect0.x + rect0.w - w : rect0.x
  if (vertical) y = TOUCHES_N(handle) ? rect0.y + rect0.h - h : rect0.y

  return { x, y, w, h }
}
