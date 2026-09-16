// studio/src/lib/studio/surface.ts — the maths behind the two canvases.
//
// Level 3 (the shelf) and level 2 (the project board) are both bounded
// canvases: you pan and zoom, but the world has edges, and you can never
// throw the work so far off-screen that you cannot find it again. None of
// this touches React, so all of it is testable on its own.
//
// One convention throughout: screen = world · k + pan.

export interface World { w: number; h: number }
export interface Point { x: number; y: number }
export interface Frame { w: number; h: number }

export const ZOOM = { min: 0.4, max: 1.5, step: 0.12 } as const

export function clampZoom(k: number): number {
  return Math.min(ZOOM.max, Math.max(ZOOM.min, k))
}

/** Slack around the world, so the edges of the work are not flush with glass. */
export const MARGIN = 80

/**
 * Keeps the world reachable. When the world is smaller than the window on an
 * axis it is centred on that axis — a shelf with two projects on it should sit
 * in the middle of the screen, not pinned to a corner — and otherwise the pan
 * is held inside the world's bounds plus a margin of slack.
 */
export function clampPan(pan: Point, k: number, world: World, frame: Frame, margin = MARGIN): Point {
  const axis = (p: number, worldLen: number, frameLen: number): number => {
    const len = worldLen * k
    if (len + margin * 2 <= frameLen) return Math.round((frameLen - len) / 2)
    return Math.min(margin, Math.max(frameLen - len - margin, p))
  }
  return { x: axis(pan.x, world.w, frame.w), y: axis(pan.y, world.h, frame.h) }
}

/** Screen point → world point. */
export function toWorld(screen: Point, pan: Point, k: number): Point {
  return { x: (screen.x - pan.x) / k, y: (screen.y - pan.y) / k }
}

/** World point → screen point. */
export function toScreen(world: Point, pan: Point, k: number): Point {
  return { x: world.x * k + pan.x, y: world.y * k + pan.y }
}

/** Zoom about a fixed screen point, so the thing under the cursor stays put. */
export function zoomAbout(anchor: Point, pan: Point, k: number, nextK: number): Point {
  const w = toWorld(anchor, pan, k)
  return { x: anchor.x - w.x * nextK, y: anchor.y - w.y * nextK }
}

/** The pan that puts a world point in the middle of the window. */
export function centreOn(target: Point, k: number, frame: Frame): Point {
  return { x: frame.w / 2 - target.x * k, y: frame.h / 2 - target.y * k }
}

// ── the desk (level 3) ──────────────────────────────────────────────────────

export interface SlotSpec {
  cardW: number
  cardH: number
  gap: number
  cols: number
  originX?: number
  originY?: number
}

/**
 * Where a project that has never been moved by hand belongs: an aligned grid,
 * left to right, wrapping. New work always arrives straight; the mess is
 * something the person makes, never something they are handed.
 */
export function deskSlot(index: number, spec: SlotSpec): Point {
  const { cardW, cardH, gap, cols, originX = MARGIN, originY = MARGIN } = spec
  const col = index % Math.max(1, cols)
  const row = Math.floor(index / Math.max(1, cols))
  return { x: originX + col * (cardW + gap), y: originY + row * (cardH + gap) }
}

/** Do two cards of this size, at these points, overlap at all? */
export function overlaps(a: Point, b: Point, cardW: number, cardH: number, gap = 0): boolean {
  return Math.abs(a.x - b.x) < cardW + gap && Math.abs(a.y - b.y) < cardH + gap
}

/**
 * The nearest free spot to where something wants to land. Walks the aligned
 * grid outwards so a project dropped onto an occupied slot slides to the next
 * one rather than hiding underneath.
 */
export function freeSlot(wanted: Point, taken: Point[], spec: SlotSpec, world: World): Point {
  const { cardW, cardH, gap } = spec
  const clear = (p: Point) => !taken.some((o) => overlaps(p, o, cardW, cardH, 4))
  const inside = (p: Point) => p.x >= 0 && p.y >= 0 && p.x + cardW <= world.w && p.y + cardH <= world.h
  if (clear(wanted) && inside(wanted)) return wanted

  const stepX = cardW + gap
  const stepY = cardH + gap
  for (let ring = 1; ring <= 24; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
        const p = { x: wanted.x + dx * stepX, y: wanted.y + dy * stepY }
        if (inside(p) && clear(p)) return p
      }
    }
  }
  return wanted
}

/** Keeps a card wholly inside the world, wherever the hand let go of it. */
export function clampToWorld(p: Point, cardW: number, cardH: number, world: World): Point {
  return {
    x: Math.round(Math.min(Math.max(0, p.x), Math.max(0, world.w - cardW))),
    y: Math.round(Math.min(Math.max(0, p.y), Math.max(0, world.h - cardH))),
  }
}

/** FNV-1a. Small, stable, and the same in every browser. */
export function hashOf(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

/**
 * The angle a hand-placed project rests at. Derived from its id so it never
 * changes between visits, and small enough to read as "someone put this down"
 * rather than as a broken layout.
 */
export function tiltOf(id: string, degrees = 1.1): number {
  const n = hashOf(id) % 2000
  return Number((((n / 1000) - 1) * degrees).toFixed(2))
}

// ── the board (level 2) ─────────────────────────────────────────────────────

/**
 * How wide a piece card should be so one whole card and three quarters of the
 * next one are on screen at once. The three quarters are the invitation: the
 * next piece is always visibly there, unfinished business at the edge of sight.
 */
export function laneCardWidth(frameW: number, gap: number, min = 320, max = 760): number {
  const raw = (frameW - gap * 1.75 - MARGIN) / 1.75
  return Math.round(Math.min(max, Math.max(min, raw)))
}

/** The world a lane of n cards needs, with room to breathe at both ends. */
export function laneWorld(count: number, cardW: number, cardH: number, gap: number, frame: Frame): World {
  const lane = Math.max(1, count) * cardW + Math.max(0, count) * gap
  return {
    w: Math.max(frame.w, lane + MARGIN * 2),
    h: Math.max(frame.h, cardH + MARGIN * 2),
  }
}

/** Where the nth card in the lane starts. */
export function laneSlot(index: number, cardW: number, gap: number, originX = MARGIN): number {
  return originX + index * (cardW + gap)
}

/** The card the lane is resting on, given where it has been panned to. */
export function laneIndexAt(pan: Point, k: number, frame: Frame, cardW: number, gap: number, originX = MARGIN): number {
  const centre = toWorld({ x: frame.w / 2, y: 0 }, pan, k).x
  return Math.max(0, Math.round((centre - originX - cardW / 2) / (cardW + gap)))
}

/**
 * Lays a row of same-size blocks out at their preferred centres, preserving
 * relative order and enforcing a minimum spacing between them. Used to place
 * the board's thread hubs near the pieces they connect to without stacking
 * two hubs on top of each other.
 *
 * A short, stable substitute for a real force layout: sorts by preferred
 * position, then sweeps left to right pushing each one just far enough past
 * its predecessor. A long run of hubs wanting the same spot drifts rightward
 * rather than overlapping — the right trade for a handful of threads.
 */
export function packRow(preferred: number[], minGap: number): number[] {
  const order = preferred.map((_, i) => i).sort((a, b) => preferred[a] - preferred[b])
  const placed = new Array<number>(preferred.length)
  let last = -Infinity
  for (const i of order) {
    const x = Math.max(preferred[i], last + minGap)
    placed[i] = x
    last = x
  }
  return placed
}
