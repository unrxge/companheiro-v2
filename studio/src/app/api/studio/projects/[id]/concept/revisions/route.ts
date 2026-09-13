// GET /api/studio/projects/:id/concept/revisions — lane H (10.3): every
// revision of the concept, newest first. The diff summary is computed client-side.

import { NextResponse, type NextRequest } from 'next/server'
import { fromDbError, requireProject, withAuth } from '@/lib/studio/db'
import type { ConceptRevision } from '@/lib/studio/types'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const project = await requireProject(auth, id)
    const { data, error } = await auth.supabase
      .from('studio_concept_revisions')
      .select('id, project_id, body, constraints, origin, created_at')
      .eq('project_id', project.id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
    if (error) throw fromDbError(error)
    const revisions: ConceptRevision[] = ((data ?? []) as ConceptRevision[]).map((r) => ({
      ...r,
      constraints: Array.isArray(r.constraints) ? r.constraints : [],
    }))
    return NextResponse.json({ revisions })
  })
}
