// PATCH /api/studio/projects/:id/tasks — tick or untick one of the project's
// tasks from the canvas's task list, whichever piece it belongs to, or put a
// run of them in a new order. (The writing page's own Tasks tool uses
// /api/studio/nodes/:nodeId/tasks.)

import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, fromDbError, isRecord, isUuid, readJson, requireProject, withAuth } from '@/lib/studio/db'
import { assertProjectIdWorkable } from '@/lib/studio/plan-access'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')

    // A new order for some of the tasks, as dragged in the larger task list.
    if (Array.isArray(body.order)) {
      const ids = body.order.filter(isUuid).slice(0, 200)
      if (ids.length === 0) throw badRequest('order must be a list of task ids')
      const project = await requireProject(auth, id)
      await assertProjectIdWorkable(auth, project.id)
      // One update each: the rows are few, and this keeps every other task's
      // place untouched rather than renumbering the whole project.
      for (const [at, taskId] of ids.entries()) {
        const { error } = await auth.supabase
          .from('studio_tasks')
          .update({ order: at })
          .eq('id', taskId)
          .eq('project_id', project.id)
          .eq('user_id', auth.user.id)
        if (error) throw fromDbError(error)
      }
      return NextResponse.json({ success: true })
    }

    if (!isUuid(body.task_id)) throw badRequest('task_id required')
    if (body.status !== 'pending' && body.status !== 'complete') throw badRequest('status must be pending or complete')
    const project = await requireProject(auth, id)
    await assertProjectIdWorkable(auth, project.id)
    const { error } = await auth.supabase
      .from('studio_tasks')
      .update({ status: body.status })
      .eq('id', body.task_id)
      .eq('project_id', project.id)
      .eq('user_id', auth.user.id)
    if (error) throw fromDbError(error)
    return NextResponse.json({ success: true })
  })
}
