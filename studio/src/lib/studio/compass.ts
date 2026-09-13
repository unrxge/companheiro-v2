// studio/src/lib/studio/compass.ts — the compass lifecycle (8.7, D-052, D-058).
// Nothing becomes active without one of the person's verbs; talk only proposes.

import type { AuthedContext } from '@/lib/supabase/route'
import {
  DRIFT_DAYS_DECAY, PENDING_CAP, RELATIVE_DAYS_DECAY,
  type CompassDecideRequest, type CompassEntry, type CompassKind,
} from '@/lib/studio/types'
import { badRequest, conflict, fromDbError, isString, normaliseCompass, notFound, nowIso } from '@/lib/studio/db'

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
export async function getActiveCompass(auth: AuthedContext, projectId: string, now: Date = new Date()): Promise<CompassSplit> {
  const { data, error } = await auth.supabase
    .from('studio_compass_entries')
    .select('*')
    .eq('project_id', projectId)
    .in('status', ['pending', 'active', 'dormant'])
    .order('reinforcement_count', { ascending: false })
    .order('created_at', { ascending: true })
  if (error) throw fromDbError(error)
  return splitCompass(((data as CompassEntry[] | null) ?? []).map(normaliseCompass), now)
}

/** Pending beyond the cap, oldest first → dormant with rejection_note 'expired' (D-058). Returns how many. */
export async function enforcePendingCap(auth: AuthedContext, projectId: string): Promise<number> {
  const { data, error } = await auth.supabase
    .from('studio_compass_entries')
    .select('id, created_at')
    .eq('project_id', projectId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  if (error) throw fromDbError(error)
  const rows = (data as Array<{ id: string; created_at: string }> | null) ?? []
  const overflow = rows.slice(PENDING_CAP).map((r) => r.id)
  if (overflow.length === 0) return 0
  const { error: updErr } = await auth.supabase
    .from('studio_compass_entries')
    .update({ status: 'dormant', rejection_note: 'expired', forgotten_at: nowIso() })
    .in('id', overflow)
  if (updErr) throw fromDbError(updErr)
  return overflow.length
}

async function loadEntry(auth: AuthedContext, entryId: string): Promise<CompassEntry> {
  const { data, error } = await auth.supabase
    .from('studio_compass_entries')
    .select('*')
    .eq('id', entryId)
    .maybeSingle()
  if (error) throw fromDbError(error)
  if (!data) throw notFound()
  return normaliseCompass(data as CompassEntry)
}

async function writeEntry(auth: AuthedContext, entryId: string, patch: Record<string, unknown>): Promise<CompassEntry> {
  const { data, error } = await auth.supabase
    .from('studio_compass_entries')
    .update(patch)
    .eq('id', entryId)
    .select('*')
    .maybeSingle()
  if (error) throw fromDbError(error)
  if (!data) throw notFound()
  return normaliseCompass(data as CompassEntry)
}

/** Soft-deletes a commitment's block when the entry is rejected (route table, D-052). */
async function softDeleteBlock(auth: AuthedContext, blockId: string | null): Promise<void> {
  if (!blockId) return
  const { error } = await auth.supabase
    .from('studio_blocks')
    .update({ deleted_at: nowIso() })
    .eq('id', blockId)
    .is('deleted_at', null)
  if (error) throw fromDbError(error)
}

const ACTIONS: ReadonlySet<string> = new Set(['confirm', 'correct', 'reject', 'forget', 'restore', 'resolve'])

export function parseDecideRequest(body: unknown): CompassDecideRequest {
  if (typeof body !== 'object' || body === null) throw badRequest('body required')
  const b = body as Record<string, unknown>
  if (!isString(b.action) || !ACTIONS.has(b.action)) throw badRequest('unknown action')
  const req: CompassDecideRequest = { action: b.action as CompassDecideRequest['action'] }
  if (b.statement !== undefined) {
    if (!isString(b.statement)) throw badRequest('statement must be text')
    req.statement = b.statement
  }
  if (b.note !== undefined) {
    if (!isString(b.note)) throw badRequest('note must be text')
    req.note = b.note
  }
  if (b.resolution !== undefined) {
    if (b.resolution !== 'done' && b.resolution !== 'let_go') throw badRequest('resolution must be done or let_go')
    req.resolution = b.resolution
  }
  return req
}

/**
 * The person's verbs (D-053). pending → active (confirm / correct), pending → rejected,
 * active → dormant (forget), dormant → active (restore), commitments resolve.
 */
export async function decide(auth: AuthedContext, entryId: string, req: CompassDecideRequest): Promise<CompassEntry> {
  const entry = await loadEntry(auth, entryId)
  const now = nowIso()

  switch (req.action) {
    case 'confirm': {
      if (entry.status === 'active') return entry
      if (entry.status !== 'pending') throw conflict(`entry is ${entry.status}`)
      return writeEntry(auth, entryId, { status: 'active', decided_at: now, rejection_note: null })
    }
    case 'correct': {
      const statement = (req.statement ?? '').trim()
      if (!statement) throw badRequest('statement required')
      if (entry.status !== 'pending' && entry.status !== 'active') throw conflict(`entry is ${entry.status}`)
      // proposed_statement is kept as talk wrote it, for honesty
      return writeEntry(auth, entryId, { status: 'active', statement, decided_at: now, rejection_note: null })
    }
    case 'reject': {
      if (entry.status === 'rejected') return entry
      if (entry.status !== 'pending') throw conflict(`entry is ${entry.status}`)
      const updated = await writeEntry(auth, entryId, {
        status: 'rejected',
        rejection_note: (req.note ?? '').trim() || null,
        decided_at: now,
      })
      if (entry.kind === 'commitment') await softDeleteBlock(auth, entry.block_id)
      return updated
    }
    case 'forget': {
      if (entry.status === 'dormant') return entry
      if (entry.status !== 'active') throw conflict(`entry is ${entry.status}`)
      return writeEntry(auth, entryId, { status: 'dormant', forgotten_at: now })
    }
    case 'restore': {
      if (entry.status === 'active') return entry
      if (entry.status !== 'dormant') throw conflict(`entry is ${entry.status}`)
      // restored entries start fresh so they do not fade again the same day
      return writeEntry(auth, entryId, {
        status: 'active',
        forgotten_at: null,
        rejection_note: null,
        last_reinforced_at: now,
        decided_at: entry.decided_at ?? now,
      })
    }
    case 'resolve': {
      if (entry.kind !== 'commitment') throw badRequest('only commitments resolve')
      if (!req.resolution) throw badRequest('resolution required')
      if (entry.status !== 'active') throw conflict(`entry is ${entry.status}`)
      return writeEntry(auth, entryId, { resolution: req.resolution, resolved_at: now })
    }
  }
}
