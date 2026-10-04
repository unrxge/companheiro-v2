// GET /api/studio/projects/:id — the bundle · PATCH — project fields · DELETE — cascade

import { NextResponse, type NextRequest } from 'next/server'
import { normaliseRules } from '@/lib/studio/nodes-db'
import {
  badRequest, bumpCanvasVersion, fromDbError, isFiniteNumber, isRecord, isString, loadBundle, MEDIA_BUCKET, noContent,
  notFound, nowIso, readJson, requireProject, withAuth,
} from '@/lib/studio/db'
import {
  assertProjectIdWorkable, claimActivePlace, settingsOnLeaving, settingsOnReturning,
} from '@/lib/studio/plan-access'
import type { PatchProjectRequest, Project, ProjectSettings, ProjectStatus, Viewport } from '@/lib/studio/types'

type Params = { params: Promise<{ id: string }> }

const STATUSES: ReadonlySet<string> = new Set(['active', 'resting', 'finished', 'kept', 'abandoned'])
const SHELF_STAGES: ReadonlySet<string> = new Set(['queued', 'active', 'completed'])
const K_MIN = 0.1
const K_MAX = 3

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const bundle = await loadBundle(auth, id)
    if (!bundle) throw notFound()
    return NextResponse.json({ bundle })
  })
}

