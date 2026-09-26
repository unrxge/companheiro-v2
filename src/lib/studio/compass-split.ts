// src/lib/studio/compass-split.ts — the PURE half of the compass
// lifecycle: decay windows and the split the drawer, the compass block and the
// talk context all agree on. Kept apart from compass.ts because that module
// reaches for the request-scoped supabase client (next/headers) and so cannot
// be pulled into a client component's bundle.

import {
  DRIFT_DAYS_DECAY, RELATIVE_DAYS_DECAY,
  type CompassEntry, type CompassKind,
} from '@/lib/studio/types'

const DAY_MS = 24 * 60 * 60 * 1000

/** Days without reinforcement before an active entry fades (D-058). */
export function decayDaysFor(kind: CompassKind): number {
  return kind === 'drift' ? DRIFT_DAYS_DECAY : RELATIVE_DAYS_DECAY
}

/** True when an ACTIVE entry has gone unreinforced past its decay window. */
export function isFaded(entry: Pick<CompassEntry, 'kind' | 'status' | 'last_reinforced_at'>, now: Date = new Date()): boolean {
  if (entry.status !== 'active') return false
  const last = new Date(entry.last_reinforced_at).getTime()
  if (!Number.isFinite(last)) return false
  return now.getTime() - last > decayDaysFor(entry.kind) * DAY_MS
}

export interface CompassSplit {
  /** active and still fresh: what the sorter, the catch and the drawer's main sections see */
  active: CompassEntry[]
  /** active but decayed: listed under `faded`; reinforcement brings them back */
  faded: CompassEntry[]
  pending: CompassEntry[]
  dormant: CompassEntry[]
  /** active, kind commitment, unresolved (asked about, fresh or faded alike) */
  openCommitments: CompassEntry[]
}

/** Pure split so the drawer (D) and context (G) agree without a second fetch. */
export function splitCompass(entries: CompassEntry[], now: Date = new Date()): CompassSplit {
  const out: CompassSplit = { active: [], faded: [], pending: [], dormant: [], openCommitments: [] }
  for (const e of entries) {
    if (e.status === 'pending') out.pending.push(e)
    else if (e.status === 'dormant') out.dormant.push(e)
    else if (e.status === 'active') {
      if (e.kind === 'commitment' && !e.resolution) out.openCommitments.push(e)
      if (isFaded(e, now)) out.faded.push(e)
      else out.active.push(e)
    }
  }
  return out
}

/** Every non-rejected entry of a project, split by status and decay. */
