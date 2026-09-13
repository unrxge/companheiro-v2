// studio/src/lib/studio/engine/culling.ts — what is mounted (5.12, D-010).
// An infinite canvas only stays cheap if most of it is not in the DOM; culled
// rows still feed snapping, so arranging near the edge of the view behaves.

import { intersects, rectOf } from '@/lib/studio/geometry'
import { CHIP_K, VIEW_MARGIN, visibleWorldRect } from '@/lib/studio/engine/viewport'
import type { AnyBlock, Rect, Viewport } from '@/lib/studio/types'

export function visibleIds(renderable: AnyBlock[], view: Rect): string[] {
  const out: string[] = []
  for (const b of renderable) if (intersects(rectOf(b), view)) out.push(b.id)
  return out
}

export function viewRectFor(v: Viewport, vw: number, vh: number): Rect {
  return visibleWorldRect(v, vw, vh, VIEW_MARGIN)
}

export const isChip = (k: number): boolean => k < CHIP_K

/** Whether a zoom change crossed the chip threshold — the only time it matters. */
export function crossedChip(kBefore: number, kAfter: number): boolean {
  return isChip(kBefore) !== isChip(kAfter)
}
