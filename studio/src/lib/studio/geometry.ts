// studio/src/lib/studio/geometry.ts — rectangle and point maths for the canvas
// (5.1). Pure: no React, no DOM, no clock. Every number is world px unless the
// caller says otherwise, and the grid unit is 8 (D-001).

import type { AnyBlock, Point, Rect } from '@/lib/studio/types'

export const U = 8

export const snap8 = (n: number): number => Math.round(n / U) * U
export const ceil8 = (n: number): number => Math.ceil(n / U) * U
export const floor8 = (n: number): number => Math.floor(n / U) * U

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))

export function rectOf(b: Pick<AnyBlock, 'x' | 'y' | 'w' | 'h'>): Rect {
  return { x: b.x, y: b.y, w: b.w, h: b.h }
}

export function union(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const r of rects) {
    if (r.x < x0) x0 = r.x
    if (r.y < y0) y0 = r.y
    if (r.x + r.w > x1) x1 = r.x + r.w
    if (r.y + r.h > y1) y1 = r.y + r.h
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** Overlap of area, not of a shared edge: touching rects do not intersect. */
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function contains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  )
}

export function containsPoint(r: Rect, p: Point): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h
}

/** Shrink by d on every side. A rect smaller than 2d collapses to its centre. */
export function inset(r: Rect, d: number): Rect {
  const w = Math.max(0, r.w - 2 * d)
  const h = Math.max(0, r.h - 2 * d)
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h }
}

export function grow(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d }
}

export function centre(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 }
}

/** North, east, south, west — in that order. */
export function edgeMidpoints(r: Rect): Point[] {
  return [
    { x: r.x + r.w / 2, y: r.y },
    { x: r.x + r.w, y: r.y + r.h / 2 },
    { x: r.x + r.w / 2, y: r.y + r.h },
    { x: r.x, y: r.y + r.h / 2 },
  ]
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** The closest pair of edge midpoints between two rects — where a link attaches (D-023). */
export function nearestEdgePair(a: Rect, b: Rect): [Point, Point] {
  const as = edgeMidpoints(a)
  const bs = edgeMidpoints(b)
  let best: [Point, Point] = [as[0], bs[0]]
  let bestD = Infinity
  for (const p of as) {
    for (const q of bs) {
      const d = dist(p, q)
      if (d < bestD) {
        bestD = d
        best = [p, q]
      }
    }
  }
  return best
}

/** Move a point d along the line towards `towards`, so a link stops short of the edge (D-023). */
export function pullBack(from: Point, towards: Point, d: number): Point {
  const len = dist(from, towards)
  if (len <= 0.001) return from
  const r = Math.min(1, d / len)
  return { x: from.x + (towards.x - from.x) * r, y: from.y + (towards.y - from.y) * r }
}
