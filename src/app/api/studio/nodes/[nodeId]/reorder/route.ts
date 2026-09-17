// POST /api/studio/nodes/:nodeId/reorder — rewrites the order of one node's
// children. The dragged storyline sends the whole sibling list, so the server
// never has to guess what moved.

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, fromDbError, isRecord, isStringArray, readJson,
  requireProject, withAuth,
} from '@/lib/studio/db'
import { NODE_COLS, normaliseNode, requireNode } from '@/lib/studio/nodes-db'

type Params = { params: Promise<{ nodeId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { nodeId } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body) || !isStringArray(body.ids)) throw badRequest('ids must be a list')

    const parent = await requireNode(auth, nodeId)
    const project = await requireProject(auth, parent.project_id)
    assertProjectWritable(project)

    const { data: children, error } = await auth.supabase
      .from('studio_nodes')
      .select('id')
      .eq('parent_id', parent.id)
      .eq('user_id', auth.user.id)
    if (error) throw fromDbError(error)

    const known = new Set((children ?? []).map((c: { id: string }) => c.id))
    if (body.ids.length !== known.size || !body.ids.every((id) => known.has(id))) {
      throw badRequest('ids must be exactly this node’s children')
    }

    for (const [position, id] of body.ids.entries()) {
      const { error: upErr } = await auth.supabase
        .from('studio_nodes')
        .update({ position })
        .eq('id', id)
        .eq('user_id', auth.user.id)
      if (upErr) throw fromDbError(upErr)
    }

    const { data: fresh, error: freshErr } = await auth.supabase
      .from('studio_nodes')
      .select(NODE_COLS)
      .eq('parent_id', parent.id)
      .eq('user_id', auth.user.id)
      .order('position')
    if (freshErr) throw fromDbError(freshErr)
    return NextResponse.json({ nodes: (fresh ?? []).map(normaliseNode) })
  })
}
