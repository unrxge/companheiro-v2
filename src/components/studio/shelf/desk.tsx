'use client'

// src/components/studio/shelf/desk.tsx — the Project Board's folders.
//
// One folder per project, plus one for the idea still being explored in Idea
// Lab. They lie on a grid in the order they were last opened: the folder in
// the top-left corner is always the one you touched most recently, and the
// rest run away from it, newest to oldest. Nothing here is hand-placed any
// more — the order is the meaning.
//
// The canvas is only the area under the page header (see the page), so
// scrolling a long board hides folders behind the header's edge instead of
// sliding them under its text.

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Surface, ZoomPill, useCanvas, useFrame } from '@/components/studio/surface/surface'
import { useTravel } from '@/components/studio/surface/travel'
import { FolderIcon } from '@/components/studio/shelf/folder-icon'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, shell } from '@/lib/design-tokens'
import { hoverLines, type BoardItem } from '@/lib/studio/shelf-view'

interface Metrics {
  cellW: number
  cellH: number
  iconW: number
  gapX: number
  gapY: number
  top: number
  edge: number
}

// Folders need air between them; the old card grid sat 34px apart.
const ROOMY: Metrics = { cellW: 190, cellH: 178, iconW: 150, gapX: 64, gapY: 52, top: 64, edge: 32 }
const COMPACT: Metrics = { cellW: 148, cellH: 150, iconW: 118, gapX: 26, gapY: 40, top: 44, edge: 16 }

export interface Layout {
  cols: number
  world: { w: number; h: number }
  at: (index: number) => { x: number; y: number }
  m: Metrics
}

/** Where each folder goes, given the width of the window it is looking through. */
export function layoutFor(count: number, frameW: number, frameH: number): Layout {
  const m = frameW > 0 && frameW < 600 ? COMPACT : ROOMY
  const room = Math.max(m.cellW, frameW - m.edge * 2)
  const cols = Math.max(1, Math.floor((room + m.gapX) / (m.cellW + m.gapX)))
  const gridW = cols * m.cellW + (cols - 1) * m.gapX
  const originX = Math.max(m.edge, Math.round((frameW - gridW) / 2))
  const rows = Math.max(1, Math.ceil(count / cols))
  const at = (i: number) => ({
    x: originX + (i % cols) * (m.cellW + m.gapX),
    y: m.top + Math.floor(i / cols) * (m.cellH + m.gapY),
  })
  const right = originX + gridW + originX
  // Space under the last row clears the corner controls and the bottom fade.
  const bottom = m.top + rows * m.cellH + (rows - 1) * m.gapY + 110
  return { cols, m, at, world: { w: Math.max(right, frameW), h: Math.max(bottom, frameH) } }
}

export function Desk({
  items,
  onNew,
}: {
  items: BoardItem[]
  onNew: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const frame = useFrame(ref)
  const router = useRouter()
  const go = useTravel()

  const layout = useMemo(() => layoutFor(items.length, frame.w, frame.h), [items.length, frame.w, frame.h])
  const canvas = useCanvas(ref, frame, layout.world)

  const open = useCallback((item: BoardItem, el: HTMLElement) => {
    if (item.kind === 'draft') router.push(`/idea-lab/conceptualise?resume=${item.id}`)
    else go(`/p/${item.id}`, 'in', el)
  }, [go, router])

  // The folder under the pointer, and where it is on screen right now. Both
  // are re-measured as the canvas moves, so the tooltip follows a folder that
  // is being scrolled past instead of hanging where it used to be.
  const cells = useRef(new Map<string, HTMLElement>())
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    const el = hoverId ? cells.current.get(hoverId) : null
    setRect(el && !canvas.dragging ? el.getBoundingClientRect() : null)
  }, [hoverId, canvas.pan.x, canvas.pan.y, canvas.zoom, canvas.dragging])
  const hovered = hoverId ? items.find((i) => i.id === hoverId) ?? null : null

  return (
    <>
      <Surface
        canvas={canvas}
        innerRef={ref}
        ariaLabel="The project board — every project and idea, most recently opened first"
        chrome={
          <>
            <ZoomPill canvas={canvas} onHome={canvas.resetView} />
            <NewButton onNew={onNew} />
          </>
        }
      >
        {items.map((item, i) => (
          <Folder
            key={`${item.kind}-${item.id}`}
            item={item}
            at={layout.at(i)}
            m={layout.m}
            register={(el) => { if (el) cells.current.set(item.id, el); else cells.current.delete(item.id) }}
            onHover={(on) => setHoverId((cur) => (on ? item.id : cur === item.id ? null : cur))}
            onOpen={(el) => open(item, el)}
          />
        ))}
      </Surface>
      {hovered && rect && <Tooltip item={hovered} rect={rect} />}
    </>
  )
}

