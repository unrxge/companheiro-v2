// POST /api/studio/projects/:id/concept — lane H (10.3, D-062): inserts a
// dated revision (origin `edit`) and bumps canvas_version. History is never
// overwritten; the bundle carries the latest revision.

import { NextResponse, type NextRequest } from 'next/server'
import {
  assertProjectWritable, badRequest, bumpCanvasVersion, fromDbError, isRecord, isString, isStringArray, readJson,
  requireProject, withAuth,
} from '@/lib/studio/db'
import { splitConstraints } from '@/lib/studio/concept'
import type { ConceptRevision } from '@/lib/studio/types'

type Params = { params: Promise<{ id: string }> }

const BODY_MAX = 4000
const CONSTRAINT_MAX = 24

function parseRevisionBody(body: unknown): { body: string; constraints: string[] } {
  if (!isRecord(body)) throw badRequest('body required')
  if (!isString(body.body) || !body.body.trim()) throw badRequest('body must be text')
  if (body.constraints !== undefined && !isStringArray(body.constraints)) throw badRequest('constraints must be lines')
  const constraints = splitConstraints((body.constraints ?? []).join('\n')).slice(0, CONSTRAINT_MAX)
  return { body: body.body.trim().slice(0, BODY_MAX), constraints }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const input = parseRevisionBody(await readJson(req))
    const project = await requireProject(auth, id)
    assertProjectWritable(project)

    const { data, error } = await auth.supabase
      .from('studio_concept_revisions')
      .insert({
        user_id: auth.user.id,
        project_id: project.id,
        body: input.body,
        constraints: input.constraints,
        origin: 'edit',
      })
      .select('id, project_id, body, constraints, origin, created_at')
      .single()
    if (error) throw fromDbError(error)

    await bumpCanvasVersion(auth, project.id)

    const row = data as ConceptRevision
    const revision: ConceptRevision = { ...row, constraints: Array.isArray(row.constraints) ? row.constraints : [] }
    return NextResponse.json({ revision })
  })
}
