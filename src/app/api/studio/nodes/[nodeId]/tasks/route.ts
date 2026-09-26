// GET /api/studio/nodes/:nodeId/tasks — a piece's checklist.
// POST — add a task. PATCH — toggle a task's status. DELETE — remove a task.
//
// studio_tasks mirrors the main app's `tasks` table (migration 007), with
// node_id replacing piece_id. This is the Studio-side equivalent of
// /api/project-board/tasks, used by Idea Lab's task-roadmap review screen
// (POST/DELETE) and Write mode's Tasks tool (POST/PATCH) for projects created
// through the new node/thread model. It does not touch `tasks` itself.

import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, fromDbError, isRecord, isString, readJson, withAuth } from '@/lib/studio/db'
import { requireNode } from '@/lib/studio/nodes-db'

type Params = { params: Promise<{ nodeId: string }> }

const TASK_TYPES = new Set(['creation', 'execution'])
const TASK_STATUSES = new Set(['pending', 'complete'])

export async function GET(_req: NextRequest, { params }: Params) {
  const { nodeId } = await params
  return withAuth(async (auth) => {
    const node = await requireNode(auth, nodeId)
    const { data, error } = await auth.supabase
      .from('studio_tasks')
      .select('id, title, type, status, is_writing_related')
      .eq('node_id', node.id)
      .eq('user_id', auth.user.id)
      .order('order', { ascending: true })
    if (error) throw fromDbError(error)
    return NextResponse.json({ success: true, tasks: data ?? [] })
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { nodeId } = await params
  return withAuth(async (auth) => {
    const node = await requireNode(auth, nodeId)
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')
    if (!isString(body.title) || !body.title.trim()) throw badRequest('title required')
    const type = body.type === 'execution' ? 'execution' : 'creation'
    if (body.type !== undefined && !TASK_TYPES.has(body.type as string)) throw badRequest('type must be creation or execution')

    const { data: maxOrderRow } = await auth.supabase
      .from('studio_tasks')
      .select('order')
      .eq('node_id', node.id)
      .eq('user_id', auth.user.id)
      .order('order', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextOrder = ((maxOrderRow as { order: number } | null)?.order ?? -1) + 1

    const { data, error } = await auth.supabase
      .from('studio_tasks')
      .insert({
        user_id: auth.user.id,
        project_id: node.project_id,
        node_id: node.id,
        title: (body.title as string).trim(),
        type,
        order: nextOrder,
        status: 'pending',
      })
      .select('id, title, type, status, is_writing_related')
      .single()
    if (error) throw fromDbError(error)
    return NextResponse.json({ success: true, task: data }, { status: 201 })
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { nodeId } = await params
  return withAuth(async (auth) => {
    await requireNode(auth, nodeId) // ensures the node (and thus the task) is the person's own
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')
    if (!isString(body.task_id)) throw badRequest('task_id required')
    if (!isString(body.status) || !TASK_STATUSES.has(body.status)) throw badRequest('status must be pending or complete')

    const { error } = await auth.supabase
      .from('studio_tasks')
      .update({ status: body.status })
      .eq('id', body.task_id)
      .eq('node_id', nodeId)
      .eq('user_id', auth.user.id)
    if (error) throw fromDbError(error)
    return NextResponse.json({ success: true })
  })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { nodeId } = await params
  return withAuth(async (auth) => {
    await requireNode(auth, nodeId)
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')
    if (!isString(body.task_id)) throw badRequest('task_id required')

    const { error } = await auth.supabase
      .from('studio_tasks')
      .delete()
      .eq('id', body.task_id)
      .eq('node_id', nodeId)
      .eq('user_id', auth.user.id)
    if (error) throw fromDbError(error)
    return NextResponse.json({ success: true })
  })
}
