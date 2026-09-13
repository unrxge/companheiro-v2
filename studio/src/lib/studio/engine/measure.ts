// studio/src/lib/studio/engine/measure.ts — measured heights (D-015, D-016).
// Text blocks grow rather than scroll, so their height belongs to the content,
// not to the person. One ResizeObserver watches every mounted block's inner
// node; the height is rounded up to the grid and written quietly (no undo step,
// because nobody performed it).

import { ceil8 } from '@/lib/studio/geometry'
import { registry } from '@/lib/studio/registry'
import type { CanvasStore } from '@/lib/studio/store'

export interface Measurer {
  observe(id: string, el: Element): void
  unobserve(id: string): void
  /** Ignored while a gesture is in flight: a drag must not fight the observer. */
  pause(on: boolean): void
  dispose(): void
}

export function createMeasurer(opts: { store: CanvasStore; onHeights: (ids: string[]) => void }): Measurer {
  const { store } = opts
  if (typeof ResizeObserver === 'undefined') {
    return { observe() {}, unobserve() {}, pause() {}, dispose() {} }
  }

  const byEl = new Map<Element, string>()
  const byId = new Map<string, Element>()
  const pending = new Map<string, number>()
  let paused = false
  let raf = 0

  const commit = () => {
    raf = 0
    if (paused || pending.size === 0) return
    const changed: string[] = []
    for (const [id, px] of pending) {
      const row = store.get().blocks.get(id)
      if (!row) continue
      if (!registry[row.type].autoHeight) continue
      const next = Math.max(8, ceil8(px))
      if (Math.abs(next - row.h) < 8) continue
      store.updateBlock(id, { h: next })
      changed.push(id)
    }
    pending.clear()
    if (changed.length) {
      store.markDirty(changed)
      opts.onHeights(changed)
    }
  }

  const ro = new ResizeObserver((entries) => {
    if (paused) return
    for (const entry of entries) {
      const id = byEl.get(entry.target)
      if (!id) continue
      const box = entry.borderBoxSize?.[0]
      pending.set(id, box ? box.blockSize : entry.contentRect.height)
    }
    if (!raf) raf = requestAnimationFrame(commit)
  })

  return {
    observe(id, el) {
      const existing = byId.get(id)
      if (existing === el) return
      if (existing) { ro.unobserve(existing); byEl.delete(existing) }
      byId.set(id, el)
      byEl.set(el, id)
      ro.observe(el, { box: 'border-box' })
    },
    unobserve(id) {
      const el = byId.get(id)
      if (!el) return
      ro.unobserve(el)
      byEl.delete(el)
      byId.delete(id)
      pending.delete(id)
    },
    pause(on) {
      paused = on
      if (!on && pending.size && !raf) raf = requestAnimationFrame(commit)
    },
    dispose() {
      ro.disconnect()
      byEl.clear()
      byId.clear()
      pending.clear()
      if (raf) cancelAnimationFrame(raf)
    },
  }
}
