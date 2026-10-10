// Server side of lib/billing/entitlements.ts: what this person's plan allows
// right now, and the rules about which project is the one being worked on.
//
// A plan with a limit (Practice, or a trial or plan that has ended) works on
// a few projects at a time (entitlements.maxActiveProjects): the ones in the
// Project Board's Active column. The others can be read and exported, never
// edited. When Active is full, taking a place sends the project the person
// names to the Queue to rest for REST_DAYS, so projects cannot be rotated day
// by day; so does anything that left Active shortly before another took its
// place (dragged to Completed and back is the same swap by another road).
//
// Leaving Active changes where a project sits and nothing else: only
// shelf_stage, completed_at, resting_until and settings.left_active_at are
// written. Its pieces, drafts, concept, threads, images, recordings and task
// lists are never touched, and it stays a project (never an Idea Lab draft).
//
// A failed lookup lets the work through. Our own bookkeeping being down must
// never be the thing that stops someone mid-sentence.

import { NextResponse } from 'next/server'
import type { AuthedContext } from '@/lib/supabase/route'
import type { Subscription } from '@/lib/billing/access'
import {
  entitlementsFor, isResting, activeLimitLine, REST_DAYS, restEndsAt, type Entitlements, type Plan,
} from '@/lib/billing/entitlements'
import { assertProjectWritable, fromDbError, HttpError } from '@/lib/studio/db'
import type { Project, ProjectSettings } from '@/lib/studio/types'

// One read per request, however many checks ask.
const perRequest = new WeakMap<object, Promise<Entitlements>>()

export function entitlementsOf(auth: AuthedContext): Promise<Entitlements> {
  let found = perRequest.get(auth.user)
  if (!found) {
    found = (async () => {
      const { data, error } = await auth.supabase
        .from('subscriptions')
        .select('status, tier, trial_ends_at, current_period_end, cancel_at_period_end, repeat_trial')
        .eq('user_id', auth.user.id)
        .maybeSingle()
      if (error) console.error('entitlementsOf: subscription lookup failed, allowing', error.message)
      return entitlementsFor(error ? null : (data as Subscription | null))
    })()
    perRequest.set(auth.user, found)
  }
  return found
}

type Feature = 'threads' | 'media' | 'visionTalk'
const FEATURE_LINE: Record<Feature, string> = {
  threads: 'Threads across your pieces are part of Direction.',
  media: 'Images and recordings are part of Direction.',
  visionTalk: 'Talking the whole vision through is part of Direction.',
}

/** 403 with code `plan_feature` when the plan does not include it. */
export async function assertFeature(auth: AuthedContext, feature: Feature): Promise<void> {
  const ent = await entitlementsOf(auth)
  if (!ent[feature]) throw new HttpError(403, FEATURE_LINE[feature], 'plan_feature')
}

type ActiveRow = { id: string; title: string; settings: ProjectSettings | null; resting_until: string | null; shelf_stage: string }

async function projectsOf(auth: AuthedContext): Promise<ActiveRow[]> {
  const { data, error } = await auth.supabase
    .from('studio_projects')
    .select('id, title, settings, resting_until, shelf_stage')
    .eq('user_id', auth.user.id)
  if (error) throw fromDbError(error)
  return (data as ActiveRow[] | null) ?? []
}

export interface ProjectAccess {
  plan: Plan
  /** Can be edited and talked about. Reading and exporting never depend on it. */
  workable: boolean
  /** not_active: another project holds the place. over_limit: more are active than the plan carries, and one has to be chosen. */
  reason: 'not_active' | 'over_limit' | null
  /** The project(s) in Active, when the plan has a limit. */
  active: Array<{ id: string; title: string }>
  /** How many the plan works on at once. null is any number. */
  limit: number | null
  resting_until: string | null
  /** New threads, new media, the vision talk. */
  threads: boolean
  media: boolean
  visionTalk: boolean
  /** The companion answers at all: without it, nothing that is a conversation
   *  is offered — working a piece out before making it, among them. */
  companion: boolean
}

type Staged = Pick<Project, 'id' | 'resting_until'> & { shelf_stage?: Project['shelf_stage'] | null }

