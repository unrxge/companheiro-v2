// studio/src/lib/studio/engine/selection.ts — what a gesture actually selects
// and moves (5.6, D-025, D-026). Pure reads of the state; no mutation.

import { intersects, rectOf } from '@/lib/studio/geometry'
import { registry } from '@/lib/studio/registry'
import type { CanvasState } from '@/lib/studio/store'
import type { AnyBlock, Rect } from '@/lib/studio/types'

/** The since row is pinned to the concept and is never selected on its own (D-026). */
export function sinceRowOf(s: CanvasState, conceptId: string): string | null {
  const concept = s.blocks.get(conceptId)
  if (!concept || concept.type !== 'concept') return null
  for (const b of s.blocks.values()) {
    if (b.type === 'since' && !b.deleted_at) return b.id
  }
  return null
}

/**
 * Everything a drag of `ids` must carry: the blocks themselves, the descendants
 * of any selected frame, and the since row whenever the concept moves (D-026).
 */
export function closure(s: CanvasState, ids: Set<string>): Set<string> {
  const out = new Set<string>()
  const add = (id: string) => {
    if (out.has(id)) return
    const b = s.blocks.get(id)
    if (!b || b.deleted_at) return
    out.add(id)
    if (b.type === 'frame') for (const c of s.blocks.values()) {
      if (!c.deleted_at && c.parent_id === id) add(c.id)
    }
    if (b.type === 'concept') {
      const since = sinceRowOf(s, id)
      if (since) out.add(since)
    }
  }
  for (const id of ids) add(id)
  return out
}

export function canSelect(b: AnyBlock, fromLayers: boolean): boolean {
  if (b.deleted_at || b.hidden) return false
  if (!registry[b.type].selectable) return false
  if (b.locked && !fromLayers) return false
  return true
}

/**
 * Marquee: blocks whose rect the marquee touches. A frame swallowed whole takes
 * its descendants out of the set, so dragging the result moves the frame once
 * rather than the frame and every child twice (D-025).
 */
export function blocksIntersecting(s: CanvasState, r: Rect, renderable: AnyBlock[]): Set<string> {
  const hit = new Set<string>()
  for (const b of renderable) {
    if (!canSelect(b, false)) continue
    if (intersects(rectOf(b), r)) hit.add(b.id)
  }
  for (const b of renderable) {
    if (b.type !== 'frame' || !hit.has(b.id)) continue
    for (const c of s.blocks.values()) if (c.parent_id === b.id) hit.delete(c.id)
  }
  return hit
}

/** Cmd/Ctrl+A: every unlocked, unhidden, top-level block (D-025). */
export function selectAll(s: CanvasState, topLevel: AnyBlock[]): Set<string> {
  const out = new Set<string>()
  for (const b of topLevel) if (canSelect(b, false)) out.add(b.id)
  return out
}

export function toggle(sel: Set<string>, id: string): Set<string> {
  const next = new Set(sel)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/** Drop rows that can no longer be selected (deleted, hidden, since). */
export function sanitiseSelection(s: CanvasState, ids: Iterable<string>): { selection: Set<string>; primary: string | null } {
  const out = new Set<string>()
  let primary: string | null = null
  for (const id of ids) {
    const b = s.blocks.get(id)
    if (!b || !canSelect(b, true)) continue
    out.add(id)
    primary = id
  }
  return { selection: out, primary }
}
