// GET/POST /api/studio/projects/:id/threads — the things that run across the
// sequence: a character's arc, a question being seeded, a motif, an argument.

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, fromDbError, isRecord, readJson, requireProject, withAuth,
} from '@/lib/studio/db'
import { THREAD_COLS, clampText, normaliseThread } from '@/lib/studio/nodes-db'
import type { ThreadHue } from '@/lib/studio/node-types'

type Params = { params: Promise<{ id: string }> }
const HUES: ThreadHue[] = ['ember', 'verdant', 'violet', 'ochre', 'tide']

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const project = await requireProject(auth, id)
    const { data, error } = await auth.supabase
      .from('studio_threads')
      .select(THREAD_COLS)
      .eq('project_id', project.id)
      .eq('user_id', auth.user.id)
      .order('position')
    if (error) throw fromDbError(error)
    return NextResponse.json({ threads: (data ?? []).map(normaliseThread) })
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')

    const project = await requireProject(auth, id)
    assertProjectWritable(project)

    const { count, error: countErr } = await auth.supabase
      .from('studio_threads')
      .select('id', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('user_id', auth.user.id)
    if (countErr) throw fromDbError(countErr)

    const position = count ?? 0
    const hue = HUES[position % HUES.length]

    const { data, error } = await auth.supabase
      .from('studio_threads')
      .insert({
        user_id: auth.user.id,
        project_id: project.id,
        position,
        name: body.name === undefined ? '' : clampText(body.name, 'title', 'name'),
        intent: body.intent === undefined ? '' : clampText(body.intent, 'intent', 'intent'),
        hue: typeof body.hue === 'string' && HUES.includes(body.hue as ThreadHue) ? body.hue : hue,
      })
      .select(THREAD_COLS)
      .single()
    if (error) throw fromDbError(error)
    return NextResponse.json({ thread: normaliseThread(data) }, { status: 201 })
  })
}
