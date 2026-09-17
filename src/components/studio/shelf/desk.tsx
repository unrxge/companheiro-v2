'use client'

// studio/src/components/shelf/desk.tsx — the shelf (level 3), as a desk.
//
// Projects lie where they were left. A new one arrives straight, on the grid,
// because nothing should be handed to you already in a mess; after that the
// mess is yours to make, and the desk remembers it (studio_projects.shelf_x/y).
//
// Clicking one does not navigate: it flies into it. See surface/travel.tsx.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { Surface, ZoomPill, useCanvas, useFrame } from '@/components/studio/surface/surface'
import { useTravel } from '@/components/studio/surface/travel'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'
import { COMPLETED, statusLabel } from '@/components/studio/shelf/status'
import type { ShelfProject } from '@/lib/studio/types'
import {
  MARGIN, clampToWorld, deskSlot, freeSlot, tiltOf, toWorld, type Point,
} from '@/lib/studio/surface'

const CARD = { w: 264, h: 178 }
const GAP = 34
const COLS = 4
// A grid you zoom out on wants real room to scroll into on every side — at
// typical zoom-out levels the board's own MARGIN left the whole desk fitting
// inside the frame with space to spare, which the surface centres instead of
// letting you pan any further. 30% more than the board gets, on all sides.
const DESK_MARGIN = Math.round(MARGIN * 1.3)
const SPEC = { cardW: CARD.w, cardH: CARD.h, gap: GAP, cols: COLS, originX: DESK_MARGIN, originY: DESK_MARGIN }
// Straightening the desk glides rather than snaps — fast at first, easing to
// a stop — the same curve board.tsx uses for the same reason, so tidying
// looks and feels the same at every altitude that has it.
const TIDY_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const TIDY_MS = 450

/** The room a desk gets before anything has been dropped outside it. */
const ROOM = { w: DESK_MARGIN * 2 + COLS * (CARD.w + GAP), h: 20000 }

export interface Seating {
  seats: Map<string, { at: Point; placed: boolean }>
  /** Where the next thing to arrive should land. */
  next: Point
}

/**
 * Where each project sits: its own spot if it has one, the aligned grid if
 * not — and never on top of something already there, because a project hidden
 * under another project is a project you have lost.
 */
export function placements(projects: ShelfProject[]): Seating {
  const seats = new Map<string, { at: Point; placed: boolean }>()
  const taken: Point[] = []
  let slot = 0

  for (const p of projects) {
    if (typeof p.shelf_x === 'number' && typeof p.shelf_y === 'number') {
      const at = { x: p.shelf_x, y: p.shelf_y }
      seats.set(p.id, { at, placed: true })
      taken.push(at)
    }
  }
  for (const p of projects) {
    if (seats.has(p.id)) continue
    const at = freeSlot(deskSlot(slot++, SPEC), taken, SPEC, ROOM)
    seats.set(p.id, { at, placed: false })
    taken.push(at)
  }

  return { seats, next: freeSlot(deskSlot(slot, SPEC), taken, SPEC, ROOM) }
}

