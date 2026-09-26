// src/lib/studio/talk/apply.ts — validate and apply a sort (8.5, D-054,
// D-055, D-058). All writes go through auth.supabase (RLS). Arrival rects come
// from lane F's nextArrival at insert time and are stored: the row's x/y is the
// one truth. `sweepUnsorted` is what /open calls for entries a closed tab left
// behind (no reply; a catch found there is still spoken as a companion entry).

import type { AuthedContext } from '@/lib/supabase/route'
import type { AnyBlock, Block, CompassEntry, CompassEvidence, Project, TalkApplied, TalkEntry, TalkSort } from '@/lib/studio/types'
import { bumpCanvasVersion, fromDbError, getProject, isRecord, isString, normaliseCompass, nowIso } from '@/lib/studio/db'
import { enforcePendingCap } from '@/lib/studio/compass'
import { nextArrival } from '@/lib/studio/layout/arrivals'
import { isVerbatim } from '@/lib/studio/talk/verbatim'
import type { TalkContext } from '@/lib/studio/talk/context'

export const CAPS = { updates: 1, commitments: 2, compass: 3, decisions: 3 } as const
export const SWEEP_MIN_AGE_MS = 2 * 60 * 1000
export const SWEEP_MAX = 5

export const EMPTY_APPLIED: TalkApplied = Object.freeze({
  block_ids: [],
  compass_pending_ids: [],
  reinforced_ids: [],
  suggest_done_ids: [],
}) as TalkApplied

export type Applied = TalkApplied & { rows: AnyBlock[]; compassRows: CompassEntry[] }

const COMPASS_KINDS: ReadonlySet<string> = new Set(['refusal', 'non_negotiable', 'drift'])

/** Validation only needs these three lists from the context. */
export type SortScope = Pick<TalkContext, 'active' | 'pending' | 'openCommitments'>

const cleanText = (v: unknown): string | null => {
  if (!isString(v)) return null
  const s = v.replace(/\s+/g, ' ').trim()
  return s.length > 0 ? s : null
}

/**
 * Tolerant parse + verbatim + caps (D-055). Anything whose text / quote is not a
 * normalised span of the person's words is dropped; ids outside the context are dropped.
 */
export function validateSort(sort: unknown, personText: string, ctx: SortScope): TalkSort {
  const out: TalkSort = { update: null, commitments: [], compass: [], decisions: [], done_commitment_ids: [] }
  if (!isRecord(sort)) return out

  const knownIds = new Set([...ctx.active, ...ctx.pending].map((e) => e.id))
  const activeIds = new Set(ctx.active.map((e) => e.id))
  const openIds = new Set(ctx.openCommitments.map((e) => e.id))
  const verbatim = (s: string | null): s is string => s !== null && isVerbatim(s, personText)

  // update — one, verbatim
  if (isRecord(sort.update)) {
    const text = cleanText(sort.update.text)
    if (verbatim(text)) out.update = { text }
  }

  // commitments — verbatim, cap 2, no duplicates
  if (Array.isArray(sort.commitments)) {
    const seen = new Set<string>()
    for (const c of sort.commitments) {
      if (out.commitments.length >= CAPS.commitments) break
      if (!isRecord(c)) continue
      const text = cleanText(c.text)
      if (!verbatim(text) || seen.has(text)) continue
      seen.add(text)
      out.commitments.push({ text })
    }
  }

  // compass proposals — quote verbatim, kind known, reinforce_id known, cap 3
  if (Array.isArray(sort.compass)) {
    for (const p of sort.compass) {
      if (out.compass.length >= CAPS.compass) break
      if (!isRecord(p)) continue
      if (!isString(p.kind) || !COMPASS_KINDS.has(p.kind)) continue
      const quote = cleanText(p.quote)
      if (!verbatim(quote)) continue
      const statement = cleanText(p.statement) ?? quote
      const reinforce_id = isString(p.reinforce_id) && knownIds.has(p.reinforce_id) ? p.reinforce_id : null
      out.compass.push({ kind: p.kind as 'refusal' | 'non_negotiable' | 'drift', statement: statement.slice(0, 280), quote, reinforce_id })
    }
  }

  // decisions — verbatim, collides_with must be an active entry, cap 3
  if (Array.isArray(sort.decisions)) {
    for (const d of sort.decisions) {
      if (out.decisions.length >= CAPS.decisions) break
      if (!isRecord(d)) continue
      const text = cleanText(d.text)
      if (!verbatim(text)) continue
      const collides_with = isString(d.collides_with) && activeIds.has(d.collides_with) ? d.collides_with : null
      out.decisions.push({ text, collides_with })
    }
  }

  // done commitments — only open ones
  if (Array.isArray(sort.done_commitment_ids)) {
    out.done_commitment_ids = [...new Set(sort.done_commitment_ids.filter((id): id is string => isString(id) && openIds.has(id)))]
  }

  return out
}

