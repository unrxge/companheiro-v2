'use client'

// A list whose rows can be dragged into another order, by their own grip.
//
// Dragging is deliberately not offered everywhere a task is shown: on the
// canvas a task list is a glance, and a row that moves under the finger would
// fight the card it sits on, which is itself something you drag. It is offered
// in the larger view, where the list is the only thing on screen.

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { alpha } from '@/lib/design-tokens'
import { dropIndex, moveItem } from '@/lib/studio/reorder'

export interface SortableRow {
  id: string
  node: ReactNode
}

export function SortableList({
  rows, onReorder, disabled = false, label,
}: {
  rows: SortableRow[]
  /** The ids in their new order. */
  onReorder: (ids: string[]) => void
  disabled?: boolean
  /** What one row is called, for the grip's name. */
  label?: string
}) {
  const { t } = useTheme()
  const list = useRef<HTMLUListElement | null>(null)
  const [drag, setDrag] = useState<{ id: string; from: number; to: number; dy: number } | null>(null)
  const geometry = useRef<{ tops: number[]; heights: number[] } | null>(null)

  const measure = useCallback(() => {
    const el = list.current
    if (!el) return
    const items = [...el.children] as HTMLElement[]
    geometry.current = {
      tops: items.map((li) => li.offsetTop),
      heights: items.map((li) => li.offsetHeight),
    }
  }, [])

  useLayoutEffect(() => { measure() }, [measure, rows.length])

  const start = (id: string, index: number) => (e: React.PointerEvent) => {
    if (disabled || rows.length < 2) return
    e.preventDefault()
    e.stopPropagation()
    measure()
    const startY = e.clientY
    const base = geometry.current
    if (!base) return
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)

    const move = (ev: PointerEvent) => {
      const dy = ev.clientY - startY
      const within = base.tops[index] + dy + base.heights[index] / 2
      setDrag({ id, from: index, to: dropIndex(base.tops, base.heights, index, within), dy })
    }
    const end = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end)
      setDrag((cur) => {
        if (cur && cur.to !== cur.from) onReorder(moveItem(rows, cur.from, cur.to).map((r) => r.id))
        return null
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    setDrag({ id, from: index, to: index, dy: 0 })
  }

  /** How far a row that is not the one being dragged has to step aside. */
  const shiftOf = (index: number): number => {
    if (!drag || !geometry.current) return 0
    const { from, to } = drag
    if (index === from || from === to) return 0
    const h = geometry.current.heights[from] ?? 0
    if (from < to && index > from && index <= to) return -h
    if (from > to && index >= to && index < from) return h
    return 0
  }

  return (
    <ul ref={list} style={{ listStyle: 'none', margin: 0, padding: 0, position: 'relative' }}>
      {rows.map((row, i) => {
        const held = drag?.id === row.id
        return (
          <li
            key={row.id}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 2, position: 'relative',
              transform: held ? `translateY(${drag.dy}px)` : `translateY(${shiftOf(i)}px)`,
              transition: held ? 'none' : 'transform 160ms ease',
              zIndex: held ? 2 : 1,
              opacity: held ? 0.92 : 1,
            }}
          >
            {!disabled && rows.length > 1 && (
              <button
                type="button"
                aria-label={`Move ${label ?? 'this'} — drag to reorder`}
                title="Drag to reorder"
                onPointerDown={start(row.id, i)}
                style={{
                  flexShrink: 0, marginTop: 8, padding: '2px 1px', background: 'none', border: 'none',
                  cursor: held ? 'grabbing' : 'grab', color: alpha(t.textPrimary, held ? 0.55 : 0.28),
                  touchAction: 'none', lineHeight: 0,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                  <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                  <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                </svg>
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>{row.node}</div>
          </li>
        )
      })}
    </ul>
  )
}
