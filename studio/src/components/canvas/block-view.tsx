'use client'

// studio/src/components/canvas/block-view.tsx — one mounted block (5.14).
//
// This component is deliberately thin and deliberately memoised: it subscribes
// only to its own row, its own selection bit and its own editing bit, so moving
// one block cannot re-render the other 299. The positioned div it owns is also
// the element the pointer machine writes transforms onto during a drag, which is
// why the machine is handed a ref rather than a setState.

import { memo, useEffect, useRef } from 'react'
import { useBlock, useIsEditing, useIsSelected, useStore } from '@/lib/studio/hooks'
import { registry } from '@/lib/studio/registry'
import { BlockShell } from '@/components/canvas/blocks/block-shell'
import { FallbackBlock } from '@/components/canvas/blocks/fallback-block'
import { getRegistration } from '@/components/canvas/blocks/registry'
import type { Measurer } from '@/lib/studio/engine/measure'

export interface BlockViewProps {
  id: string
  phone: boolean
  /** Where the machine looks the element up. */
  refs: Map<string, HTMLElement>
  measurer: Measurer | null
}

export const BlockView = memo(function BlockView({ id, phone, refs, measurer }: BlockViewProps) {
  const store = useStore()
  const block = useBlock(id)
  const selected = useIsSelected(id)
  const editing = useIsEditing(id)
  const el = useRef<HTMLDivElement | null>(null)
  const type = block?.type ?? 'note'

  // the machine addresses blocks by id, so registration lives with the element
  useEffect(() => {
    const node = el.current
    if (!node) return
    refs.set(id, node)
    return () => {
      if (refs.get(id) === node) refs.delete(id)
    }
  }, [id, refs])

  /**
   * Heights of text blocks belong to their content (D-015). The node watched is
   * this positioned div, NOT the inner `[data-measure]` content: an auto-height
   * block never has its height written by us, so its own box is the block's
   * true rendered height — eyebrow, padding and the struck sentence included.
   * Measuring the inner node instead under-reports by exactly the shell's
   * chrome, which then makes tidy avoid rects smaller than the blocks really
   * are and lay them out overlapping.
   */
  useEffect(() => {
    if (!measurer || !el.current) return
    if (!registry[type].autoHeight) return
    measurer.observe(id, el.current)
    return () => measurer.unobserve(id)
  }, [id, measurer, type])

  if (!block || block.deleted_at) return null
  const spec = registry[block.type]
  const Renderer = getRegistration(block.type)?.Renderer ?? FallbackBlock

  return (
    <div
      ref={el}
      data-block-id={id}
      data-type={block.type}
      data-locked={block.locked ? 'true' : undefined}
      data-struck={block.struck_at ? 'true' : undefined}
      data-unplaced={block.arrival_state === 'unplaced' ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      onPointerEnter={() => { if (store.get().hover !== id) store.set((s) => { s.hover = id }) }}
      onPointerLeave={() => { if (store.get().hover === id) store.set((s) => { s.hover = null }) }}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate3d(${block.x}px, ${block.y}px, 0)`,
        width: block.w,
        height: spec.autoHeight ? 'auto' : block.h,
        // `paint` would clip the arrival marker at (-4,-4); layout and style are
        // the parts worth containing anyway
        contain: 'layout style',
      }}
    >
      <BlockShell block={block} selected={selected} editing={editing} phone={phone}>
        <Renderer block={block} editing={editing} selected={selected} phone={phone} />
      </BlockShell>
    </div>
  )
})
