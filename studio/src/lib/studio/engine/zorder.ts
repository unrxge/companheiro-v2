// studio/src/lib/studio/engine/zorder.ts — stacking (5.8, D-018). z is unique
// per project and never changes on click or drag: only the explicit keys and the
// layers list reorder anything.

import type { CanvasState } from '@/lib/studio/store'
import type { AnyBlock } from '@/lib/studio/types'

export type ZDirection = 'forward' | 'back' | 'front' | 'back_all'

/** Children always paint above their frame, so depth leads and z breaks ties. */
export function renderOrder(blocks: AnyBlock[], depthOf: (id: string) => number): AnyBlock[] {
  return [...blocks].sort((a, b) => {
    const da = depthOf(a.id)
    const db = depthOf(b.id)
    return da !== db ? da - db : a.z - b.z
  })
}

export function maxZ(blocks: Iterable<AnyBlock>): number {
  let m = 0
  for (const b of blocks) if (b.z > m) m = b.z
  return m
}

/**
 * One step, or all the way (D-018). Stepping swaps with the nearest neighbour in
 * the same depth so a single press is always visible; front/back reassign above
 * or below every sibling.
 */
export function stepZ(s: CanvasState, ids: Set<string>, dir: ZDirection, live: AnyBlock[]): Map<string, number> {
  const out = new Map<string, number>()
  if (ids.size === 0) return out
  const sorted = [...live].sort((a, b) => a.z - b.z)
  const top = sorted.length ? sorted[sorted.length - 1].z : 0
  const bottom = sorted.length ? sorted[0].z : 0

  if (dir === 'front' || dir === 'back_all') {
    const moving = [...ids].map((id) => s.blocks.get(id)).filter((b): b is AnyBlock => !!b).sort((a, b) => a.z - b.z)
    let next = dir === 'front' ? top + 1 : bottom - moving.length
    for (const b of moving) out.set(b.id, next++)
    return out
  }

  const forward = dir === 'forward'
  const order = forward ? sorted : [...sorted].reverse()
  for (const b of order) {
    if (!ids.has(b.id)) continue
    const i = order.indexOf(b)
    // the nearest block on the other side that is not itself moving
    let j = i + 1
    while (j < order.length && ids.has(order[j].id)) j++
    const swap = order[j]
    if (!swap) continue
    out.set(b.id, swap.z)
    out.set(swap.id, b.z)
  }
  return out
}

/** Layers drag: `orderedIds` front first. z is reassigned inside the same range. */
export function reorderZ(s: CanvasState, orderedTopLevelIds: string[]): Map<string, number> {
  const rows = orderedTopLevelIds.map((id) => s.blocks.get(id)).filter((b): b is AnyBlock => !!b)
  const zs = rows.map((b) => b.z).sort((a, b) => a - b)
  const out = new Map<string, number>()
  // back of the list gets the lowest z: the list reads front first
  const backFirst = [...rows].reverse()
  backFirst.forEach((b, i) => {
    if (b.z !== zs[i]) out.set(b.id, zs[i])
  })
  return out
}
