// studio/src/lib/studio/layout/arrivals.ts — edge arrival (7.4, D-036). Pure and
// isomorphic; the talk route computes the rect at insert time and stores it, so the
// row's x/y are the single truth and the client draws arrivals exactly there.
//
// The arrivals column stands ARRIVAL_GAP to the right of the settled blocks' bbox,
// starting level with the since row's bottom + ROW_GAP (or the bbox top), and stacks
// downward with ROW_GAP between arrivals. When the next arrival would reach past
// bbox.bottom + ARRIVAL_MAX_BELOW, a new column starts ARRIVAL_COL_STEP further right.
//
// When one apply inserts several arrivals, feed each inserted row back into `live`
// before computing the next one, so they stack instead of landing on one another.

import type { AnyBlock, BlockType, Rect } from '@/lib/studio/types'
import { estimateH } from '@/lib/studio/layout/estimate'
import { widthFor } from '@/lib/studio/layout/compose'
import { ARRIVAL_COL_STEP, ARRIVAL_GAP, ARRIVAL_MAX_BELOW, FULL, ROW_GAP, snap8 } from '@/lib/studio/layout/constants'

function union(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const r of rects) {
    x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y)
    x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function arrivalRect(live: AnyBlock[], type: BlockType, content: unknown): Rect {
  const alive = live.filter((b) => !b.deleted_at)
  const settled = alive.filter((b) => !b.hidden && !b.stacked_in && b.arrival_state === 'placed')
  const bbox = union(settled) ?? { x: 0, y: 0, w: FULL, h: 0 }
  const since = alive.find((b) => b.type === 'since')

  const laneX = snap8(bbox.x + bbox.w + ARRIVAL_GAP)
  const laneTop = snap8(since ? since.y + since.h + ROW_GAP : bbox.y)
  const w = widthFor('column', type)
  const h = estimateH(type, content, w)

  const waiting = alive
    .filter((b) => b.arrival_state === 'unplaced')
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
  if (waiting.length === 0) return { x: laneX, y: laneTop, w, h }

  const last = waiting[waiting.length - 1]
  const y = snap8(last.y + last.h + ROW_GAP)
  if (y + h > bbox.y + bbox.h + ARRIVAL_MAX_BELOW) {
    return { x: snap8(last.x + ARRIVAL_COL_STEP), y: laneTop, w, h }
  }
  return { x: last.x, y, w, h }
}

/**
 * Build the full row for an arriving block: rect from arrivalRect, z = maxZ + 1,
 * placed_by 'auto', arrival_state 'unplaced'. `arrived_from` (the person's entry id)
 * comes in on `block`. An empty id is filled with crypto.randomUUID().
 */
export function nextArrival(
  live: AnyBlock[],
  block: Omit<AnyBlock, 'x' | 'y' | 'w' | 'h' | 'z'>,
  maxZ: number
): AnyBlock {
  const r = arrivalRect(live, block.type, block.content)
  return {
    ...block,
    id: block.id || crypto.randomUUID(),
    x: r.x,
    y: r.y,
    w: r.w,
    h: r.h,
    z: maxZ + 1,
    placed_by: 'auto',
    arrival_state: 'unplaced',
  } as AnyBlock
}
