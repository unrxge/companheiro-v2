// GET /api/studio/projects/:id — the bundle · PATCH — project fields · DELETE — cascade

import { NextResponse, type NextRequest } from 'next/server'
import { normaliseRules } from '@/lib/studio/nodes-db'
import {
  badRequest, bumpCanvasVersion, fromDbError, isFiniteNumber, isRecord, isString, loadBundle, noContent,
  notFound, readJson, requireProject, withAuth,
} from '@/lib/studio/db'
import type { PatchProjectRequest, Project, ProjectStatus, Viewport } from '@/lib/studio/types'

type Params = { params: Promise<{ id: string }> }

const STATUSES: ReadonlySet<string> = new Set(['active', 'resting', 'finished', 'kept', 'abandoned'])
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
    if (body.settings !== undefined) {
      if (!isRecord(body.settings)) throw badRequest('settings must be an object')
      const next = { ...project.settings }
      for (const key of ['snap', 'grid', 'sizes'] as const) {
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
    if (Object.keys(patch).length === 0) throw badRequest('nothing to change')

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
    await requireProject(auth, id)
    const { error } = await auth.supabase.from('studio_projects').delete().eq('id', id)
    if (error) throw fromDbError(error)
    return noContent()
  })
}