export function Desk({
  projects,
  onNew,
  onMove,
}: {
  projects: ShelfProject[]
  onNew: () => void
  /** null, null puts it back on the aligned grid. */
  onMove: (id: string, at: Point | null) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const frame = useFrame(ref)
  const go = useTravel()

  const [drag, setDrag] = useState<{ id: string; at: Point } | null>(null)

  const { seats, next: newAt } = useMemo(() => placements(projects), [projects])

  const world = useMemo(() => {
    let right = DESK_MARGIN * 2 + COLS * (CARD.w + GAP)
    let bottom = DESK_MARGIN * 2 + CARD.h
    for (const { at } of seats.values()) {
      right = Math.max(right, at.x + CARD.w + DESK_MARGIN)
      bottom = Math.max(bottom, at.y + CARD.h + DESK_MARGIN)
    }
    // The empty slot for a new project always has somewhere to be.
    right = Math.max(right, newAt.x + CARD.w + DESK_MARGIN)
    bottom = Math.max(bottom, newAt.y + CARD.h + DESK_MARGIN)
    return { w: Math.max(right, frame.w || 0), h: Math.max(bottom, frame.h || 0) }
  }, [seats, newAt, frame])

  const canvas = useCanvas(ref, frame, world)

  const startDrag = useCallback((id: string, e: React.PointerEvent) => {
    const el = ref.current
    const seat = seats.get(id)
    if (!el || !seat) return
    const box = el.getBoundingClientRect()
    const grab = toWorld({ x: e.clientX - box.left, y: e.clientY - box.top }, canvas.pan, canvas.zoom)
    const offset = { x: grab.x - seat.at.x, y: grab.y - seat.at.y }
    let moved = false
    // Kept here rather than read back out of state: a setState updater runs
    // during render, and calling the parent's onMove from inside one is the
    // classic "update a component while rendering another" fault.
    let landed = seat.at
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    const move = (ev: PointerEvent) => {
      const now = toWorld({ x: ev.clientX - box.left, y: ev.clientY - box.top }, canvas.pan, canvas.zoom)
      landed = clampToWorld({ x: now.x - offset.x, y: now.y - offset.y }, CARD.w, CARD.h, world)
      if (Math.abs(landed.x - seat.at.x) > 3 || Math.abs(landed.y - seat.at.y) > 3) moved = true
      setDrag({ id, at: landed })
    }
    const up = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
      if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId)
      setDrag(null)
      if (moved) onMove(id, landed)
      else go(`/p/${id}`, 'in', target)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }, [canvas.pan, canvas.zoom, go, onMove, seats, world])

  // Land looking at the work, not at the top-left corner of an empty desk.
  const firstAt = projects.length > 0 ? seats.get(projects[0].id)?.at : undefined
  const homed = useRef(false)
  useEffect(() => {
    if (homed.current || frame.w === 0 || !firstAt) return
    homed.current = true
    canvas.jumpTo({ x: firstAt.x + CARD.w / 2, y: firstAt.y + CARD.h / 2 })
  }, [frame, firstAt, canvas])

  // The same spot the desk opens to, not the generic "back to the origin" —
  // otherwise the button would land somewhere the person never actually saw.
  const goHome = useCallback(() => {
    if (firstAt) canvas.glideTo({ x: firstAt.x + CARD.w / 2, y: firstAt.y + CARD.h / 2 })
    else canvas.resetView()
  }, [canvas, firstAt])

  return (
    <Surface
      canvas={canvas}
      innerRef={ref}
      ariaLabel="The shelf — every project, where you left it"
      chrome={
        <>
          <ZoomPill canvas={canvas} onHome={goHome} />
          <DeskTools
            onNew={onNew}
            onTidy={projects.some((p) => p.shelf_x !== null) ? () => projects.forEach((p) => onMove(p.id, null)) : null}
          />
        </>
      }
    >
      {projects.map((p) => {
        const seat = seats.get(p.id)
        if (!seat) return null
        const held = drag?.id === p.id
        const at = held ? drag.at : seat.at
        return (
          <Folder
            key={p.id}
            project={p}
            at={at}
            tilt={seat.placed ? tiltOf(p.id) : 0}
            held={held}
            onPointerDown={(e) => startDrag(p.id, e)}
          />
        )
      })}

      <EmptySlot at={newAt} onClick={onNew} />
    </Surface>
  )
}

// ── one project ─────────────────────────────────────────────────────────────