export async function projectAccess(auth: AuthedContext, project: Staged): Promise<ProjectAccess> {
  const ent = await entitlementsOf(auth)
  const base = { plan: ent.plan, limit: ent.maxActiveProjects, threads: ent.threads, media: ent.media, visionTalk: ent.visionTalk, companion: ent.companion }
  const resting_until = isResting(project.resting_until) ? project.resting_until : null
  if (ent.maxActiveProjects === null) return { ...base, workable: true, reason: null, active: [], resting_until: null }
  let rows: ActiveRow[]
  try {
    rows = await projectsOf(auth)
  } catch (e) {
    console.error('projectAccess: project list failed, allowing', e)
    return { ...base, workable: true, reason: null, active: [], resting_until }
  }
  const active = rows.filter((r) => r.shelf_stage === 'active').map((r) => ({ id: r.id, title: r.title }))
  const isActive = (project.shelf_stage ?? 'active') === 'active'
  const reason = !isActive ? 'not_active' : active.length > ent.maxActiveProjects ? 'over_limit' : null
  return { ...base, workable: reason === null, reason, active, resting_until }
}

function refusal(access: ProjectAccess): HttpError {
  const line = activeLimitLine(access.plan)
  if (access.reason === 'over_limit') {
    return new HttpError(403, `${line} Choose which to keep working on.`, 'plan_over_limit')
  }
  const others = access.active.map((p) => `“${p.title.trim() || 'Untitled'}”`)
  return new HttpError(
    403,
    others.length ? `You’re working on ${others.join(' and ')} right now. ${line}` : `This one isn’t a project you’re working on right now.`,
    'plan_not_active',
  )
}

/** The status check every arranging route already made, plus the plan's. */
export async function assertWorkable(auth: AuthedContext, project: Project): Promise<void> {
  assertProjectWritable(project)
  const access = await projectAccess(auth, project)
  if (!access.workable) throw refusal(access)
}

