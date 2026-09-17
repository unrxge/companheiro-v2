// POST /api/studio/projects/:id/nodes/reorder — reorders the pieces at the top
// of a project. The same shape as reordering a node's children, but the top has
// no parent to hang the route off.

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, fromDbError, isRecord, isStringArray, readJson,
  requireProject, withAuth,
} from '@/lib/studio/db'
import { NODE_COLS, normaliseNode } from '@/lib/studio/nodes-db'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body) || !isStringArray(body.ids)) throw badRequest('ids must be a list')

    const project = await requireProject(auth, id)
    assertProjectWritable(project)

    const { data: tops, error } = await auth.supabase
      .from('studio_nodes')
      .select('id')
      .eq('project_id', project.id)
      .eq('user_id', auth.user.id)
      .is('parent_id', null)
    if (error) throw fromDbError(error)

    const known = new Set((tops ?? []).map((n: { id: string }) => n.id))
    if (body.ids.length !== known.size || !body.ids.every((x) => known.has(x))) {
      throw badRequest('ids must be exactly this project’s pieces')
    }

    for (const [position, nodeId] of body.ids.entries()) {
      const { error: upErr } = await auth.supabase
        .from('studio_nodes')
        .update({ position })
        .eq('id', nodeId)
        .eq('user_id', auth.user.id)
      if (upErr) throw fromDbError(upErr)
    }

    const { data: fresh, error: freshErr } = await auth.supabase
      .from('studio_nodes')
      .select(NODE_COLS)
      .eq('project_id', project.id)
      .eq('user_id', auth.user.id)
      .is('parent_id', null)
      .order('position')
    if (freshErr) throw fromDbError(freshErr)
    return NextResponse.json({ nodes: (fresh ?? []).map(normaliseNode) })
  })
}
