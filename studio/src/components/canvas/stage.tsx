'use client'

// studio/src/components/canvas/stage.tsx — the infinite surface (5.0).
//
// Three layers, and the split between them is the whole performance story:
//   data-world   scaled, translated: the blocks and the links live in world px
//   data-overlay unscaled: selection, guides, marquee — 1 px stays 1 px
//   data-stage   the clipping window, with the dot grid drawn in SCREEN space
//
// Pan and zoom write `transform` straight onto data-world every frame and tell
// the store once per animation frame; culling means only what is near the view
// is mounted at all. The canvas is unbounded: there is no scroll container and
// no content size, just an affine transform over an infinite plane.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { type Theme, type Tokens } from '@/lib/design-tokens'
import { geometry, zIndex } from '@/lib/studio/canvas-tokens'
import { useCanvasStore, useStore, useViewport } from '@/lib/studio/hooks'
import { viewRectFor, visibleIds } from '@/lib/studio/engine/culling'
import { gridBackground } from '@/lib/studio/engine/viewport'
import type { Viewport } from '@/lib/studio/types'
import { BlockView } from '@/components/canvas/block-view'
import { LinksLayer, type LinksApi } from '@/components/canvas/links/links-layer'
import { Overlay } from '@/components/canvas/overlay'
import { useCanvasEngine } from '@/components/canvas/engine-context'

/** Kept as an export because the chrome's mini-map and tests both use it. */
export { gridBackground }

export function Stage({ interactive, phone = false }: { interactive: boolean; phone?: boolean }) {
  const { t, theme } = useTheme()
  const store = useStore()
  const engine = useCanvasEngine()
  const v = useViewport()
  const gridOn = useCanvasStore((s) => s.project.settings.grid)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const worldRef = useRef<HTMLDivElement | null>(null)
  const linksRef = useRef<LinksApi | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // ── which blocks are worth mounting (D-010) ──────────────────────────────
  const renderIds = useCanvasStore(
    () => {
      const live = store.renderOrder()
      if (size.w === 0) return live.map((b) => b.id)
      const ids = new Set(visibleIds(live, viewRectFor(store.get().viewport, size.w, size.h)))
      return live.filter((b) => ids.has(b.id)).map((b) => b.id)
    },
    (a, b) => a.length === b.length && a.every((x, i) => x === b[i]),
  )

  // ── hand the engine its DOM (it owns the listeners, not React) ───────────
  useEffect(() => {
    if (!engine) return
    engine.attach({
      stageEl: stageRef.current,
      worldEl: worldRef.current,
      links: linksRef.current,
      size: () => {
        const r = stageRef.current?.getBoundingClientRect()
        return { w: r?.width ?? 0, h: r?.height ?? 0 }
      },
    })
    return () => engine.detach()
  }, [engine])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    const r = el.getBoundingClientRect()
    setSize({ w: r.width, h: r.height })
    return () => ro.disconnect()
  }, [])

  const refs = engine?.refs ?? EMPTY_REFS
  const viewportGetter = useCallback((): Viewport => engine?.machine.viewport() ?? store.get().viewport, [engine, store])

  const grid = useMemo(() => gridBackground(v, theme as Theme, gridOn, t as Tokens), [v, theme, gridOn, t])

  return (
    <div
      ref={stageRef}
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
        ...grid,
      }}
    >
      <div
        ref={worldRef}
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
          {renderIds.map((id) => (
            <BlockView key={id} id={id} phone={phone} refs={refs} measurer={engine?.measurer ?? null} />
          ))}
        </div>
      </div>
      <Overlay
        ref={(node) => { if (engine) engine.setOverlay(node) }}
        store={store}
        viewport={viewportGetter}
        vw={() => size.w}
        vh={() => size.h}
      />
    </div>
  )
}

const EMPTY_REFS = new Map<string, HTMLElement>()
