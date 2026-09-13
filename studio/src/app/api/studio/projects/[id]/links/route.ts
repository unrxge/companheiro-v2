// POST /api/studio/projects/:id/links — a hairline between two blocks (D-023);
// the DB trigger keeps links inside the project; duplicates are 409.

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, bumpCanvasVersion, fromDbError, isString, isUuid, readJson, requireProject, withAuth,
} from '@/lib/studio/db'
import type { Link } from '@/lib/studio/types'

type Params = { params: Promise<{ id: string }> }

const MAX_WORD = 24

function parseWord(v: unknown): string | null {
  if (v === undefined || v === null) return null
  if (!isString(v)) throw badRequest('word must be text')
  const word = v.trim()
  if (!word) return null
  if (word.length > MAX_WORD) throw badRequest(`word must be ${MAX_WORD} characters or fewer`)
  return word
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson<Record<string, unknown>>(req)
    const linkId = body.id === undefined ? crypto.randomUUID() : body.id
    if (!isUuid(linkId)) throw badRequest('id must be a uuid')
    if (!isUuid(body.from_block_id) || !isUuid(body.to_block_id)) throw badRequest('from_block_id and to_block_id must be uuids')
    if (body.from_block_id === body.to_block_id) throw badRequest('a link needs two different blocks')
    const word = parseWord(body.word)

    const project = await requireProject(auth, id)
    assertProjectWritable(project)

    const { data, error } = await auth.supabase
      .from('studio_links')
      .insert({
        id: linkId,
        user_id: auth.user.id,
        project_id: id,
        from_block_id: body.from_block_id,
        to_block_id: body.to_block_id,
        word,
      })
      .select('*')
      .single()
    if (error || !data) throw fromDbError(error)
    await bumpCanvasVersion(auth, id)
    return NextResponse.json({ link: data as Link }, { status: 201 })
  })
}
