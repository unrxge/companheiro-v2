// studio/src/lib/studio/layout/compose.ts — initial composition (7.2). Pure and
// isomorphic: used by POST /projects (composeNew), the client's first measured
// composition and composeAuto (7.5), and tidy (7.3). World px; every x/y/w is
// snapped to 8, every h is ceil8.
//
// Bands, top to bottom:
//   A  top     concept (FULL) with the since row pinned 8 px under it
//   B  column  compass · drafts · commitments · timeline · updates   ∥  wide: anchors
//   C  grid    references + notes in three columns of W, shortest column first
//   D  media   galleries · images · recordings · palettes, a row flow wrapping at FULL
// Obstacles (person-placed blocks, frames, arrivals, locked) are avoided by a
// skyline drop only: a block moves down past an obstacle, never sideways.

import { registry } from '@/lib/studio/registry'
import type { AnyBlock, BlockType, Placement, Rect, TypeSpec } from '@/lib/studio/types'
import { estimateH } from '@/lib/studio/layout/estimate'
import {
  AVOID_INSET, AVOID_MAX_ITERATIONS, BAND_GAP, FULL, G, ROW_GAP, SINCE_GAP, W, WIDE, ceil8, snap8,
} from '@/lib/studio/layout/constants'

export interface ComposeInput {
  blocks: AnyBlock[]
  obstacles: Rect[]
  heights?: Map<string, number>
  /**
   * Optional: ids of commitment blocks whose compass entry is resolved (done / let go).
   * The block itself only holds an entry id, so the caller supplies this when it
   * knows; without it every commitment flows as open.
   */
  done?: Set<string>
}

export function regionOf(type: BlockType): TypeSpec['region'] {
  return registry[type].region
}

export function widthFor(region: TypeSpec['region'], type: BlockType): number {
  switch (region) {
    case 'top': return FULL
    case 'column': return W
    case 'wide': return WIDE
    case 'grid': return W
    case 'media': return type === 'gallery' ? WIDE : W
    default: return registry[type].defaultW
  }
}

// ── rect helpers ───────────────────────────────────────────────────────────
export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + 2 * by, h: r.h + 2 * by }
}

/**
 * Skyline drop: while the rect hits an obstacle (grown by 8), move it below that
 * obstacle + ROW_GAP. Never sideways. Obstacles must be sorted by y.
 */
export function avoid(rect: Rect, obstacles: readonly Rect[]): Rect {
  const r: Rect = { ...rect }
  for (let i = 0; i < AVOID_MAX_ITERATIONS; i++) {
    const hit = obstacles.find((o) => intersects(r, grow(o, AVOID_INSET)))
    if (!hit) break
    r.y = ceil8(hit.y + hit.h + ROW_GAP)
  }
  return r
}

// ── ordering helpers ───────────────────────────────────────────────────────
function byCreatedDesc(a: AnyBlock, b: AnyBlock): number {
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0
}
function byCreatedAsc(a: AnyBlock, b: AnyBlock): number {
  return -byCreatedDesc(a, b)
}
function byUpdatedDesc(a: AnyBlock, b: AnyBlock): number {
  return a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0
}
/** Struck blocks flow with their type, sorted last within it (stable). */
function struckLast(list: AnyBlock[]): AnyBlock[] {
  return [...list.filter((b) => !b.struck_at), ...list.filter((b) => !!b.struck_at)]
}

/**
 * Band-A bottom when the concept is not among the composed blocks (it is an
 * obstacle instead, e.g. moved by hand): chain from the topmost obstacle that
 * overlaps the composed width downward through touching obstacles (the since row
 * sits 8 px under the concept) and start band B BAND_GAP below that. No obstacles → 0.
 */
function topBottomFromObstacles(obstacles: readonly Rect[]): number {
  const inBand = obstacles.filter((o) => o.x < FULL && o.x + o.w > 0)
  if (inBand.length === 0) return 0
  let top = inBand[0]
  for (const o of inBand) if (o.y < top.y) top = o
  let bottom = top.y + top.h
  let grew = true
  while (grew) {
    grew = false
    for (const o of inBand) {
      if (o.y <= bottom + SINCE_GAP && o.y + o.h > bottom) { bottom = o.y + o.h; grew = true }
    }
  }
  return Math.max(0, bottom) + BAND_GAP
}

