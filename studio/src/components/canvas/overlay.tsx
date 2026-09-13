'use client'

// studio/src/components/canvas/overlay.tsx — everything drawn ON the canvas but
// not scaled with it (5.0, D-042, D-043): hover, selection, handles, marquee,
// smart guides, distance labels, the link rubber band and the placing ghost.
//
// It is one SVG in SCREEN space, written imperatively through OverlayApi, so a
// drag never re-renders React. Hairlines stay 1 px at every zoom because they
// are drawn here rather than in the world.

import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { geometry, line, pencil, radii } from '@/lib/studio/canvas-tokens'
import { rectOf } from '@/lib/studio/geometry'
import { registry } from '@/lib/studio/registry'
import type { CanvasStore } from '@/lib/studio/store'
import { worldRectToScreen, worldToScreen } from '@/lib/studio/engine/viewport'
import type { GapLabel, Guide } from '@/lib/studio/engine/snap'
import type { OverlayApi } from '@/lib/studio/engine/pointer'
import type { Handle, Point, Rect, Viewport } from '@/lib/studio/types'

const NS = 'http://www.w3.org/2000/svg'
const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Where a handle sits on the rect, in units of the rect's own size. */
const HANDLE_AT: Record<Handle, Point> = {
  nw: { x: 0, y: 0 }, n: { x: 0.5, y: 0 }, ne: { x: 1, y: 0 }, e: { x: 1, y: 0.5 },
  se: { x: 1, y: 1 }, s: { x: 0.5, y: 1 }, sw: { x: 0, y: 1 }, w: { x: 0, y: 0.5 },
}

const CURSOR: Record<Handle, string> = {
  nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize',
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
}

export interface OverlayProps {
  store: CanvasStore
  /** The live viewport, read at draw time (mid-gesture React has not seen it). */
  viewport: () => Viewport
  vw: () => number
  vh: () => number
}

