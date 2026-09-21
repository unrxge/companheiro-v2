'use client'

// src/components/studio/shelf/desk.tsx — the Project Board's folders.
//
// One folder per project, plus one for the idea still being explored in Idea
// Lab. Left alone they lie on a grid in the order they were last opened: the
// top-left folder is the one you touched most recently, and the rest run away
// from it, newest to oldest. Drag any folder wherever you like and it stays
// there; "Arrange" puts everything back on the grid. Hover a folder for a bin
// button (or press Delete on it, or long-press on touch) to remove it.
//
// One screenful is 4 columns by 3 rows on a portrait screen and 5 by 2 on a
// landscape one (lib/studio/shelf-view.ts). More folders scroll downward; the
// board never grows wider, and it never zooms out past 100%.
//
// The canvas is only the area under the page header (see board-view.tsx), so
// scrolling hides folders behind the header's edge instead of under its text.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Surface, ZoomPill, useCanvas, useFrame } from '@/components/studio/surface/surface'
import { useTravel } from '@/components/studio/surface/travel'
import { useTheme } from '@/components/theme/theme-provider'
import { FolderIcon } from '@/components/studio/shelf/folder-icon'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, shell } from '@/lib/design-tokens'
import { clampToWorld, freeSlot, tiltOf, toWorld } from '@/lib/studio/surface'
import {
  decodePosition, encodePosition, gridFor, hoverLines, slotAt, type BoardItem, type Grid, type Pt,
} from '@/lib/studio/shelf-view'

// Arranging glides folders home rather than snapping them.
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const GLIDE_MS = 450

interface Seats {
  at: Map<string, Pt>
  world: { w: number; h: number }
}

/** Where every folder sits: its own saved spot if it has one, otherwise the
 *  next place on the recency grid — and never on top of something else, since
 *  a folder hidden under another folder is a folder you have lost. */
function seat(items: BoardItem[], g: Grid, frame: { w: number; h: number }): Seats {
  // freeSlot treats anything within 4px as touching, so cells that sit exactly
  // one pitch apart need 8px shaved off to count as neighbours, not overlaps.
  const spec = { cardW: g.pitchX - 8, cardH: g.pitchY - 8, gap: 8, cols: g.cols }
  const roomy = { w: frame.w, h: g.topPad + (items.length + g.cols) * g.pitchY + g.bottomPad }
  const at = new Map<string, Pt>()
  const taken: Pt[] = []

  items.forEach((item) => {
    const saved = decodePosition(item.shelfX, item.shelfY, frame.w, g.pitchY)
    if (!saved) return
    const p = clampToWorld(saved, g.pitchX, g.pitchY, roomy)
    at.set(item.id, p)
    taken.push(p)
  })
  items.forEach((item, i) => {
    if (at.has(item.id)) return
    const p = freeSlot(slotAt(i, g), taken, spec, roomy)
    at.set(item.id, p)
    taken.push(p)
  })

  let bottom = g.topPad + Math.ceil(items.length / g.cols) * g.pitchY
  for (const p of at.values()) bottom = Math.max(bottom, p.y + g.pitchY)
  return { at, world: { w: frame.w, h: Math.max(frame.h, bottom + g.bottomPad) } }
}

