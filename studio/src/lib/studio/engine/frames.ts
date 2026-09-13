// studio/src/lib/studio/engine/frames.ts — frames as named regions (5.7,
// D-019…D-022). Children keep ABSOLUTE world coordinates: a frame is a grouping
// of blocks in space, not a coordinate system.

import { geometry } from '@/lib/studio/canvas-tokens'
import { centre, containsPoint, grow, inset, rectOf, snap8, union } from '@/lib/studio/geometry'
import { registry } from '@/lib/studio/registry'
import type { CanvasState } from '@/lib/studio/store'
import type { AnyBlock, Block, Rect } from '@/lib/studio/types'

/** A frame may sit inside one frame; no deeper (D-019). */
export const MAX_DEPTH = 2
/** F grows the new frame this far past the selection on every side (D-022). */
export const FRAME_PAD = 24

export function innerRect(f: AnyBlock): Rect {
  return inset(rectOf(f), geometry.frameInnerPad)
}

/**
 * The frame a dropped block belongs to: the deepest live, unlocked, expanded
 * frame whose inner rect holds the block's centre, ties to the higher z (D-020).
 */
export function frameUnderCentre(
  s: CanvasState,
  r: Rect,
  exclude: Set<string>,
  live: AnyBlock[],
  depthOf: (id: string) => number,
): string | null {
  const p = centre(r)
  let best: AnyBlock | null = null
  let bestDepth = -1
  for (const b of live) {
    if (b.type !== 'frame' || exclude.has(b.id) || b.locked || b.collapsed || b.hidden) continue
    if (!containsPoint(innerRect(b), p)) continue
    const d = depthOf(b.id)
    if (d >= MAX_DEPTH) continue                       // nothing may nest below the cap
    if (d > bestDepth || (d === bestDepth && best && b.z > best.z)) {
      best = b
      bestDepth = d
    }
  }
  return best?.id ?? null
}

/**
 * Where a dropped block ends up in the hierarchy, and whether its new frame has
 * to grow to hold it (D-020). A frame being dragged never enters a frame that
 * already has a parent, so depth stays within the cap.
 */
export function reparentFor(
  s: CanvasState,
  primaryId: string,
  rectAfter: Rect,
  moveSet: Set<string>,
  live: AnyBlock[],
  depthOf: (id: string) => number,
): { parent_id: string | null; grow: { id: string; rect: Rect } | null } {
  const primary = s.blocks.get(primaryId)
  if (!primary) return { parent_id: null, grow: null }
  if (primary.type === 'since' || primary.type === 'concept') return { parent_id: primary.parent_id, grow: null }

  const target = frameUnderCentre(s, rectAfter, moveSet, live, depthOf)
  if (!target) return { parent_id: null, grow: null }
  if (primary.type === 'frame') {
    const host = s.blocks.get(target)
    if (!host || host.parent_id) return { parent_id: null, grow: null }
  }
  if (target === primary.parent_id) {
    return { parent_id: target, grow: growthFor(s, target, rectAfter) }
  }
  return { parent_id: target, grow: growthFor(s, target, rectAfter) }
}

/** A frame grows to contain a child that overflows it, plus the inner padding. */
export function growthFor(s: CanvasState, frameId: string, childRect: Rect): { id: string; rect: Rect } | null {
  const f = s.blocks.get(frameId)
  if (!f) return null
  const need = grow(childRect, geometry.frameInnerPad)
  const merged = union([rectOf(f), need])
  if (!merged) return null
  const next: Rect = {
    x: snap8(Math.min(f.x, merged.x)),
    y: snap8(Math.min(f.y, merged.y)),
    w: snap8(Math.max(f.w, merged.x + merged.w - Math.min(f.x, merged.x))),
    h: snap8(Math.max(f.h, merged.y + merged.h - Math.min(f.y, merged.y))),
  }
  if (next.x === f.x && next.y === f.y && next.w === f.w && next.h === f.h) return null
  return { id: frameId, rect: next }
}

/** Collapse to the bar, remembering the height to come back to (D-021). */
export function collapse(f: Block<'frame'>): Partial<Block<'frame'>> {
  return {
    collapsed: true,
    h: geometry.frameBarH,
    content: { ...f.content, expanded_h: f.h },
  }
}

export function expand(f: Block<'frame'>): Partial<Block<'frame'>> {
  const h = f.content.expanded_h > geometry.frameBarH ? f.content.expanded_h : registry.frame.defaultH
  return { collapsed: false, h }
}

/** F: wrap the selection in a new frame (D-022). The caller assigns id and z. */
export function frameRectFor(s: CanvasState, ids: Set<string>): Rect | null {
  const rects: Rect[] = []
  for (const id of ids) {
    const b = s.blocks.get(id)
    if (b && !b.deleted_at) rects.push(rectOf(b))
  }
  const u = union(rects)
  if (!u) return null
  const r = grow(u, FRAME_PAD)
  return { x: snap8(r.x), y: snap8(r.y), w: snap8(r.w), h: snap8(r.h) }
}

/** Which of `ids` become the new frame's children: top-level rows only. */
export function frameChildren(s: CanvasState, ids: Set<string>, depthOf: (id: string) => number): string[] {
  const out: string[] = []
  for (const id of ids) {
    const b = s.blocks.get(id)
    if (!b || b.deleted_at) continue
    if (b.type === 'since' || b.type === 'concept') continue
    if (depthOf(id) > 0) continue
    out.push(id)
  }
  return out
}
