// studio/src/lib/studio/engine/pin.ts — the one block that is not arranged:
// "since you were here" (D-026). It is pinned under the concept, always the
// same width, always 8 px below it, and it is never selectable or draggable.
//
// It has to be re-pinned whenever the concept moves OR its measured height
// changes, otherwise the concept grows with a longer body and the since row
// stays behind, overlapping it or drifting away from it.

import type { CanvasStore } from '@/lib/studio/store'
import type { AnyBlock } from '@/lib/studio/types'

/** The gap between the concept and its since row, in world px. */
export const SINCE_GAP = 8

export function pinnedRect(concept: AnyBlock): { x: number; y: number; w: number } {
  return { x: concept.x, y: concept.y + concept.h + SINCE_GAP, w: concept.w }
}

/**
 * Move the since row under the concept if it is not already there. Returns the
 * ids it changed, so the caller can schedule a save. This is a silent write:
 * nobody performed it, so it is not an undo step.
 */
export function pinSince(store: CanvasStore): string[] {
  const s = store.get()
  let concept: AnyBlock | undefined
  let since: AnyBlock | undefined
  for (const b of s.blocks.values()) {
    if (b.deleted_at) continue
    if (b.type === 'concept') concept = b
    else if (b.type === 'since') since = b
    if (concept && since) break
  }
  if (!concept || !since) return []

  const want = pinnedRect(concept)
  if (since.x === want.x && since.y === want.y && since.w === want.w) return []
  store.updateBlock(since.id, want)
  store.markDirty([since.id])
  return [since.id]
}