// ── one folder ──────────────────────────────────────────────────────────────

const STATE_WORD = {
  undeclared: 'idea, not yet declared',
  queued: 'in the queue',
  active: 'in progress',
  completed: 'completed',
} as const

function Folder({
  item, at, m, register, onHover, onOpen,
}: {
  item: BoardItem
  at: { x: number; y: number }
  m: Metrics
  register: (el: HTMLElement | null) => void
  onHover: (on: boolean) => void
  onOpen: (el: HTMLElement) => void
}) {
  const [hover, setHover] = useState(false)
  const done = item.state === 'completed'
  return (
    <div
      ref={register}
      data-hold
      role="button"
      tabIndex={0}
      aria-label={`${item.title} — ${STATE_WORD[item.state]}`}
      onClick={(e) => onOpen(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(e.currentTarget) }
      }}
      onMouseEnter={() => { setHover(true); onHover(true) }}
      onMouseLeave={() => { setHover(false); onHover(false) }}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      style={{
        position: 'absolute', left: at.x, top: at.y, width: m.cellW, height: m.cellH,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
        cursor: 'pointer', outline: 'none', userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      <div
        style={{
          transform: `translateY(${hover ? -3 : 0}px) scale(${hover ? 1.04 : 1})`,
          transition: 'transform 160ms cubic-bezier(0.2,0.7,0.2,1)',
        }}
      >
        <FolderIcon state={item.state} width={m.iconW} />
      </div>
      <span
        style={{
          ...canvasType.small, color: done ? shell.muted : shell.text, textAlign: 'center',
          maxWidth: '100%', lineHeight: 1.3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          textDecorationLine: hover ? 'underline' : 'none', textDecorationColor: alpha(shell.text, 0.35), textUnderlineOffset: 3,
        }}
      >
        {item.title}
      </span>
    </div>
  )
}

// ── the hover card ──────────────────────────────────────────────────────────

const TIP_W = 236

/** Drawn on the page, not inside the zoomed world, so it stays one readable
 *  size however far out the board is, and never gets clipped by it. */
function Tooltip({ item, rect }: { item: BoardItem; rect: DOMRect }) {
  if (typeof document === 'undefined') return null
  const lines = hoverLines(item)
  const below = rect.top < 150
  const half = TIP_W / 2 + 12
  const left = Math.min(window.innerWidth - half, Math.max(half, rect.left + rect.width / 2))
  return createPortal(
    <div
      role="tooltip"
      style={{
        position: 'fixed', left, top: below ? rect.bottom + 6 : rect.top - 6,
        transform: below ? 'translateX(-50%)' : 'translate(-50%, -100%)',
        width: TIP_W, zIndex: 80, pointerEvents: 'none',
        padding: '12px 14px', borderRadius: 12,
        background: 'rgba(13,12,11,0.92)', backdropFilter: 'blur(14px) saturate(1.1)',
        border: `1px solid ${shell.line}`, boxShadow: '0 12px 30px rgba(0,0,0,0.45)',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      {lines.map((l) => (
        <div key={l.label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ ...canvasType.chip, color: shell.muted }}>{l.label}</span>
          <span style={{ ...canvasType.small, color: shell.text }}>{l.value}</span>
        </div>
      ))}
    </div>,
    document.body,
  )
}

// ── the board's one button ──────────────────────────────────────────────────

function NewButton({ onNew }: { onNew: () => void }) {
  return (
    <div data-hold style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 6 }}>
      <button
        type="button"
        aria-label="Start a new idea"
        title="Start a new idea"
        onClick={onNew}
        style={{
          width: 40, height: 40, borderRadius: 999, padding: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid transparent', background: shell.text, color: shell.ink,
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  )
}