// ── writes ──────────────────────────────────────────────────────────────────

async function loadLive(auth: AuthedContext, projectId: string): Promise<AnyBlock[]> {
  const { data, error } = await auth.supabase
    .from('studio_blocks')
    .select('*')
    .eq('project_id', projectId)
    .is('deleted_at', null)
  if (error) throw fromDbError(error)
  return (data as AnyBlock[] | null) ?? []
}

/** Every column of an arriving block except its rect and z (nextArrival fills those). */
function arrivalSeed<T extends 'update' | 'commitment'>(
  auth: AuthedContext,
  project: Project,
  type: T,
  content: Block<T>['content'],
  personEntryId: string,
  now: string
): Omit<AnyBlock, 'x' | 'y' | 'w' | 'h' | 'z'> {
  return {
    id: '',
    user_id: auth.user.id,
    project_id: project.id,
    type,
    parent_id: null,
    stacked_in: null,
    name: null,
    locked: false,
    hidden: false,
    collapsed: false,
    placed_by: 'auto',
    arrival_state: 'unplaced',
    arrived_from: personEntryId,
    struck_at: null,
    struck_by: null,
    content,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  } as Omit<AnyBlock, 'x' | 'y' | 'w' | 'h' | 'z'>
}

async function insertBlock(auth: AuthedContext, row: AnyBlock): Promise<AnyBlock> {
  const { updated_at: _u, ...insert } = row
  // the row is a union of every block variant; the client is untyped, so hand it
  // a plain record rather than let the insert overload pin the first variant.
  const { data, error } = await auth.supabase
    .from('studio_blocks')
    .insert(insert as Record<string, unknown>)
    .select('*')
    .single()
  if (error) throw fromDbError(error)
  return data as AnyBlock
}

async function insertCompass(auth: AuthedContext, project: Project, row: Record<string, unknown>): Promise<CompassEntry> {
  const { data, error } = await auth.supabase
    .from('studio_compass_entries')
    .insert({ ...row, user_id: auth.user.id, project_id: project.id })
    .select('*')
    .single()
  if (error) throw fromDbError(error)
  return normaliseCompass(data as CompassEntry)
}

async function loadCompassRow(auth: AuthedContext, id: string): Promise<CompassEntry | null> {
  const { data, error } = await auth.supabase.from('studio_compass_entries').select('*').eq('id', id).maybeSingle()
  if (error) throw fromDbError(error)
  return data ? normaliseCompass(data as CompassEntry) : null
}

/**
 * Apply a validated sort: one update arrival, commitment entries + their blocks,
 * compass proposals (or reinforcements), done suggestions, the pending cap, and
 * finally the person entry's `sort` / `sorted_at`. Nothing is placed for the person
 * and nothing in the compass becomes active here.
 */
