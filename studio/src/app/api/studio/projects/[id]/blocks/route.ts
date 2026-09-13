// PATCH /api/studio/projects/:id/blocks — the autosave batch (full rows, ≤ 40, D-030)
// POST — single create from the library (server assigns z)

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, bumpCanvasVersion, fromDbError, isRecord, isStringArray, nextZ, nowIso,
  readJson, requireProject, sanitiseBlockRow, withAuth,
} from '@/lib/studio/db'
import type { AnyBlock, BlocksBatchResponse } from '@/lib/studio/types'

type Params = { params: Promise<{ id: string }> }

const MAX_UPSERTS = 40

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson<Record<string, unknown>>(req)
    const upserts = body.upserts === undefined ? [] : body.upserts
    const deletes = body.deletes === undefined ? [] : body.deletes
    const restores = body.restores === undefined ? [] : body.restores
    if (!Array.isArray(upserts)) throw badRequest('upserts must be an array')
    if (upserts.length > MAX_UPSERTS) throw badRequest(`at most ${MAX_UPSERTS} rows per batch`)
    if (!isStringArray(deletes) || !isStringArray(restores)) throw badRequest('deletes and restores must be id arrays')

    const project = await requireProject(auth, id)
    assertProjectWritable(project)

    const rows = upserts.map((r) => sanitiseBlockRow(r, { userId: auth.user.id, projectId: id }))
    const sb = auth.supabase

    if (rows.length > 0) {
      const { error } = await sb.from('studio_blocks').upsert(rows, { onConflict: 'id' })
      if (error) throw fromDbError(error)
    }
    if (deletes.length > 0) {
      const { error } = await sb
        .from('studio_blocks')
        .update({ deleted_at: nowIso() })
        .in('id', deletes)
        .eq('project_id', id)
        .is('deleted_at', null)
      if (error) throw fromDbError(error)
    }
    if (restores.length > 0) {
      const { error } = await sb
        .from('studio_blocks')
        .update({ deleted_at: null })
        .in('id', restores)
        .eq('project_id', id)
      if (error) throw fromDbError(error)
    }

    const canvas_version = await bumpCanvasVersion(auth, id)
    const out: BlocksBatchResponse = { canvas_version, applied: rows.length + deletes.length + restores.length }
    return NextResponse.json(out)
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson<Record<string, unknown>>(req)
    if (!isRecord(body.block)) throw badRequest('block required')

    const project = await requireProject(auth, id)
    assertProjectWritable(project)

    const row = sanitiseBlockRow(body.block, { userId: auth.user.id, projectId: id, allowMissingId: true })
    row.z = await nextZ(auth, id)
    row.deleted_at = null

    const { data, error } = await auth.supabase.from('studio_blocks').insert(row).select('*').single()
    if (error || !data) throw fromDbError(error)
    await bumpCanvasVersion(auth, id)
    return NextResponse.json({ block: data as AnyBlock }, { status: 201 })
  })
}
