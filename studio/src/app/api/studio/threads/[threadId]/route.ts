// PATCH/DELETE /api/studio/threads/:threadId

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, fromDbError, isRecord, noContent, readJson,
  requireProject, withAuth,
} from '@/lib/studio/db'
import { THREAD_COLS, clampText, normaliseRules, normaliseThread, requireThread } from '@/lib/studio/nodes-db'
import type { ThreadHue } from '@/lib/studio/node-types'

type Params = { params: Promise<{ threadId: string }> }
const HUES: ThreadHue[] = ['ember', 'verdant', 'violet', 'ochre', 'tide']

export async function PATCH(req: NextRequest, { params }: Params) {
  const { threadId } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')

    const thread = await requireThread(auth, threadId)
    const project = await requireProject(auth, thread.project_id)
    assertProjectWritable(project)

    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = clampText(body.name, 'title', 'name')
    if (body.intent !== undefined) patch.intent = clampText(body.intent, 'intent', 'intent')
    if (body.rules !== undefined) patch.rules = normaliseRules(body.rules)
    if (body.hue !== undefined) {
      if (typeof body.hue !== 'string' || !HUES.includes(body.hue as ThreadHue)) throw badRequest('unknown hue')
      patch.hue = body.hue
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ thread })

    const { data, error } = await auth.supabase
      .from('studio_threads')
      .update(patch)
      .eq('id', thread.id)
      .eq('user_id', auth.user.id)
      .select(THREAD_COLS)
      .single()
    if (error) throw fromDbError(error)
    return NextResponse.json({ thread: normaliseThread(data) })
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { threadId } = await params
  return withAuth(async (auth) => {
    const thread = await requireThread(auth, threadId)
    const project = await requireProject(auth, thread.project_id)
    assertProjectWritable(project)
    const { error } = await auth.supabase
      .from('studio_threads')
      .delete()
      .eq('id', thread.id)
      .eq('user_id', auth.user.id)
    if (error) throw fromDbError(error)
    return noContent()
  })
}
