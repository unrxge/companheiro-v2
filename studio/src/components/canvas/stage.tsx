'use client'

// studio/src/components/canvas/stage.tsx — STUB (lane A, 11.1). Lane B replaces
// this file with 5.0 (wheel/pointer binding, refs Map, overlay mount, culling,
// measure). The exported name and props stay: `Stage({ interactive })`; `phone`
// is optional and only tells renderers they are on a phone.
//
// What the stub does: the stage div with the screen-space grid background
// (D-009), the world at the stored viewport transform, the links layer (D's
// stub), and every renderable block positioned statically through the block
// registry (FallbackBlock for unregistered types) inside BlockShell. No pointer
// handling.

import { memo, useRef, type CSSProperties } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { alpha, type Theme, type Tokens } from '@/lib/design-tokens'
import { geometry, grid, zIndex } from '@/lib/studio/canvas-tokens'
import { useBlock, useCanvasStore, useIsEditing, useIsSelected, useRenderOrderIds, useViewport } from '@/lib/studio/hooks'
import { registry } from '@/lib/studio/registry'
import type { Viewport } from '@/lib/studio/types'
import { BlockShell } from '@/components/canvas/blocks/block-shell'
import { FallbackBlock } from '@/components/canvas/blocks/fallback-block'
import { getRegistration } from '@/components/canvas/blocks/registry'
import { LinksLayer, type LinksApi } from '@/components/canvas/links/links-layer'

/** Screen-space dot grid (D-009): step by k, 1 px dots, alpha fades out below k 0.5. */
export function gridBackground(v: Viewport, theme: Theme, on: boolean, t: Tokens): CSSProperties {
  if (!on) return {}
  const step = grid.step(v.k)
  const size = step * v.k
  const a = grid.dotAlpha[theme] * grid.fade(v.k)
  if (a <= 0 || size < 2) return {}
  const mod = (n: number, m: number) => ((n % m) + m) % m
  const r = grid.dotRadiusPx
  return {
    backgroundImage: `radial-gradient(circle, ${alpha(t.textPrimary, a)} ${r}px, transparent ${r + 0.5}px)`,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${mod(v.tx, size)}px ${mod(v.ty, size)}px`,
  }
}

export function Stage({ interactive, phone = false }: { interactive: boolean; phone?: boolean }) {
  const { t, theme } = useTheme()
  const v = useViewport()
  const gridOn = useCanvasStore((s) => s.project.settings.grid)
  const ids = useRenderOrderIds()
  const linksRef = useRef<LinksApi>(null)

  return (
    <div
      data-stage
      data-interactive={interactive ? 'true' : 'false'}
      style={{
        position: 'absolute',
        inset: `${geometry.topBarH}px 0 0 0`,
        overflow: 'hidden',
        touchAction: 'none',
        backgroundColor: t.containerBg,
        borderRadius: `${geometry.stageRadiusTop}px ${geometry.stageRadiusTop}px 0 0`,
        zIndex: zIndex.world,
        transition: 'background-color 0.3s ease',
        ...gridBackground(v, theme, gridOn, t),
      }}
    >
      <div
        data-world
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate(${v.tx}px, ${v.ty}px) scale(${v.k})`,
          transformOrigin: '0 0',
        }}
      >
        <LinksLayer ref={linksRef} />
        <div data-blocks>
          {ids.map((id) => (
            <BlockViewFallback key={id} id={id} phone={phone} />
          ))}
        </div>
      </div>
      <svg
        data-overlay
        aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: zIndex.overlay }}
      />
    </div>
  )
}

/** Static positioned wrapper; lane B's BlockView (memoised, measured, ref-registered) replaces it. */
const BlockViewFallback = memo(function BlockViewFallback({ id, phone }: { id: string; phone: boolean }) {
  const block = useBlock(id)
  const selected = useIsSelected(id)
  const editing = useIsEditing(id)
  if (!block || block.deleted_at) return null
  const spec = registry[block.type]
  const Renderer = getRegistration(block.type)?.Renderer ?? FallbackBlock
  return (
    <div
      data-block-id={id}
      data-type={block.type}
      data-locked={block.locked ? 'true' : undefined}
      data-struck={block.struck_at ? 'true' : undefined}
      data-unplaced={block.arrival_state === 'unplaced' ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate3d(${block.x}px, ${block.y}px, 0)`,
        width: block.w,
        height: spec.autoHeight ? 'auto' : block.h,
        contain: 'layout style',
      }}
    >
      <BlockShell block={block} selected={selected} editing={editing} phone={phone}>
        <Renderer block={block} editing={editing} selected={selected} phone={phone} />
      </BlockShell>
    </div>
  )
})
