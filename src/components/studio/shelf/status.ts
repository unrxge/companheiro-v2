// src/components/studio/shelf/status.ts — status-pill wording shared by the
// shelf card and the shelf desk view. Inlined from studio's
// components/canvas/chrome/status-strip.tsx: this keeps just the two pure
// exports (`COMPLETED`, `statusLabel`) that desk.tsx and project-card.tsx
// need. The rest of that file (the `StatusStrip` component, `readOnlyLine`,
// `canWake`) belongs to the old canvas chrome and depends on
// `lib/studio/hooks`, which was left behind as dead code — see the Phase 2
// migration report for why.

import type { Project, ProjectStatus } from '@/lib/studio/types'

const DAY = 86400000

/** Whole days until `resting_until`, at least 0; null when not resting or unset. */
function restingDaysLeft(p: Pick<Project, 'status' | 'resting_until'>, now: Date = new Date()): number | null {
  if (p.status !== 'resting' || !p.resting_until) return null
  const until = new Date(p.resting_until).getTime()
  if (Number.isNaN(until)) return null
  return Math.max(0, Math.ceil((until - now.getTime()) / DAY))
}

export const COMPLETED: ReadonlySet<ProjectStatus> = new Set<ProjectStatus>(['finished', 'kept', 'abandoned'])

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The status pill text: `Active`, `Resting · 9 days left`, `Finished`, `Kept`, `Abandoned`. */
export function statusLabel(p: Pick<Project, 'status' | 'resting_until'>, now: Date = new Date()): string {
  if (p.status === 'resting') {
    const left = restingDaysLeft(p, now)
    if (left === null) return 'Resting'
    return left <= 0 ? 'Resting · can wake' : `Resting · ${left} ${left === 1 ? 'day' : 'days'} left`
  }
  return cap(p.status)
}
