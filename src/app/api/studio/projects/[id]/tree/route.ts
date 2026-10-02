// GET /api/studio/projects/:id/tree — the whole work in one round trip:
// nodes, threads, the cross-cutting tags, and any rule check still open.

import { NextResponse, type NextRequest } from 'next/server'
import { requireProject, withAuth } from '@/lib/studio/db'
import { loadTree } from '@/lib/studio/nodes-db'
import { projectAccess } from '@/lib/studio/plan-access'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    // Side by side: the tree read is limited to the person's own rows by the
    // database, and a project that is not theirs fails requireProject either way.
    const [project, tree] = await Promise.all([requireProject(auth, id), loadTree(auth, id)])
    // What the plan allows here: whether this is the project being worked on,
    // and which canvas tools it carries.
    const access = await projectAccess(auth, project)
    return NextResponse.json({ project, tree, access })
  })
}
