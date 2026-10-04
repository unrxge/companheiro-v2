// Moving one row of a list to another place in it. Pure, so the dragging can
// be tested without a pointer.

/** The list with the item at `from` moved to sit at `to`. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list]
  if (from < 0 || from >= out.length) return out
  const target = Math.max(0, Math.min(out.length - 1, to))
  if (target === from) return out
  const [moved] = out.splice(from, 1)
  out.splice(target, 0, moved)
  return out
}

/**
 * Which place a row being dragged now belongs in, given where every row sits
 * and where the pointer is. The row is in a new place once the pointer has
 * passed the middle of its neighbour, which is what makes a drag feel like it
 * is pushing the others aside rather than snapping at the last moment.
 */
export function dropIndex(tops: readonly number[], heights: readonly number[], from: number, y: number): number {
  let past = 0
  for (let i = 0; i < tops.length; i++) {
    if (i === from) continue
    if (y > tops[i] + heights[i] / 2) past++
  }
  return Math.max(0, Math.min(tops.length - 1, past))
}
