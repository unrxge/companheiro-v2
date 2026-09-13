'use client'

// studio/src/components/canvas/blocks/text/timeline.tsx — the timeline block
// (6.2, D-016, D-035). Rows are the update blocks with `stacked_in === this.id`
// (store.childrenStacked), newest first: a 56 px mono date column + the first
// line of the words (one line, clamped), rows separated by line.onPaper. Six
// rows fold, then a mono `n more` line that opens the dock's full list; the
// phone sheet shows every row. Each row carries a data-no-drag drag handle:
// a click unstacks the row beside the timeline, a drag (4 px threshold) drops it
// at the pointer — both clear `stacked_in` and place it by hand (D-035).
//
// The eyebrow (UPDATES · 6 · 3–12 SEP) needs the rows, so this renderer owns its
// first row (registered eyebrow: 'none') and draws it like the shell would.
//
// Gap (lane B): 5.9 names an UnstackCommand; CanvasActions has no unstack, so
// the row is written through store.applyPatch (full row, dirty) — undo will
// not see it until B routes `unstackRow` through its command stack.

import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { GripVertical } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { shell } from '@/lib/design-tokens'
import { canvasType, geometry, line, pencil, zIndex } from '@/lib/studio/canvas-tokens'
import { useChildrenStacked, useInteractive, useStore } from '@/lib/studio/hooks'
import { registry } from '@/lib/studio/registry'
import { createEmptyPatch, type CanvasStore } from '@/lib/studio/store'
import type { AnyBlock, Point } from '@/lib/studio/types'
import { snap8, useActions, type CanvasActions } from '@/components/canvas/actions'
import type { BlockOf, BlockRendererProps } from '@/components/canvas/blocks/registry'
import { firstLineOf, shortDate } from '@/components/canvas/blocks/fallback-block'
import { nudgeSave } from '@/components/canvas/blocks/text/note'

export const TIMELINE_FOLD = 6
export const TIMELINE_EMPTY = 'nothing stacked here yet'
const DRAG_THRESHOLD = 4

export type UpdateRow = BlockOf<'update'>

const saidAt = (r: UpdateRow) => r.content.said_at || r.created_at

/** Newest first by said_at (created_at breaks ties). */
export function sortRows(rows: AnyBlock[]): UpdateRow[] {
  const updates = rows.filter((r): r is UpdateRow => r.type === 'update')
  return [...updates].sort((a, b) => saidAt(b).localeCompare(saidAt(a)) || b.created_at.localeCompare(a.created_at))
}

/** The stacked update rows of a timeline block, newest first. */
export function useTimelineRows(timelineId: string): UpdateRow[] {
  const children = useChildrenStacked(timelineId)
  return useMemo(() => sortRows(children), [children])
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** `12 sep` · `3–12 sep` · `28 aug – 12 sep` (years only when they differ from now, via shortDate). */
export function dateRange(rows: UpdateRow[], now = new Date()): string {
  if (rows.length === 0) return ''
  const newest = new Date(saidAt(rows[0]))
  const oldest = new Date(saidAt(rows[rows.length - 1]))
  if (Number.isNaN(newest.getTime()) || Number.isNaN(oldest.getTime())) return ''
  const sameYear = newest.getFullYear() === oldest.getFullYear() && newest.getFullYear() === now.getFullYear()
  if (sameYear && newest.getMonth() === oldest.getMonth()) {
    if (newest.getDate() === oldest.getDate()) return `${newest.getDate()} ${MONTHS[newest.getMonth()]}`
    return `${oldest.getDate()}–${newest.getDate()} ${MONTHS[newest.getMonth()]}`
  }
  return `${shortDate(oldest.toISOString(), now)} – ${shortDate(newest.toISOString(), now)}`
}

/** `updates · 6 · 3–12 sep` (uppercase is applied by the eyebrow style). */
export function timelineEyebrow(rows: UpdateRow[], now = new Date()): string {
  const parts = ['updates']
  if (rows.length > 0) {
    parts.push(String(rows.length))
    const range = dateRange(rows, now)
    if (range) parts.push(range)
  }
  return parts.join(' · ')
}

/**
 * Take a row out of its timeline and place it by hand: at `at` (world px, the
 * row's top edge under the pointer) or, without a point, just right of the
 * timeline. Selects the freed block.
 */
export function unstackRow(store: CanvasStore, actions: CanvasActions | null, row: UpdateRow, at: Point | null): void {
  const live = store.get().blocks.get(row.id)
  if (!live || live.type !== 'update' || live.deleted_at) return
  const spec = registry.update
  const w = live.w >= spec.minW && live.w <= spec.maxW ? live.w : spec.defaultW
  const timeline = live.stacked_in ? store.get().blocks.get(live.stacked_in) : undefined
  const x = at ? snap8(at.x - w / 2) : snap8(timeline ? timeline.x + timeline.w + 24 : live.x)
  const y = at ? snap8(at.y - geometry.paperPadding) : snap8(timeline ? timeline.y : live.y)
  const z = store.liveBlocks().reduce((m, b) => Math.max(m, b.z), 0) + 1
  const next: AnyBlock = {
    ...live,
    x,
    y,
    w,
    z,
    stacked_in: null,
    placed_by: 'person',
    arrival_state: 'placed',
    updated_at: new Date().toISOString(),
  }
  const p = createEmptyPatch()
  p.upserts.set(next.id, next)
  store.applyPatch(p)
  actions?.select([next.id])
  nudgeSave(actions)
}

/** Screen point → world point through the stage's viewport; null when the point is outside the stage. */
export function stagePointToWorld(store: CanvasStore, clientX: number, clientY: number): Point | null {
  if (typeof document === 'undefined') return null
  const stage = document.querySelector('[data-stage]')
  if (!stage) return null
  const r = stage.getBoundingClientRect()
  if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) return null
  const v = store.get().viewport
  return { x: (clientX - r.left - v.tx) / v.k, y: (clientY - r.top - v.ty) / v.k }
}