// ── compose ────────────────────────────────────────────────────────────────
export function compose(input: ComposeInput): Placement[] {
  const heights = input.heights
  const done = input.done
  const obstacles = [...input.obstacles].sort((a, b) => a.y - b.y)
  const out: Placement[] = []

  const hOf = (b: AnyBlock): number => {
    const measured = heights?.get(b.id)
    const h = measured !== undefined ? measured
      : b.h > 8 ? b.h
      : estimateH(b.type, b.content, widthFor(regionOf(b.type), b.type))
    return ceil8(Math.max(8, h))
  }
  const assign = (b: AnyBlock, r: Rect): void => {
    out.push({ id: b.id, x: snap8(r.x), y: snap8(r.y), w: snap8(r.w), h: hOf(b) })
  }
  const flow = (b: AnyBlock, x: number, y: number, w: number): number => {
    const r = avoid({ x, y, w, h: hOf(b) }, obstacles)
    assign(b, r)
    return r.y + r.h + ROW_GAP
  }

  // Only top-level, live, unstacked blocks with a region are composed; heading, divider,
  // frame and everything inside a frame are hand-made structure.
  const eligible = input.blocks.filter(
    (b) => !b.deleted_at && !b.stacked_in && !b.parent_id && regionOf(b.type) !== 'none'
  )
  const of = (type: BlockType): AnyBlock[] => eligible.filter((b) => b.type === type)

  // ── band A: top ──
  const concept = of('concept')[0]
  const since = of('since')[0]
  let yB: number
  if (concept) {
    // A concept the person placed by hand keeps its rect (y_fixed); otherwise (0, 0, FULL).
    const keep = concept.placed_by === 'person' || concept.locked
    const cx = keep ? concept.x : 0
    const cy = keep ? concept.y : 0
    const cw = keep ? concept.w : FULL
    const ch = hOf(concept)
    assign(concept, { x: cx, y: cy, w: cw, h: ch })
    let bottom = cy + ch
    if (since) {
      const sy = cy + ch + SINCE_GAP
      assign(since, { x: cx, y: sy, w: cw, h: hOf(since) })
      bottom = sy + hOf(since)
    }
    yB = bottom + BAND_GAP
  } else if (since) {
    // A since row without its concept: treat it as the top band on its own.
    const top = topBottomFromObstacles(obstacles)
    const sy = top === 0 ? 0 : top
    assign(since, { x: 0, y: sy, w: FULL, h: hOf(since) })
    yB = sy + hOf(since) + BAND_GAP
  } else {
    yB = topBottomFromObstacles(obstacles)
  }

  // ── band B: column (x 0, W) ∥ wide (x W+G, WIDE) ──
  const drafts = struckLast(of('draft').sort(byUpdatedDesc))
  const commitmentsAll = of('commitment').sort(byCreatedDesc)
  const commitments = struckLast([
    ...commitmentsAll.filter((b) => !done?.has(b.id)),
    ...commitmentsAll.filter((b) => !!done?.has(b.id)),
  ])
  const columnOrder: AnyBlock[] = [
    ...struckLast(of('compass')),
    ...drafts,
    ...commitments,
    ...struckLast(of('timeline').sort(byCreatedDesc)),
    ...struckLast(of('update').sort(byCreatedDesc)),
  ]
  const anchors = struckLast(of('anchor').sort(byCreatedAsc))

  let col = yB
  let wide = yB
  for (const b of columnOrder) col = flow(b, 0, col, W)
  for (const a of anchors) wide = flow(a, W + G, wide, WIDE)
  const bandBUsed = columnOrder.length > 0 || anchors.length > 0
  const yC = bandBUsed ? Math.max(col, wide) - ROW_GAP + BAND_GAP : yB

  // ── band C: grid, three columns of W across FULL, shortest column first ──
  const gridItems = struckLast([...of('reference'), ...of('note')].sort(byCreatedDesc))
  const gy = [yC, yC, yC]
  for (const b of gridItems) {
    let c = 0
    for (let i = 1; i < gy.length; i++) if (gy[i] < gy[c]) c = i
    gy[c] = flow(b, c * (W + G), gy[c], W)
  }
  const yD = gridItems.length > 0 ? Math.max(...gy) - ROW_GAP + BAND_GAP : yC

  // ── band D: media, row flow wrapping at FULL ──
  const media = struckLast(
    [...of('gallery'), ...of('image'), ...of('recording'), ...of('palette')].sort(byCreatedDesc)
  )
  let mx = 0
  let my = yD
  let rowH = 0
  for (const m of media) {
    const w = widthFor('media', m.type)
    if (mx + w > FULL && mx > 0) { mx = 0; my += rowH + ROW_GAP; rowH = 0 }
    const h = hOf(m)
    const r = avoid({ x: mx, y: my, w, h }, obstacles)
    assign(m, r)
    mx = r.x + w + G
    // a block the skyline pushed down still belongs to this row: the row is as tall as its lowest bottom
    rowH = Math.max(rowH, r.y + h - my)
  }

  return out
}

/**
 * Server-side composition for a new project (POST /projects): no obstacles, estimated
 * heights. Placements come back in insertion order — concept, since, compass,
 * anchors…, references… — which is also the z order.
 */
export function composeNew(seed: {
  concept: AnyBlock
  since: AnyBlock
  compass: AnyBlock
  anchors: AnyBlock[]
  references: AnyBlock[]
}): Placement[] {
  const all = [seed.concept, seed.since, seed.compass, ...seed.anchors, ...seed.references]
  const heights = new Map<string, number>()
  for (const b of all) heights.set(b.id, estimateH(b.type, b.content, widthFor(regionOf(b.type), b.type)))
  const order = new Map(all.map((b, i) => [b.id, i]))
  return compose({ blocks: all, obstacles: [], heights }).sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
  )
}
