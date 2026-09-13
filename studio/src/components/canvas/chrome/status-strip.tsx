'use client'

// studio/src/components/canvas/chrome/status-strip.tsx — the read-only strip under
// the top bar for resting and completed projects (6.6, D-060), plus the status
// wording every other surface reuses (shelf card, top bar pill, project panel).

import { useProject } from '@/lib/studio/hooks'
import { canvasType, geometry, glass, line, zIndex } from '@/lib/studio/canvas-tokens'
import type { Project, ProjectStatus } from '@/lib/studio/types'

const DAY = 86400000

/** Whole days until `resting_until`, at least 0; null when not resting or unset. */
export function restingDaysLeft(p: Pick<Project, 'status' | 'resting_until'>, now: Date = new Date()): number | null {
  if (p.status !== 'resting' || !p.resting_until) return null
  const until = new Date(p.resting_until).getTime()
  if (Number.isNaN(until)) return null
  return Math.max(0, Math.ceil((until - now.getTime()) / DAY))
}

export function canWake(p: Pick<Project, 'status' | 'resting_until'>, now: Date = new Date()): boolean {
  if (p.status !== 'resting') return false
  const left = restingDaysLeft(p, now)
  return left === null || left <= 0
}

export const COMPLETED: ReadonlySet<ProjectStatus> = new Set<ProjectStatus>(['finished', 'kept', 'abandoned'])

/** The status pill text: `active`, `resting · 9 days left`, `finished`, `kept`, `abandoned`. */
export function statusLabel(p: Pick<Project, 'status' | 'resting_until'>, now: Date = new Date()): string {
  if (p.status === 'resting') {
    const left = restingDaysLeft(p, now)
    if (left === null) return 'resting'
    return left <= 0 ? 'resting · can wake' : `resting · ${left} ${left === 1 ? 'day' : 'days'} left`
  }
  return p.status
}

/** The strip's sentence; null for an active project. */
export function readOnlyLine(p: Pick<Project, 'status' | 'resting_until' | 'completion_note'>, now: Date = new Date()): string | null {
  if (p.status === 'active') return null
  if (p.status === 'resting') return `${statusLabel(p, now)} · you can read and talk`
  const note = p.completion_note?.trim()
  return note ? `${p.status} — “${note}”` : `${p.status} · you can read and talk`
}

export function StatusStrip() {
  const project = useProject()
  const text = readOnlyLine(project)
  if (!text) return null
  return (
    <div
      role="status"
      style={{
        position: 'absolute',
        top: geometry.topBarH + 12,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: zIndex.chrome,
      }}
    >
      <div
        style={{
          ...canvasType.meta,
          color: glass.text,
          backgroundColor: glass.bg,
          backdropFilter: glass.filter,
          WebkitBackdropFilter: glass.filter,
          border: `1px solid ${line.chrome}`,
          borderRadius: 999,
          padding: '5px 12px',
          maxWidth: 'calc(100% - 160px)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          pointerEvents: 'auto',
        }}
      >
        {text}
      </div>
    </div>
  )
}