function parseViewport(v: unknown): Viewport {
  if (!isRecord(v) || !isFiniteNumber(v.tx) || !isFiniteNumber(v.ty) || !isFiniteNumber(v.k)) {
    throw badRequest('viewport must be { tx, ty, k }')
  }
  return { tx: v.tx, ty: v.ty, k: Math.min(K_MAX, Math.max(K_MIN, v.k)) }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson<Record<string, unknown>>(req)
    const project = await requireProject(auth, id)

    const patch: Record<string, unknown> = {}
    let bump = false

    // Changing what the project says is work on it; moving it between
    // columns or around a canvas is not.
    if (body.title !== undefined || body.intent !== undefined || body.rules !== undefined) {
      await assertProjectIdWorkable(auth, project.id)
    }

    if (body.title !== undefined) {
      if (!isString(body.title) || !body.title.trim()) throw badRequest('title must be text')
      patch.title = body.title.trim().slice(0, 120)
      bump = true
    }
    if (body.status !== undefined) {
      if (!isString(body.status) || !STATUSES.has(body.status)) throw badRequest('unknown status')
      patch.status = body.status as ProjectStatus
      bump = true
    }
    // Which Project Board column it sits in. Not a change to the work, so the
    // canvas version stays put; completed_at follows the column.
    if (body.shelf_stage !== undefined) {
      if (!isString(body.shelf_stage) || !SHELF_STAGES.has(body.shelf_stage)) throw badRequest('unknown shelf_stage')
      patch.shelf_stage = body.shelf_stage
      const was = project.shelf_stage ?? 'active'
      const keepIds = Array.isArray(body.keep_ids) ? body.keep_ids.filter(isString) : []
      if (body.shelf_stage !== was) {
        patch.completed_at = body.shelf_stage === 'completed' ? nowIso() : null
        // The place in Active is the plan's to give (lib/studio/plan-access.ts):
        // taking it may send another project to rest, leaving it is remembered.
        if (body.shelf_stage === 'active') {
          await claimActivePlace(auth, project, {
            swap: body.swap === true,
            restId: isString(body.rest_id) ? body.rest_id : null,
            keepOnly: body.keep_only === true,
            keepIds,
          })
          patch.resting_until = null
          patch.settings = settingsOnReturning(project.settings)
        } else if (was === 'active') {
          patch.settings = settingsOnLeaving(project.settings)
        }
      } else if (body.shelf_stage === 'active' && body.keep_only === true) {
        // Already in Active, chosen as one to keep after the plan got smaller.
        await claimActivePlace(auth, project, { keepOnly: true, keepIds })
      }
    }
    if (body.completion_note !== undefined) {
      if (body.completion_note !== null && !isString(body.completion_note)) throw badRequest('completion_note must be text')
      patch.completion_note = body.completion_note === null ? null : body.completion_note.trim().slice(0, 500)
      bump = true
    }
    if (body.intent !== undefined) {
      if (!isString(body.intent)) throw badRequest('intent must be text')
      patch.intent = body.intent.slice(0, 4000)
      bump = true
    }
    if (body.rules !== undefined) {
      patch.rules = normaliseRules(body.rules)
      bump = true
    }
    if (body.viewport !== undefined) patch.viewport = parseViewport(body.viewport)
    // Where it lies on the desk. Never bumps the canvas version: moving a
    // project on the shelf changes nothing about the work inside it.
    for (const axis of ['shelf_x', 'shelf_y'] as const) {
      if (body[axis] === undefined) continue
      if (body[axis] === null) { patch[axis] = null; continue }
      if (!isFiniteNumber(body[axis])) throw badRequest(`${axis} must be a number or null`)
      patch[axis] = Math.round(body[axis] as number)
    }
    // Where the title + vision + rules block sits on the board. Same story:
    // moving it is not a change to the work.
    for (const axis of ['vision_x', 'vision_y'] as const) {
      if (body[axis] === undefined) continue
      if (body[axis] === null) { patch[axis] = null; continue }
      if (!isFiniteNumber(body[axis])) throw badRequest(`${axis} must be a number or null`)
      patch[axis] = Math.round(body[axis] as number)
    }
    if (body.settings !== undefined) {
      if (!isRecord(body.settings)) throw badRequest('settings must be an object')
      const next = { ...((patch.settings as ProjectSettings | undefined) ?? project.settings) }
      for (const key of ['snap', 'grid', 'sizes', 'board'] as const) {
        if (body.settings[key] !== undefined) {
          if (typeof body.settings[key] !== 'boolean') throw badRequest(`settings.${key} must be a boolean`)
          next[key] = body.settings[key] as boolean
        }
      }
      patch.settings = next
    }
    if (body.auto_layout !== undefined) {
      if (typeof body.auto_layout !== 'boolean') throw badRequest('auto_layout must be a boolean')
      patch.auto_layout = body.auto_layout
      bump = true
    }
    if (body.composed_at !== undefined) {
      if (body.composed_at !== null && (!isString(body.composed_at) || Number.isNaN(Date.parse(body.composed_at)))) {
        throw badRequest('composed_at must be a timestamp')
      }
      patch.composed_at = body.composed_at
      bump = true
    }
    if (Object.keys(patch).length === 0) {
      // Keeping one already in Active changes the others, not this row.
      if (body.keep_only === true) return NextResponse.json({ project })
      throw badRequest('nothing to change')
    }

    // status changes go through the trigger: an early wake raises and lands here as 409
    const { data, error } = await auth.supabase
      .from('studio_projects')
      .update(patch as PatchProjectRequest)
      .eq('id', id)
      .select('*')
      .maybeSingle()
    if (error) throw fromDbError(error)
    if (!data) throw notFound()

    let updated = data as Project
    if (bump) {
      const canvas_version = await bumpCanvasVersion(auth, id)
      updated = { ...updated, canvas_version }
    }
    return NextResponse.json({ project: updated })
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const project = await requireProject(auth, id)
    // Its images and recordings go too. The rows cascade; the files do not,
    // so they are removed first. Best effort: a file left behind is storage
    // to tidy, never a reason to keep a project someone asked to delete.
    try {
      const bucket = auth.supabase.storage.from(MEDIA_BUCKET)
      const folder = `${auth.user.id}/${project.id}`
      const { data: files } = await bucket.list(folder, { limit: 1000 })
      if (files?.length) await bucket.remove(files.map((f) => `${folder}/${f.name}`))
    } catch (e) {
      console.error('[studio] project files not removed:', e)
    }
    const { error } = await auth.supabase.from('studio_projects').delete().eq('id', id)
    if (error) throw fromDbError(error)
    return noContent()
  })
}
