// PATCH /api/studio/nodes/:nodeId — edits one node. Every field is optional;
// `body` recounts the extent so the storyline axis stays honest.
// DELETE removes it and, by the foreign key, everything under it.

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, fromDbError, isRecord, noContent, readJson,
  requireProject, withAuth,
} from '@/lib/studio/db'
import { NODE_COLS, clampText, extentFor, normaliseNode, normaliseRules, requireNode } from '@/lib/studio/nodes-db'
import type { NodeStatus } from '@/lib/studio/node-types'

type Params = { params: Promise<{ nodeId: string }> }
const STATUSES: NodeStatus[] = ['open', 'drafted', 'done']

export async function PATCH(req: NextRequest, { params }: Params) {
  const { nodeId } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')

    const node = await requireNode(auth, nodeId)
    const project = await requireProject(auth, node.project_id)
    assertProjectWritable(project)

    const patch: Record<string, unknown> = {}
    if (body.title !== undefined) patch.title = clampText(body.title, 'title', 'title')
    if (body.intent !== undefined) patch.intent = clampText(body.intent, 'intent', 'intent')
    if (body.beat !== undefined) patch.beat = clampText(body.beat, 'beat', 'beat')
    if (body.stands_whole !== undefined) patch.stands_whole = body.stands_whole === true
    if (body.rules !== undefined) patch.rules = normaliseRules(body.rules)
    if (body.body !== undefined) {
      const html = clampText(body.body, 'body', 'body')
      patch.body = html
      patch.extent = extentFor(html)
    }
    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !STATUSES.includes(body.status as NodeStatus)) {
        throw badRequest('status must be open, drafted or done')
      }
      patch.status = body.status
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ node })

    const { data, error } = await auth.supabase
      .from('studio_nodes')
      .update(patch)
      .eq('id', node.id)
      .eq('user_id', auth.user.id)
      .select(NODE_COLS)
      .single()
    if (error) throw fromDbError(error)
    return NextResponse.json({ node: normaliseNode(data) })
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { nodeId } = await params
  return withAuth(async (auth) => {
    const node = await requireNode(auth, nodeId)
    const project = await requireProject(auth, node.project_id)
    assertProjectWritable(project)
    const { error } = await auth.supabase
      .from('studio_nodes')
      .delete()
      .eq('id', node.id)
      .eq('user_id', auth.user.id)
    if (error) throw fromDbError(error)
    return noContent()
  })
}