export const Overlay = forwardRef<OverlayApi, OverlayProps>(function Overlay(
  { store, viewport, vw, vh },
  ref,
) {
  const { t } = useTheme()
  const svg = useRef<SVGSVGElement | null>(null)
  const layers = useRef<Record<string, SVGGElement | null>>({})

  const colours = useMemo(() => ({
    selection: pencil.selection(t),
    hover: line.hover(t),
    guide: pencil.guide(t),
    marquee: pencil.marquee(t),
    label: pencil.labelPill,
    handleFill: t.cardBg,
  }), [t])

  const api = useMemo<OverlayApi>(() => {
    const el = (name: string): SVGGElement | null => layers.current[name] ?? null
    const clear = (name: string) => {
      const g = el(name)
      if (g) while (g.firstChild) g.removeChild(g.firstChild)
    }
    const add = <K extends keyof SVGElementTagNameMap>(
      name: string,
      tag: K,
      attrs: Record<string, string | number>,
    ): SVGElementTagNameMap[K] | null => {
      const g = el(name)
      if (!g) return null
      const node = document.createElementNS(NS, tag)
      for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
      g.appendChild(node)
      return node
    }

    /** Half-pixel alignment keeps a 1 px line actually 1 px (D-042). */
    const crisp = (n: number) => Math.round(n) + 0.5

    const labelPill = (name: string, at: Point, text: string) => {
      const w = text.length * 6 + 10
      add(name, 'rect', {
        x: at.x - w / 2, y: at.y - 9, width: w, height: 18, rx: colours.label.radius,
        fill: colours.label.bg,
      })
      const node = add(name, 'text', {
        x: at.x, y: at.y + 4, 'text-anchor': 'middle',
        'font-family': 'var(--font-geist-mono), ui-monospace, monospace',
        'font-size': 10, fill: colours.label.text(t),
      })
      if (node) node.textContent = text
    }

    const drawSelection = () => {
      clear('selection')
      const s = store.get()
      if (!s.interactive) return
      const v = viewport()

      // hover: a single hairline, and never under the selection
      if (s.hover && !s.selection.has(s.hover)) {
        const b = s.blocks.get(s.hover)
        if (b) {
          const r = worldRectToScreen(v, rectOf(b))
          add('selection', 'rect', {
            x: crisp(r.x), y: crisp(r.y), width: Math.round(r.w), height: Math.round(r.h),
            rx: radii.block, fill: 'none', stroke: colours.hover, 'stroke-width': 1,
          })
        }
      }

      if (s.selection.size === 0) return

      if (s.selection.size > 1) {
        // one dashed box around the lot: no multi-resize, deliberately (D-025)
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
        for (const id of s.selection) {
          const b = s.blocks.get(id)
          if (!b) continue
          x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y)
          x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h)
        }
        if (x0 === Infinity) return
        const r = worldRectToScreen(v, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
        add('selection', 'rect', {
          x: crisp(r.x - 1), y: crisp(r.y - 1), width: Math.round(r.w + 2), height: Math.round(r.h + 2),
          rx: radii.block, fill: 'none', stroke: colours.selection, 'stroke-width': 1, 'stroke-dasharray': '4 4',
        })
        return
      }

      const id = [...s.selection][0]
      const b = s.blocks.get(id)
      if (!b) return
      const r = worldRectToScreen(v, rectOf(b))
      // the outline sits 1 px OUTSIDE the block, so it never covers content
      add('selection', 'rect', {
        x: crisp(r.x - 1), y: crisp(r.y - 1), width: Math.round(r.w + 2), height: Math.round(r.h + 2),
        rx: radii.block, fill: 'none', stroke: colours.selection, 'stroke-width': 1,
      })

      if (b.locked) return
      const spec = registry[b.type]
      const hp = geometry.handlePx
      const hit = geometry.handleHitPx
      for (const h of HANDLES) {
        if (!spec.handles.includes(h)) continue
        const at = HANDLE_AT[h]
        const cx = r.x + r.w * at.x
        const cy = r.y + r.h * at.y
        // the square that shows, and a larger invisible square that catches
        add('selection', 'rect', {
          x: crisp(cx - hp / 2), y: crisp(cy - hp / 2), width: hp, height: hp,
          fill: colours.handleFill, stroke: colours.selection, 'stroke-width': 1, rx: radii.handle,
        })
        const target = add('selection', 'rect', {
          x: cx - hit / 2, y: cy - hit / 2, width: hit, height: hit,
          fill: 'transparent', style: `pointer-events: all; cursor: ${CURSOR[h]}`,
        })
        target?.setAttribute('data-handle', h)
      }
    }

    return {
      sync: drawSelection,

      guides(gs: Guide[], gaps: GapLabel[]) {
        clear('guides')
        const v = viewport()
        for (const g of gs) {
          if (g.axis === 'x') {
            const x = crisp(worldToScreen(v, { x: g.value, y: 0 }).x)
            const a = worldToScreen(v, { x: g.value, y: g.from }).y
            const b = worldToScreen(v, { x: g.value, y: g.to }).y
            add('guides', 'line', { x1: x, y1: a, x2: x, y2: b, stroke: colours.guide, 'stroke-width': 1 })
          } else {
            const y = crisp(worldToScreen(v, { x: 0, y: g.value }).y)
            const a = worldToScreen(v, { x: g.from, y: g.value }).x
            const b = worldToScreen(v, { x: g.to, y: g.value }).x
            add('guides', 'line', { x1: a, y1: y, x2: b, y2: y, stroke: colours.guide, 'stroke-width': 1 })
          }
        }
        const showSizes = store.get().project.settings.sizes
        for (const gap of gaps) {
          if (!gap.equal && !showSizes) continue
          labelPill('guides', worldToScreen(v, gap.at), `${gap.value}`)
        }
      },

      clearGuides() { clear('guides') },

      marquee(r: Rect | null) {
        clear('marquee')
        if (!r) return
        const s = worldRectToScreen(viewport(), r)
        add('marquee', 'rect', {
          x: crisp(s.x), y: crisp(s.y), width: Math.round(s.w), height: Math.round(s.h),
          fill: colours.marquee.fill, stroke: colours.marquee.stroke, 'stroke-width': 1, 'stroke-dasharray': '4 4',
        })
      },

      dropFrame(id: string | null) {
        clear('dropframe')
        if (!id) return
        const b = store.get().blocks.get(id)
        if (!b) return
        const r = worldRectToScreen(viewport(), rectOf(b))
        add('dropframe', 'rect', {
          x: crisp(r.x), y: crisp(r.y), width: Math.round(r.w), height: Math.round(r.h),
          rx: radii.frame, fill: 'none', stroke: colours.selection, 'stroke-width': 1, 'stroke-dasharray': '2 3',
        })
      },

      rubber(from: Point | null, to: Point | null) {
        clear('rubber')
        if (!from || !to) return
        add('rubber', 'line', {
          x1: from.x, y1: from.y, x2: to.x, y2: to.y,
          stroke: colours.selection, 'stroke-width': 1, 'stroke-dasharray': '3 3',
        })
      },

      ghost(r: Rect | null) {
        clear('ghost')
        if (!r) return
        const s = worldRectToScreen(viewport(), r)
        add('ghost', 'rect', {
          x: crisp(s.x), y: crisp(s.y), width: Math.round(s.w), height: Math.round(s.h),
          rx: radii.block, fill: colours.marquee.fill, stroke: colours.selection,
          'stroke-width': 1, 'stroke-dasharray': '4 4',
        })
      },
    }
  }, [store, viewport, colours, t])

  useImperativeHandle(ref, () => api, [api])

  void vw
  void vh

  return (
    <svg
      ref={svg}
      data-overlay
      aria-hidden
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
    >
      <g ref={(n) => { layers.current.dropframe = n }} data-layer="dropframe" />
      <g ref={(n) => { layers.current.guides = n }} data-layer="guides" />
      <g ref={(n) => { layers.current.marquee = n }} data-layer="marquee" />
      <g ref={(n) => { layers.current.ghost = n }} data-layer="ghost" />
      <g ref={(n) => { layers.current.rubber = n }} data-layer="rubber" />
      <g ref={(n) => { layers.current.selection = n }} data-layer="selection" />
    </svg>
  )
})