// ── the drag handle ────────────────────────────────────────────────────────

function UnstackHandle({ label, onClick, onDrop }: { label: string; onClick: () => void; onDrop: (clientX: number, clientY: number) => void }) {
  const { t } = useTheme()
  const start = useRef<Point | null>(null)
  const [ghost, setGhost] = useState<Point | null>(null)

  const reset = () => {
    start.current = null
    setGhost(null)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const s = start.current
    if (!s) return
    if (ghost || Math.hypot(e.clientX - s.x, e.clientY - s.y) > DRAG_THRESHOLD) setGhost({ x: e.clientX, y: e.clientY })
  }
  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (!start.current) return
    const dragged = !!ghost
    e.currentTarget.releasePointerCapture(e.pointerId)
    reset()
    if (dragged) onDrop(e.clientX, e.clientY)
    else onClick()
  }

  return (
    <>
      <button
        type="button"
        data-no-drag
        aria-label={`unstack: ${label}`}
        title="drag out, or click to unstack"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={reset}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onClick()
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: t.textMuted,
          cursor: ghost ? 'grabbing' : 'grab',
          flexShrink: 0,
          touchAction: 'none',
          alignSelf: 'center',
        }}
      >
        <GripVertical size={12} strokeWidth={1.5} />
      </button>
      {ghost &&
        createPortal(
          <div
            aria-hidden
            style={{
              position: 'fixed',
              left: ghost.x + 12,
              top: ghost.y + 12,
              zIndex: zIndex.dialog,
              pointerEvents: 'none',
              ...canvasType.meta,
              color: shell.text,
              backgroundColor: pencil.labelPill.bg,
              padding: '4px 8px',
              borderRadius: 6,
              maxWidth: 240,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </div>,
          document.body
        )}
    </>
  )
}

// ── rows ───────────────────────────────────────────────────────────────────

/** The rows on paper (block and phone sheet). `handles` adds the unstack grip. */
export function TimelineRows({
  rows,
  handles = false,
  onUnstack,
}: {
  rows: UpdateRow[]
  handles?: boolean
  onUnstack?: (row: UpdateRow, clientX: number | null, clientY: number | null) => void
}) {
  const { t } = useTheme()
  if (rows.length === 0) {
    return <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>{TIMELINE_EMPTY}</p>
  }
  return (
    <div>
      {rows.map((r, i) => {
        const struck = !!r.struck_at
        const first = firstLineOf(r)
        return (
          <div
            key={r.id}
            data-row-id={r.id}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 12,
              padding: '8px 0',
              borderTop: i === 0 ? 'none' : `1px solid ${line.onPaper(t)}`,
              opacity: struck ? 0.45 : 1,
              minWidth: 0,
            }}
          >
            <span style={{ ...canvasType.meta, color: t.textMuted, width: 56, flexShrink: 0, whiteSpace: 'nowrap' }}>{shortDate(saidAt(r))}</span>
            <span
              style={{
                ...canvasType.body,
                color: t.textPrimary,
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textDecoration: struck ? 'line-through' : 'none',
                textDecorationColor: t.ember,
              }}
            >
              {first}
            </span>
            {handles && onUnstack && (
              <UnstackHandle label={first} onClick={() => onUnstack(r, null, null)} onDrop={(x, y) => onUnstack(r, x, y)} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── the block ──────────────────────────────────────────────────────────────

export function TimelineBlock({ block, phone }: BlockRendererProps<'timeline'>) {
  const { t } = useTheme()
  const store = useStore()
  const actions = useActions()
  const interactive = useInteractive()
  const rows = useTimelineRows(block.id)
  const shown = rows.slice(0, TIMELINE_FOLD)
  const more = rows.length - shown.length
  const title = block.content.title?.trim() ?? ''
  const handles = interactive && !phone && !block.locked

  const openFullList = () => {
    actions?.select([block.id])
    store.set((s) => {
      s.dock = { ...s.dock, right: 'selection' }
    })
  }

  const unstack = (row: UpdateRow, clientX: number | null, clientY: number | null) => {
    if (!interactive) return
    const at = clientX !== null && clientY !== null ? stagePointToWorld(store, clientX, clientY) : null
    if (clientX !== null && !at) return // dropped outside the stage: nothing happens
    unstackRow(store, actions, row, at)
  }

  return (
    <div>
      <div
        data-eyebrow
        style={{
          ...canvasType.eyebrow,
          color: t.textMuted,
          height: geometry.eyebrowH,
          marginBottom: geometry.eyebrowGap,
          display: 'flex',
          alignItems: 'center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {timelineEyebrow(rows)}
      </div>
      {title && <div style={{ ...canvasType.title, color: t.textPrimary, marginBottom: 8, wordBreak: 'break-word' }}>{title}</div>}
      <TimelineRows rows={shown} handles={handles} onUnstack={unstack} />
      {more > 0 &&
        (phone || !interactive ? (
          <div style={{ ...canvasType.meta, color: t.textMuted, marginTop: 8 }}>{more} more</div>
        ) : (
          <button
            type="button"
            data-no-drag
            onClick={(e) => {
              e.stopPropagation()
              openFullList()
            }}
            style={{ ...canvasType.meta, color: t.textMuted, background: 'none', border: 'none', padding: 0, marginTop: 8, cursor: 'pointer' }}
          >
            {more} more
          </button>
        ))}
    </div>
  )
}
