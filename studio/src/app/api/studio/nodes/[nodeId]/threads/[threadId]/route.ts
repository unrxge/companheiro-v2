// PUT/DELETE /api/studio/nodes/:nodeId/threads/:threadId — a node's appearance
// in a thread. `note` is what this part does for that thread; the filtered read
// shows it above the node's own words.

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, fromDbError, isRecord, noContent, readJson,
  requireProject, withAuth,
} from '@/lib/studio/db'
import { requireNode, requireThread } from '@/lib/studio/nodes-db'

type Params = { params: Promise<{ nodeId: string; threadId: string }> }
const NOTE_MAX = 1000

export async function PUT(req: NextRequest, { params }: Params) {
  const { nodeId, threadId } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req).catch(() => ({}))
    const node = await requireNode(auth, nodeId)
    const thread = await requireThread(auth, threadId)
    if (node.project_id !== thread.project_id) throw badRequest('a thread never leaves its project')
    const project = await requireProject(auth, node.project_id)
    assertProjectWritable(project)

    const note =
      isRecord(body) && typeof body.note === 'string' ? body.note.slice(0, NOTE_MAX) : ''

    const { error } = await auth.supabase
      .from('studio_node_threads')
      .upsert(
        { node_id: node.id, thread_id: thread.id, user_id: auth.user.id, note },
        { onConflict: 'node_id,thread_id' },
      )
    if (error) throw fromDbError(error)
    return NextResponse.json({ tag: { node_id: node.id, thread_id: thread.id, note } })
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { nodeId, threadId } = await params
  return withAuth(async (auth) => {
    const node = await requireNode(auth, nodeId)
    const project = await requireProject(auth, node.project_id)
    assertProjectWritable(project)
    const { error } = await auth.supabase
      .from('studio_node_threads')
      .delete()
      .eq('node_id', node.id)
      .eq('thread_id', threadId)
      .eq('user_id', auth.user.id)
    if (error) throw fromDbError(error)
    return noContent()
  })
}
