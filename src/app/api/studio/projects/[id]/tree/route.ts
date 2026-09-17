// GET /api/studio/projects/:id/tree — the whole work in one round trip:
// nodes, threads, the cross-cutting tags, and any rule check still open.

import { NextResponse, type NextRequest } from 'next/server'
import { requireProject, withAuth } from '@/lib/studio/db'
import { loadTree } from '@/lib/studio/nodes-db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const project = await requireProject(auth, id)
    const tree = await loadTree(auth, project.id)
    return NextResponse.json({ project, tree })
  })
}
