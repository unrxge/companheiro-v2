'use client'

// studio/src/components/canvas/links/links-layer.tsx — the world-space SVG of
// hairline links (D-023, D-024; lane D). One straight 1 px line per link between
// the nearest pair of edge midpoints of the two rects, 8 px off each edge,
// `vector-effect: non-scaling-stroke`; an optional word (≤ 24 chars) as a mono
// uppercase chip on a ground-coloured plate at the midpoint. Hover → tide and a
// small × at the midpoint that deletes the link (api.links.delete + store).
// Clicking the word chip opens the popover to change the word.
//
// The ref API lane B's pointer machine calls: `updateFor(ids, d)` re-lays every
// link touching `ids` from the store's rects shifted by `d` (world px) — no React
// during drags — and `redraw()` re-lays everything from the store.

import { forwardRef, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { alpha, fonts } from '@/lib/design-tokens'
import { api } from '@/lib/studio/api-client'
import { line as lineTokens } from '@/lib/studio/canvas-tokens'
import { useCanvasStore, useInteractive, useStore } from '@/lib/studio/hooks'
import type { CanvasStore } from '@/lib/studio/store'
import type { AnyBlock, Link, Point, Rect } from '@/lib/studio/types'
import { LinkWordPopover } from '@/components/canvas/links/link-word-popover'

export interface LinksApi {
  /** Shift the endpoints of every link touching `ids` by `d` (world px) during a drag. */
  updateFor(ids: Set<string>, d: Point): void
  /** Redraw every link from the store. */
  redraw(): void
}

export const LINK_GAP = 8
export const WORD_MAX = 24
const CHIP_FONT = 10
const CHIP_PAD_X = 6
const CHIP_H = 16
const CHAR_W = 6.2 // Geist Mono at 10 px, uppercase with 0.08em tracking
const X_R = 7

// ── geometry ───────────────────────────────────────────────────────────────

const rectOf = (b: Pick<AnyBlock, 'x' | 'y' | 'w' | 'h'>): Rect => ({ x: b.x, y: b.y, w: b.w, h: b.h })

/** n, e, s, w */
function edgeMidpoints(r: Rect): Point[] {
  return [
    { x: r.x + r.w / 2, y: r.y },
    { x: r.x + r.w, y: r.y + r.h / 2 },
    { x: r.x + r.w / 2, y: r.y + r.h },
    { x: r.x, y: r.y + r.h / 2 },
  ]
}

const dist2 = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2

/** The nearest pair of edge midpoints between two rects. */
export function nearestEdgePair(a: Rect, b: Rect): [Point, Point] {
  const ma = edgeMidpoints(a)
  const mb = edgeMidpoints(b)
  let best: [Point, Point] = [ma[0], mb[0]]
  let bestD = Infinity
  for (const p of ma) {
    for (const q of mb) {
      const d = dist2(p, q)
      if (d < bestD) {
        bestD = d
        best = [p, q]
      }
    }
  }
  return best
}

/** Endpoints pulled `gap` px off each edge towards the other end (collapses to the midpoint when too close). */
export function linkEndpoints(a: Rect, b: Rect, gap = LINK_GAP): [Point, Point] {
  const [p, q] = nearestEdgePair(a, b)
  const dx = q.x - p.x
  const dy = q.y - p.y
  const len = Math.hypot(dx, dy)
  if (len <= gap * 2 + 1) {
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
    return [mid, mid]
  }
  const ux = dx / len
  const uy = dy / len
  return [
    { x: p.x + ux * gap, y: p.y + uy * gap },
    { x: q.x - ux * gap, y: q.y - uy * gap },
  ]
}

export function chipWidth(word: string): number {
  return Math.ceil(word.length * CHAR_W + CHIP_PAD_X * 2)
}

// ── the layer ──────────────────────────────────────────────────────────────

interface LinkEls {
  hit: SVGLineElement
  line: SVGLineElement
  chip: SVGGElement | null
  x: SVGGElement | null
}

/** Rects of the two blocks of a link, or null when either is not drawable. */
function rectsFor(store: CanvasStore, link: Link, drawable: Set<string>, moved?: Set<string>, d?: Point): [Rect, Rect] | null {
  const s = store.get()
  const a = s.blocks.get(link.from_block_id)
  const b = s.blocks.get(link.to_block_id)
  if (!a || !b || !drawable.has(a.id) || !drawable.has(b.id)) return null
  const ra = rectOf(a)
  const rb = rectOf(b)
  if (moved && d) {
    if (moved.has(a.id)) {
      ra.x += d.x
      ra.y += d.y
    }
    if (moved.has(b.id)) {
      rb.x += d.x
      rb.y += d.y
    }
  }
  return [ra, rb]
}

function layout(els: LinkEls, rects: [Rect, Rect] | null): void {
  if (!rects) {
    els.line.setAttribute('visibility', 'hidden')
    els.hit.setAttribute('visibility', 'hidden')
    els.chip?.setAttribute('visibility', 'hidden')
    els.x?.setAttribute('visibility', 'hidden')
    return
  }
  const [p, q] = linkEndpoints(rects[0], rects[1])
  for (const el of [els.line, els.hit]) {
    el.setAttribute('x1', String(p.x))
    el.setAttribute('y1', String(p.y))
    el.setAttribute('x2', String(q.x))
    el.setAttribute('y2', String(q.y))
    el.removeAttribute('visibility')
  }
  const mx = (p.x + q.x) / 2
  const my = (p.y + q.y) / 2
  if (els.chip) {
    els.chip.setAttribute('transform', `translate(${mx}, ${my})`)
    els.chip.removeAttribute('visibility')
  }
  if (els.x) {
    els.x.setAttribute('transform', `translate(${mx}, ${my})`)
    els.x.removeAttribute('visibility')
  }
}

export const LinksLayer = forwardRef<LinksApi, { children?: never }>(function LinksLayer(_props, ref) {
  const { t } = useTheme()
  const store = useStore()
  const interactive = useInteractive()
  const [hovered, setHovered] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: string; at: Point } | null>(null)
  const elsRef = useRef<Map<string, LinkEls>>(new Map())

  // re-render only when the set of links or the geometry of a linked block changes
  const key = useCanvasStore((s) => {
    const parts: string[] = []
    for (const l of s.links.values()) {
      const a = s.blocks.get(l.from_block_id)
      const b = s.blocks.get(l.to_block_id)
      parts.push(`${l.id}:${l.word ?? ''}:${a ? `${a.x},${a.y},${a.w},${a.h},${a.deleted_at ? 1 : 0},${a.hidden ? 1 : 0}` : '-'}:${b ? `${b.x},${b.y},${b.w},${b.h},${b.deleted_at ? 1 : 0},${b.hidden ? 1 : 0}` : '-'}`)
    }
    return parts.join('|')
  })
  const links = useMemo(() => [...store.get().links.values()], [store, key]) // eslint-disable-line react-hooks/exhaustive-deps

  const drawable = useCallback((): Set<string> => new Set(store.renderable().map((b) => b.id)), [store])

  const redraw = useCallback(() => {
    const d = drawable()
    const s = store.get()
    for (const [id, els] of elsRef.current) {
      const link = s.links.get(id)
      layout(els, link ? rectsFor(store, link, d) : null)
    }
  }, [store, drawable])

  const updateFor = useCallback(
    (ids: Set<string>, delta: Point) => {
      const d = drawable()
      const s = store.get()
      for (const [id, els] of elsRef.current) {
        const link = s.links.get(id)
        if (!link) continue
        if (!ids.has(link.from_block_id) && !ids.has(link.to_block_id)) continue
        layout(els, rectsFor(store, link, d, ids, delta))
      }
    },
    [store, drawable]
  )

  useImperativeHandle(ref, () => ({ updateFor, redraw }), [updateFor, redraw])

  useLayoutEffect(() => {
    redraw()
  }, [redraw, key])

  const register = (id: string, part: keyof LinkEls) => (el: SVGLineElement | SVGGElement | null) => {
    const cur = elsRef.current.get(id) ?? { hit: null as unknown as SVGLineElement, line: null as unknown as SVGLineElement, chip: null, x: null }
    if (part === 'hit') cur.hit = el as SVGLineElement
    else if (part === 'line') cur.line = el as SVGLineElement
    else if (part === 'chip') cur.chip = el as SVGGElement | null
    else cur.x = el as SVGGElement | null
    if (!cur.hit && !cur.line) elsRef.current.delete(id)
    else elsRef.current.set(id, cur)
  }

  const remove = async (link: Link) => {
    const projectId = store.get().project.id
    // optimistic: the line disappears at once; put it back if the server refuses
    store.set((s) => {
      s.links.delete(link.id)
      s.links = new Map(s.links)
    })
    setHovered(null)
    try {
      await api.links.delete(projectId, link.id)
    } catch (e) {
      console.error('studio: link delete failed', e)
      store.set((s) => {
        s.links = new Map(s.links).set(link.id, link)
      })
    }
  }

  const openWord = (link: Link) => {
    const d = drawable()
    const rects = rectsFor(store, link, d)
    if (!rects) return
    const [p, q] = linkEndpoints(rects[0], rects[1])
    setEditing({ id: link.id, at: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } })
  }

  const ink = lineTokens.link(t)

  return (
    <>
      <svg
        data-links
        aria-hidden
        width={1}
        height={1}
        style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }}
      >
        {links.map((link) => {
          const hot = hovered === link.id
          const word = link.word?.trim().slice(0, WORD_MAX) ?? ''
          const color = hot ? t.tide : ink
          return (
            <g
              key={link.id}
              data-link-id={link.id}
              onPointerEnter={interactive ? () => setHovered(link.id) : undefined}
              onPointerLeave={interactive ? () => setHovered((h) => (h === link.id ? null : h)) : undefined}
            >
              <line
                ref={register(link.id, 'hit')}
                data-no-drag
                stroke="transparent"
                strokeWidth={14}
                style={{ pointerEvents: interactive ? 'stroke' : 'none', vectorEffect: 'non-scaling-stroke', cursor: 'default' }}
              />
              <line
                ref={register(link.id, 'line')}
                stroke={color}
                strokeWidth={1}
                style={{ vectorEffect: 'non-scaling-stroke', transition: 'stroke 120ms ease' }}
              />
              {word && !hot && (
                <g
                  ref={register(link.id, 'chip')}
                  data-no-drag
                  onClick={interactive ? (e) => { e.stopPropagation(); openWord(link) } : undefined}
                  style={{ pointerEvents: interactive ? 'auto' : 'none', cursor: interactive ? 'text' : 'default' }}
                >
                  <rect
                    x={-chipWidth(word) / 2}
                    y={-CHIP_H / 2}
                    width={chipWidth(word)}
                    height={CHIP_H}
                    rx={4}
                    fill={t.containerBg}
                    stroke={lineTokens.onPaper(t)}
                    strokeWidth={1}
                    style={{ vectorEffect: 'non-scaling-stroke' }}
                  />
                  <text
                    x={0}
                    y={0}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={t.textSecondary}
                    style={{ fontFamily: fonts.mono, fontSize: CHIP_FONT, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', userSelect: 'none' }}
                  >
                    {word}
                  </text>
                </g>
              )}
              {hot && (
                <g
                  ref={register(link.id, 'x')}
                  data-no-drag
                  role="button"
                  aria-label="remove link"
                  onClick={(e) => {
                    e.stopPropagation()
                    void remove(link)
                  }}
                  style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                >
                  <circle r={X_R} fill={t.containerBg} stroke={t.tide} strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }} />
                  <path d="M-3 -3 L3 3 M3 -3 L-3 3" stroke={t.tide} strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }} />
                  {word && (
                    <text
                      x={0}
                      y={-X_R - 6}
                      textAnchor="middle"
                      fill={alpha(t.textPrimary, 0.7)}
                      style={{ fontFamily: fonts.mono, fontSize: CHIP_FONT, letterSpacing: '0.08em', textTransform: 'uppercase', userSelect: 'none' }}
                    >
                      {word}
                    </text>
                  )}
                </g>
              )}
            </g>
          )
        })}
      </svg>
      {editing && (
        <LinkWordPopover
          linkId={editing.id}
          at={editing.at}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
})