export function Desk({
  items,
  onNew,
  onMove,
  onArrange,
  onDelete,
}: {
  items: BoardItem[]
  onNew: () => void
  /** Saved as the board's own units, not pixels — see encodePosition. */
  onMove: (id: string, saved: { x: number; y: number }) => void
  onArrange: () => void
  /** Asks first — the page owns the confirmation. */
  onDelete: (item: BoardItem) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const frame = useFrame(ref)
  const router = useRouter()
  const go = useTravel()

  const grid = useMemo(() => gridFor(frame.w, frame.h), [frame.w, frame.h])
  const { at: seats, world } = useMemo(() => seat(items, grid, frame), [items, grid, frame])
  const canvas = useCanvas(ref, frame, world, { minZoom: 1 })

  const [drag, setDrag] = useState<{ id: string; at: Pt } | null>(null)

  const open = useCallback((item: BoardItem, el: HTMLElement) => {
    if (item.kind === 'draft') router.push(`/idea-lab/conceptualise?resume=${item.id}`)
    else go(`/p/${item.id}`, 'in', el)
  }, [go, router])

  const startDrag = useCallback((item: BoardItem, e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current
    const from = seats.get(item.id)
    const target = e.currentTarget
    if (!el || !from || e.button !== 0) return

    // An idea still in Idea Lab has nowhere to save a position, so it never
    // moves; it just opens.
    const movable = item.kind === 'project'
    const box = el.getBoundingClientRect()
    const grab = toWorld({ x: e.clientX - box.left, y: e.clientY - box.top }, canvas.pan, canvas.zoom)
    const offset = { x: grab.x - from.x, y: grab.y - from.y }
    let moved = false
    let fired = false
    // Kept here, not read back out of state: a setState updater runs during
    // render, and calling the parent's onMove from inside one is the classic
    // "update a component while rendering another" fault.
    let landed = from
    if (movable) target.setPointerCapture(e.pointerId)

    // No hover on a touchscreen, so holding a folder is how you get to delete it.
    const hold = e.pointerType === 'mouse'
      ? undefined
      : window.setTimeout(() => { fired = true; finish(); setDrag(null); onDelete(item) }, 550)

    const move = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) > 6) window.clearTimeout(hold)
      if (!movable) return
      const now = toWorld({ x: ev.clientX - box.left, y: ev.clientY - box.top }, canvas.pan, canvas.zoom)
      landed = clampToWorld({ x: now.x - offset.x, y: now.y - offset.y }, grid.pitchX, grid.pitchY, world)
      if (Math.abs(landed.x - from.x) > 4 || Math.abs(landed.y - from.y) > 4) moved = true
      setDrag({ id: item.id, at: landed })
    }
    const finish = () => {
      window.clearTimeout(hold)
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
      if (movable && target.hasPointerCapture(e.pointerId)) target.releasePointerCapture(e.pointerId)
    }
    function up(ev: PointerEvent) {
      finish()
      setDrag(null)
      if (fired || ev.type === 'pointercancel') return
      if (movable && moved) onMove(item.id, encodePosition(landed, world.w, grid.pitchY))
      else if (Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY) <= 6) open(item, target)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }, [canvas.pan, canvas.zoom, grid.pitchX, grid.pitchY, onDelete, onMove, open, seats, world])

  // The folder under the pointer, and where it is on screen right now. Both
  // are re-measured as the canvas moves, so the tooltip follows a folder that
  // is being scrolled past instead of hanging where it used to be.
  const cells = useRef(new Map<string, HTMLElement>())
  const [hoverId, setHoverId] = useState<string | null>(null)
  // A short beat before the card appears, so sweeping across the board does
  // not flash one up for every folder the pointer passes over.
  const hoverTimer = useRef<number | undefined>(undefined)
  const hover = useCallback((id: string, on: boolean) => {
    window.clearTimeout(hoverTimer.current)
    if (on) hoverTimer.current = window.setTimeout(() => setHoverId(id), 140)
    else setHoverId((cur) => (cur === id ? null : cur))
  }, [])
  useEffect(() => () => window.clearTimeout(hoverTimer.current), [])
  const [rect, setRect] = useState<DOMRect | null>(null)
  useLayoutEffect(() => {
    const el = hoverId ? cells.current.get(hoverId) : null
    setRect(el && !canvas.dragging && !drag ? el.getBoundingClientRect() : null)
  }, [hoverId, canvas.pan.x, canvas.pan.y, canvas.zoom, canvas.dragging, drag])
  const hovered = hoverId ? items.find((i) => i.id === hoverId) ?? null : null

  const anyPlaced = items.some((i) => decodePosition(i.shelfX, i.shelfY, frame.w, grid.pitchY))

  return (
    <>
      <Surface
        canvas={canvas}
        innerRef={ref}
        ariaLabel="The project board — every project and idea, most recently opened first"
        chrome={
          <>
            <ZoomPill canvas={canvas} onHome={canvas.resetView} />
            <Controls onNew={onNew} onArrange={anyPlaced ? onArrange : null} />
          </>
        }
      >
        {items.map((item) => {
          const held = drag?.id === item.id
          const at = held ? drag.at : seats.get(item.id)
          if (!at) return null
          return (
            <Folder
              key={`${item.kind}-${item.id}`}
              item={item}
              at={at}
              grid={grid}
              held={held}
              register={(el) => { if (el) cells.current.set(item.id, el); else cells.current.delete(item.id) }}
              onHover={(on) => hover(item.id, on)}
              onPointerDown={(e) => startDrag(item, e)}
              onKey={(el) => open(item, el)}
              onDelete={() => onDelete(item)}
            />
          )
        })}
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
  item, at, grid, held, register, onHover, onPointerDown, onKey, onDelete,
}: {
  item: BoardItem
  at: Pt
  grid: Grid
  held: boolean
  register: (el: HTMLElement | null) => void
  onHover: (on: boolean) => void
  onPointerDown: (e: React.PointerEvent<HTMLElement>) => void
  onKey: (el: HTMLElement) => void
  onDelete: () => void
}) {
  const { t } = useTheme()
  const [hover, setHover] = useState(false)
  const [focused, setFocused] = useState(false)
  const done = item.state === 'completed'
  const lift = held ? 1.08 : hover ? 1.04 : 1
  return (
    // The cell only positions the folder; it takes no pointer events itself,
    // so the gaps between folders are just canvas — they pan it and show nothing.
    <div
      style={{
        position: 'absolute', left: at.x, top: at.y, width: grid.pitchX, height: grid.pitchY,
        display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none',
        zIndex: held ? 30 : 1,
        transition: held ? 'none' : `left ${GLIDE_MS}ms ${EASE}, top ${GLIDE_MS}ms ${EASE}`,
      }}
    >
      <div
        ref={register}
        data-hold
        role="button"
        tabIndex={0}
        aria-label={`${item.title} — ${STATE_WORD[item.state]}`}
        aria-keyshortcuts="Delete"
        onPointerDown={onPointerDown}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onKey(e.currentTarget) }
          else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); onDelete() }
        }}
        onMouseEnter={() => { setHover(true); onHover(true) }}
        onMouseLeave={() => { setHover(false); onHover(false) }}
        onFocus={(e) => { setFocused(true); if (e.currentTarget.matches(':focus-visible')) onHover(true) }}
        onBlur={() => { setFocused(false); onHover(false) }}
        style={{
          position: 'relative', pointerEvents: 'auto',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          maxWidth: '100%', padding: 6, borderRadius: 14,
          cursor: held ? 'grabbing' : 'pointer', outline: 'none',
          boxShadow: focused ? `0 0 0 2px ${alpha(shell.text, 0.35)}` : 'none',
          userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'none',
        }}
      >
        <div
          style={{
            transform: `rotate(${tiltOf(item.id, 2)}deg) translateY(${held ? -4 : hover ? -3 : 0}px) scale(${lift})`,
            transition: held ? 'none' : 'transform 160ms cubic-bezier(0.2,0.7,0.2,1)',
          }}
        >
          <FolderIcon state={item.state} width={grid.iconW} />
        </div>
        <span
          style={{
            ...canvasType.small, fontSize: grid.fontSize, color: done ? shell.muted : shell.text, textAlign: 'center',
            lineHeight: 1.3, maxWidth: grid.pitchX * 0.94,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            textDecorationLine: hover ? 'underline' : 'none', textDecorationColor: alpha(shell.text, 0.35), textUnderlineOffset: 3,
          }}
        >
          {item.title}
        </span>

        {(hover || focused) && !held && (
          <button
            type="button"
            aria-label={item.kind === 'draft' ? 'Discard this idea' : `Delete ${item.title}`}
            title={item.kind === 'draft' ? 'Discard this idea' : 'Delete'}
            // this button must not start a drag or open the folder
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            style={{
              position: 'absolute', top: 2, right: 2, width: 26, height: 26, borderRadius: 999, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              background: 'rgba(13,12,11,0.78)', backdropFilter: 'blur(14px) saturate(1.1)',
              border: `1px solid ${shell.line}`, color: shell.muted,
              transition: 'color 140ms ease, border-color 140ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = t.danger; e.currentTarget.style.borderColor = alpha(t.danger, 0.5) }}
            onMouseLeave={(e) => { e.currentTarget.style.color = shell.muted; e.currentTarget.style.borderColor = shell.line }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16" />
              <path d="M9 7V4.5h6V7" />
              <path d="M6.5 7l.9 12a2 2 0 0 0 2 1.8h5.2a2 2 0 0 0 2-1.8l.9-12" />
              <path d="M10 11.5v5M14 11.5v5" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}

// ── the hover card ──────────────────────────────────────────────────────────

const TIP_W = 236

/** Drawn on the page, not inside the zoomed world, so it stays one readable
 *  size however the board is zoomed, and never gets clipped by it. */
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

// ── the board's own buttons ─────────────────────────────────────────────────

/** `onArrange` is null while nothing has been moved by hand — there is
 *  nothing to put back, so the button rests. */
function Controls({ onNew, onArrange }: { onNew: () => void; onArrange: (() => void) | null }) {
  return (
    <div data-hold style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
      <button
        type="button"
        aria-label="Arrange — put every folder back in order, most recently opened first"
        title="Put every folder back in order, most recently opened first"
        disabled={!onArrange}
        onClick={() => onArrange?.()}
        style={{
          height: 40, padding: '0 14px 0 12px', borderRadius: 999, cursor: onArrange ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', gap: 8,
          border: `1px solid ${shell.line}`, background: 'rgba(13,12,11,0.74)', backdropFilter: 'blur(18px) saturate(1.1)',
          color: shell.muted, opacity: onArrange ? 1 : 0.45, transition: 'opacity 160ms ease',
          ...canvasType.chip,
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
          <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
        </svg>
        Arrange
      </button>
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