export async function applySort(
  auth: AuthedContext,
  project: Project,
  personEntryId: string,
  sort: TalkSort,
  _ctx: SortScope
): Promise<Applied> {
  const now = nowIso()
  const live = await loadLive(auth, project.id)
  let maxZ = live.reduce((m, b) => Math.max(m, b.z), 0)

  const rows: AnyBlock[] = []
  const compassRows: CompassEntry[] = []
  const applied: TalkApplied = { block_ids: [], compass_pending_ids: [], reinforced_ids: [], suggest_done_ids: [] }
  const evidence = (quote: string): CompassEvidence[] => [{ entry_id: personEntryId, quote, at: now }]

  if (sort.update) {
    const seed = arrivalSeed(auth, project, 'update', { text: sort.update.text, said_at: now, entry_id: personEntryId, origin: 'talk' }, personEntryId, now)
    const row = await insertBlock(auth, nextArrival(live, seed, maxZ))
    maxZ += 1
    live.push(row)
    rows.push(row)
    applied.block_ids.push(row.id)
  }

  for (const c of sort.commitments) {
    const entry = await insertCompass(auth, project, {
      kind: 'commitment',
      statement: c.text,
      proposed_statement: c.text,
      status: 'pending',
      source_entry_id: personEntryId,
      evidence: evidence(c.text),
    })
    const seed = arrivalSeed(auth, project, 'commitment', { entry_id: entry.id }, personEntryId, now)
    const block = await insertBlock(auth, nextArrival(live, seed, maxZ))
    maxZ += 1
    live.push(block)
    rows.push(block)
    applied.block_ids.push(block.id)
    const { error } = await auth.supabase.from('studio_compass_entries').update({ block_id: block.id }).eq('id', entry.id)
    if (error) throw fromDbError(error)
    compassRows.push({ ...entry, block_id: block.id })
    applied.compass_pending_ids.push(entry.id)
  }

  for (const p of sort.compass) {
    if (p.reinforce_id) {
      const { error } = await auth.supabase.rpc('studio_reinforce_compass_entry', {
        p_entry_id: p.reinforce_id,
        p_evidence: evidence(p.quote),
      })
      if (error) throw fromDbError(error)
      applied.reinforced_ids.push(p.reinforce_id)
      const fresh = await loadCompassRow(auth, p.reinforce_id)
      if (fresh) compassRows.push(fresh)
    } else {
      const entry = await insertCompass(auth, project, {
        kind: p.kind,
        statement: p.statement,
        proposed_statement: p.statement,
        status: 'pending',
        source_entry_id: personEntryId,
        evidence: evidence(p.quote),
      })
      compassRows.push(entry)
      applied.compass_pending_ids.push(entry.id)
    }
  }

  // nothing is marked done here; the person ticks
  applied.suggest_done_ids = [...sort.done_commitment_ids]

  const expired = await enforcePendingCap(auth, project.id)
  if (expired > 0) {
    // rows we just returned may have been expired by the cap: reflect the truth
    for (let i = 0; i < compassRows.length; i++) {
      const fresh = await loadCompassRow(auth, compassRows[i].id)
      if (fresh) compassRows[i] = fresh
    }
  }

  const { error: sortErr } = await auth.supabase
    .from('studio_talk_entries')
    .update({ sort, sorted_at: now })
    .eq('id', personEntryId)
  if (sortErr) throw fromDbError(sortErr)

  await bumpCanvasVersion(auth, project.id)

  return { ...applied, rows, compassRows }
}

/**
 * Person entries with sorted_at null older than 2 minutes, oldest first, max 5:
 * sort + apply + catch, no reply. Each entry stands alone: a failure is logged and
 * leaves that entry unsorted for the next open. Returns how many were swept.
 */
export async function sweepUnsorted(auth: AuthedContext, projectId: string): Promise<number> {
  const project = await getProject(auth, projectId)
  if (!project) return 0

  const before = new Date(Date.now() - SWEEP_MIN_AGE_MS).toISOString()
  const { data, error } = await auth.supabase
    .from('studio_talk_entries')
    .select('id, project_id, kind, role, input, text, reply_to, catch_id, sorted_at, truncated, created_at')
    .eq('project_id', projectId)
    .eq('role', 'person')
    .is('sorted_at', null)
    .lt('created_at', before)
    .order('created_at', { ascending: true })
    .limit(SWEEP_MAX)
  if (error) throw fromDbError(error)
  const entries = (data as TalkEntry[] | null) ?? []
  if (entries.length === 0) return 0

  // imported lazily so apply.ts (which the /open route imports) never drags the model client into a module cycle at load
  const [{ buildTalkContext }, { sortTalk, sortDirection }, { maybeCatch }] = await Promise.all([
    import('@/lib/studio/talk/context'),
    import('@/lib/studio/talk/sort'),
    import('@/lib/studio/talk/catch'),
  ])

  let swept = 0
  for (const entry of entries) {
    try {
      const ctx = await buildTalkContext(auth, project, entry.kind)
      const sort = entry.kind === 'talk'
        ? await sortTalk(auth, ctx, entry.text, entry.id)
        : await sortDirection(auth, ctx, entry.text, entry.id)
      await applySort(auth, project, entry.id, sort, ctx)
      await maybeCatch(auth, project, entry.id, sort, ctx)
      swept += 1
    } catch (e) {
      console.error('[studio] sweep entry failed:', entry.id, e)
    }
  }
  return swept
}
