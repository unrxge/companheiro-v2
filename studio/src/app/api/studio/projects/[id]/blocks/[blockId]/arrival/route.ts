// POST /api/studio/projects/:id/blocks/:blockId/arrival — place or dismiss an
// arrival (D-037); placing a commitment confirms it, dismissing rejects it (D-052).
// Allowed on non-active projects: arrivals still land and can be cleared there.

import { NextResponse, type NextRequest } from 'next/server'
import {
  badRequest, bumpCanvasVersion, conflict, fromDbError, isFiniteNumber, isRecord, isUuid, normaliseCompass, notFound,
  nowIso, readJson, requireProject, snap8, withAuth,
} from '@/lib/studio/db'
import type { AnyBlock, CompassEntry } from '@/lib/studio/types'
import type { AuthedContext } from '@/lib/supabase/route'

type Params = { params: Promise<{ id: string; blockId: string }> }

async function moveCommitmentEntry(
  auth: AuthedContext,
  block: AnyBlock,
  to: 'active' | 'rejected'
): Promise<CompassEntry | undefined> {
  if (block.type !== 'commitment') return undefined
  const entryId = isRecord(block.content) && isUuid(block.content.entry_id) ? block.content.entry_id : null
  if (!entryId) return undefined
  const { data: entry, error } = await auth.supabase
    .from('studio_compass_entries')
    .select('*')
    .eq('id', entryId)
    .maybeSingle()
  if (error) throw fromDbError(error)
  if (!entry) return undefined
  const current = entry as CompassEntry
  if (current.status !== 'pending') return normaliseCompass(current)
  const patch =
    to === 'active'
      ? { status: 'active', decided_at: nowIso() }
      : { status: 'rejected', decided_at: nowIso(), rejection_note: 'dismissed' }
  const { data: updated, error: uErr } = await auth.supabase
    .from('studio_compass_entries')
    .update(patch)
    .eq('id', entryId)
    .select('*')
    .maybeSingle()
  if (uErr) throw fromDbError(uErr)
  return updated ? normaliseCompass(updated as CompassEntry) : undefined
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id, blockId } = await params
  return withAuth(async (auth) => {
    const body = await readJson<Record<string, unknown>>(req)
    if (body.action !== 'place' && body.action !== 'dismiss') throw badRequest('action must be place or dismiss')
    if (!isUuid(blockId)) throw notFound()
    await requireProject(auth, id)

    const { data: found, error: fErr } = await auth.supabase
      .from('studio_blocks')
      .select('*')
      .eq('id', blockId)
      .eq('project_id', id)
      .is('deleted_at', null)
      .maybeSingle()
    if (fErr) throw fromDbError(fErr)
    if (!found) throw notFound()
    const block = found as AnyBlock

    if (body.action === 'place') {
      if (block.arrival_state === 'placed') return NextResponse.json({ block })
      const patch: Record<string, unknown> = { arrival_state: 'placed' }
      if (body.x !== undefined || body.y !== undefined) {
        if (!isFiniteNumber(body.x) || !isFiniteNumber(body.y)) throw badRequest('x and y must both be numbers')
        patch.x = snap8(body.x)
        patch.y = snap8(body.y)
      }
      if (body.placed_by !== undefined) {
        if (body.placed_by !== 'auto' && body.placed_by !== 'person') throw badRequest('placed_by must be auto or person')
        patch.placed_by = body.placed_by
      }
      const { data, error } = await auth.supabase
        .from('studio_blocks')
        .update(patch)
        .eq('id', blockId)
        .select('*')
        .single()
      if (error || !data) throw fromDbError(error)
      const compass_entry = await moveCommitmentEntry(auth, block, 'active')
      await bumpCanvasVersion(auth, id)
      return NextResponse.json(compass_entry ? { block: data as AnyBlock, compass_entry } : { block: data as AnyBlock })
    }

    // dismiss: soft delete (undoable in-session); the talk entry keeps the words
    if (block.arrival_state !== 'unplaced') throw conflict('block is already placed')
    const { data, error } = await auth.supabase
      .from('studio_blocks')
      .update({ deleted_at: nowIso() })
      .eq('id', blockId)
      .select('*')
      .single()
    if (error || !data) throw fromDbError(error)
    const compass_entry = await moveCommitmentEntry(auth, block, 'rejected')
    await bumpCanvasVersion(auth, id)
    return NextResponse.json(compass_entry ? { block: data as AnyBlock, compass_entry } : { block: data as AnyBlock })
  })
}
