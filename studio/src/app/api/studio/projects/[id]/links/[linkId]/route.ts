// PATCH /api/studio/projects/:id/links/:linkId — the word · DELETE — remove the link

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, bumpCanvasVersion, fromDbError, isString, isUuid, noContent, notFound, readJson,
  requireProject, withAuth,
} from '@/lib/studio/db'
import type { Link } from '@/lib/studio/types'

type Params = { params: Promise<{ id: string; linkId: string }> }

const MAX_WORD = 24

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, linkId } = await params
  return withAuth(async (auth) => {
    const body = await readJson<Record<string, unknown>>(req)
    if (!('word' in body)) throw badRequest('word required (text or null)')
    let word: string | null = null
    if (body.word !== null) {
      if (!isString(body.word)) throw badRequest('word must be text or null')
      word = body.word.trim() || null
      if (word && word.length > MAX_WORD) throw badRequest(`word must be ${MAX_WORD} characters or fewer`)
    }
    if (!isUuid(linkId)) throw notFound()
    const project = await requireProject(auth, id)
    assertProjectWritable(project)

    const { data, error } = await auth.supabase
      .from('studio_links')
      .update({ word })
      .eq('id', linkId)
      .eq('project_id', id)
      .select('*')
      .maybeSingle()
    if (error) throw fromDbError(error)
    if (!data) throw notFound()
    await bumpCanvasVersion(auth, id)
    return NextResponse.json({ link: data as Link })
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, linkId } = await params
  return withAuth(async (auth) => {
    if (!isUuid(linkId)) throw notFound()
    const project = await requireProject(auth, id)
    assertProjectWritable(project)

    const { data, error } = await auth.supabase
      .from('studio_links')
      .delete()
      .eq('id', linkId)
      .eq('project_id', id)
      .select('id')
    if (error) throw fromDbError(error)
    if (!data || data.length === 0) throw notFound()
    await bumpCanvasVersion(auth, id)
    return noContent()
  })
}
