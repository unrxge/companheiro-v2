// POST /api/studio/projects/:id/blocks/:blockId/strike — strike with a sentence · DELETE — unstrike

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, bumpCanvasVersion, fromDbError, isString, isUuid, notFound, nowIso, readJson,
  requireProject, withAuth,
} from '@/lib/studio/db'
import type { AnyBlock } from '@/lib/studio/types'
import type { AuthedContext } from '@/lib/supabase/route'

type Params = { params: Promise<{ id: string; blockId: string }> }

const MAX_SENTENCE = 280

async function writeStrike(auth: AuthedContext, projectId: string, blockId: string, patch: { struck_at: string | null; struck_by: string | null }) {
  if (!isUuid(blockId)) throw notFound()
  const { data, error } = await auth.supabase
    .from('studio_blocks')
    .update(patch)
    .eq('id', blockId)
    .eq('project_id', projectId)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle()
  if (error) throw fromDbError(error)
  if (!data) throw notFound()
  await bumpCanvasVersion(auth, projectId)
  return data as AnyBlock
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id, blockId } = await params
  return withAuth(async (auth) => {
    const body = await readJson<Record<string, unknown>>(req)
    const sentence = isString(body.sentence) ? body.sentence.trim() : ''
    if (!sentence) throw badRequest('sentence required')
    if (sentence.length > MAX_SENTENCE) throw badRequest(`sentence must be ${MAX_SENTENCE} characters or fewer`)
    const project = await requireProject(auth, id)
    assertProjectWritable(project)
    const block = await writeStrike(auth, id, blockId, { struck_at: nowIso(), struck_by: sentence })
    return NextResponse.json({ block })
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, blockId } = await params
  return withAuth(async (auth) => {
    const project = await requireProject(auth, id)
    assertProjectWritable(project)
    const block = await writeStrike(auth, id, blockId, { struck_at: null, struck_by: null })
    return NextResponse.json({ block })
  })
}