/** For routes that hold a node id and never loaded the project. Only the plan is checked. */
export async function assertNodeWorkable(auth: AuthedContext, nodeId: string | null | undefined): Promise<void> {
  if (!nodeId) return
  const ent = await entitlementsOf(auth)
  if (ent.maxActiveProjects === null) return
  const { data: node } = await auth.supabase
    .from('studio_nodes')
    .select('project_id')
    .eq('id', nodeId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  const projectId = (node as { project_id: string } | null)?.project_id
  if (projectId) await assertProjectIdWorkable(auth, projectId)
}

export async function assertProjectIdWorkable(auth: AuthedContext, projectId: string): Promise<void> {
  const ent = await entitlementsOf(auth)
  if (ent.maxActiveProjects === null) return
  const { data } = await auth.supabase
    .from('studio_projects')
    .select('id, shelf_stage, resting_until')
    .eq('id', projectId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  // A missing project is the route's own 404 to give.
  if (!data) return
  const access = await projectAccess(auth, data as Staged)
  if (!access.workable) throw refusal(access)
}

// ── the place in Active ─────────────────────────────────────────────────────

const leftRecently = (r: ActiveRow, now: number) => {
  const left = r.settings?.left_active_at ? new Date(r.settings.left_active_at).getTime() : NaN
  return Number.isFinite(left) && now - left < REST_DAYS * 86_400_000 ? left : null
}

/**
 * Which column a project made just now lands in: Active when the plan has
 * room, the Queue when another project already holds the place.
 */
export async function stageForNewProject(auth: AuthedContext): Promise<'active' | 'queued'> {
  const ent = await entitlementsOf(auth)
  if (ent.maxActiveProjects === null) return 'active'
  try {
    const active = (await projectsOf(auth)).filter((r) => r.shelf_stage === 'active')
    return active.length >= ent.maxActiveProjects ? 'queued' : 'active'
  } catch {
    return 'active'
  }
}

/**
 * Called when `project` is about to move into Active. Refuses if it is
 * resting, or if Active is full and `swap` was not asked for. With `swap`,
 * enough of the projects in Active go to the Queue and rest to make room:
 * the one named by `restId`, which must be given when there is a choice to
 * make. With `keepOnly` (honoured only while more are active than the plan
 * carries, the state a downgrade leaves behind) the others go to the Queue
 * without a rest, except those named in `keepIds`: nothing was swapped, the
 * plan just got smaller.
 */
export async function claimActivePlace(
  auth: AuthedContext,
  project: Pick<Project, 'id' | 'resting_until'>,
  opts: { swap?: boolean; restId?: string | null; keepOnly?: boolean; keepIds?: string[] } = {},
): Promise<void> {
  const ent = await entitlementsOf(auth)
  if (ent.maxActiveProjects === null) return
  if (isResting(project.resting_until)) {
    const until = new Date(project.resting_until as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })
    throw new HttpError(409, `This one is resting until ${until}.`, 'plan_resting')
  }
  const rows = await projectsOf(auth)
  const active = rows.filter((r) => r.shelf_stage === 'active')
  const others = active.filter((r) => r.id !== project.id)
  const overLimit = active.length > ent.maxActiveProjects
  const now = Date.now()
  const stamp = new Date(now).toISOString()

  const settle = !!opts.keepOnly && overLimit
  if (others.length >= ent.maxActiveProjects) {
    const names = others.map((r) => `“${r.title?.trim() || 'Untitled'}”`).join(' and ')
    if (!settle && !opts.swap) {
      throw new HttpError(409, `${activeLimitLine(ent.plan)} Right now that is ${names}.`, 'plan_slot_taken')
    }
    // Who leaves. Settling a smaller plan: everyone not chosen to stay.
    // Swapping: as many as it takes to make one place, which is everyone
    // when there is no choice, and the named one when there is.
    let leaving: ActiveRow[]
    if (settle) {
      const keep = new Set((opts.keepIds ?? []).slice(0, ent.maxActiveProjects - 1))
      leaving = others.filter((r) => !keep.has(r.id))
    } else {
      const mustLeave = others.length - ent.maxActiveProjects + 1
      if (mustLeave >= others.length) leaving = others
      else {
        const named = others.filter((r) => r.id === opts.restId)
        if (named.length !== 1 || mustLeave !== 1) {
          throw new HttpError(409, `${activeLimitLine(ent.plan)} Choose which of ${names} rests.`, 'plan_choose_rest')
        }
        leaving = named
      }
    }
    for (const row of leaving) {
      const { error } = await auth.supabase
        .from('studio_projects')
        .update({
          shelf_stage: 'queued',
          completed_at: null,
          resting_until: settle ? null : restEndsAt(now),
          settings: settle ? row.settings : { ...(row.settings ?? {}), left_active_at: stamp },
        })
        .eq('id', row.id)
        .eq('user_id', auth.user.id)
      if (error) throw fromDbError(error)
    }
  }

  // Anything that stepped out of Active shortly before this one stepped in
  // was swapped for it, whichever column it was dragged to on the way.
  if (settle) return
  for (const row of rows) {
    if (row.id === project.id || row.shelf_stage === 'active' || isResting(row.resting_until)) continue
    const left = leftRecently(row, now)
    if (left === null) continue
    const { error } = await auth.supabase
      .from('studio_projects')
      .update({ resting_until: restEndsAt(left) })
      .eq('id', row.id)
      .eq('user_id', auth.user.id)
    if (error) console.error('claimActivePlace: could not rest', row.id, error.message)
  }
}

/** The settings a project carries once it has left Active. */
export function settingsOnLeaving(settings: ProjectSettings | null | undefined): ProjectSettings {
  return { ...(settings ?? { snap: true, grid: true, sizes: false }), left_active_at: new Date().toISOString() }
}

/** And once it is back: nothing to remember. */
export function settingsOnReturning(settings: ProjectSettings | null | undefined): ProjectSettings {
  const { left_active_at: _gone, ...rest } = settings ?? { snap: true, grid: true, sizes: false }
  return rest
}

/**
 * The same check for routes that answer in their own JSON shape rather than
 * throwing: the response to send instead, or null to carry on (like aiGate).
 */
export async function nodeGate(auth: AuthedContext, nodeId: string | null | undefined): Promise<NextResponse<never> | null> {
  try {
    await assertNodeWorkable(auth, nodeId)
    return null
  } catch (e) {
    if (e instanceof HttpError) {
      return NextResponse.json({ success: false, error: e.message, code: e.code }, { status: e.status }) as NextResponse<never>
    }
    console.error('nodeGate: check failed, allowing', e)
    return null
  }
}