function Folder({
  project, at, tilt, held, onPointerDown,
}: {
  project: ShelfProject
  at: Point
  tilt: number
  held: boolean
  onPointerDown: (e: React.PointerEvent) => void
}) {
  const { t } = useTheme()
  const [hover, setHover] = useState(false)
  const resting = project.status !== 'active'
  const done = COMPLETED.has(project.status)
  const excerpt = (project.concept_body ?? '').trim()

  return (
    <div
      data-hold
      role="button"
      tabIndex={0}
      aria-label={project.title || 'Untitled project'}
      onPointerDown={onPointerDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute', left: at.x, top: at.y, width: CARD.w, height: CARD.h,
        transform: `rotate(${tilt}deg) translateZ(0) scale(${held ? 1.04 : hover ? 1.015 : 1})`,
        transformOrigin: '50% 50%',
        transition: held
          ? 'none'
          : `transform 160ms cubic-bezier(0.2,0.7,0.2,1), box-shadow 160ms ease, left ${TIDY_MS}ms ${TIDY_EASE}, top ${TIDY_MS}ms ${TIDY_EASE}`,
        cursor: held ? 'grabbing' : 'pointer',
        zIndex: held ? 30 : 1,
        touchAction: 'none',
        // dragging a folder must not paint half its description blue
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      {/* the tab, so it reads as a folder on a desk and not a row in a list */}
      <div
        aria-hidden
        style={{
          position: 'absolute', left: 14, top: -9, width: 78, height: 14,
          background: t.cardBgInner,
          borderRadius: '6px 10px 0 0',
          boxShadow: held ? t.containerShadow : t.shadow,
        }}
      />
      <div
        style={{
          position: 'relative', height: '100%', boxSizing: 'border-box',
          display: 'flex', flexDirection: 'column', gap: 8,
          background: t.cardBg, borderRadius: radius.card, padding: 18,
          boxShadow: held ? t.containerShadow : t.shadow,
          border: `1px solid ${hover || held ? alpha(t.textPrimary, 0.16) : 'transparent'}`,
          opacity: done ? 0.72 : 1,
        }}
      >
        <h3
          style={{
            ...canvasType.title, color: t.textPrimary, margin: 0, maxHeight: '2.5em',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}
        >
          {project.title || 'Untitled project'}
        </h3>

        {excerpt && (
          <p
            style={{
              ...canvasType.small, color: t.textSecondary, margin: 0, maxHeight: '4.5em',
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
            }}
          >
            {excerpt}
          </p>
        )}

        {resting && (
          <span style={{ ...canvasType.chip, color: t.textMuted, marginTop: 'auto' }}>
            {statusLabel(project, new Date())}
          </span>
        )}
      </div>
    </div>
  )
}

function EmptySlot({ at, onClick }: { at: Point; onClick: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      data-hold
      type="button"
      aria-label="Start a new project"
      title="Start a new project"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute', left: at.x, top: at.y, width: CARD.w, height: CARD.h,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', cursor: 'pointer',
        border: `1px dashed ${alpha(shell.text, hover ? 0.3 : 0.14)}`,
        borderRadius: radius.card,
        color: hover ? shell.text : shell.muted,
        transition: 'border-color 160ms ease, color 160ms ease',
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      <span style={{ position: 'absolute', clip: 'rect(0 0 0 0)', width: 1, height: 1, overflow: 'hidden' }}>
        New project
      </span>
      {hover && (
        <span style={{ ...canvasType.chip, position: 'absolute', bottom: 14, color: shell.muted }}>
          New project
        </span>
      )}
    </button>
  )
}

// ── the desk's own two buttons ──────────────────────────────────────────────

function DeskTools({ onNew, onTidy }: { onNew: () => void; onTidy: (() => void) | null }) {
  return (
    <div data-hold style={{ position: 'absolute', right: 16, bottom: 16, zIndex: 6, display: 'flex', gap: 8 }}>
      {onTidy && (
        <Tool label="Straighten the desk" onClick={onTidy}>
          <line x1="4" y1="7" x2="20" y2="7" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="17" x2="14" y2="17" />
        </Tool>
      )}
      <Tool label="Start a new project" onClick={onNew} strong>
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </Tool>
    </div>
  )
}

function Tool({
  label, onClick, children, strong = false,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
  strong?: boolean
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 40, height: 40, borderRadius: 999, padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: `1px solid ${strong ? 'transparent' : shell.line}`,
        background: strong ? shell.text : 'rgba(13,12,11,0.74)',
        backdropFilter: strong ? undefined : 'blur(18px) saturate(1.1)',
        color: strong ? shell.ink : shell.muted,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
        {children}
      </svg>
    </button>
  )
}
