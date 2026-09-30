// GET /api/studio/projects/:id/proposals?node_id= — rules heard in talk that
// are still waiting for the person's answer, for one conversation.

import { NextResponse, type NextRequest } from 'next/server'
import { isUuid, requireProject, withAuth } from '@/lib/studio/db'
import { listPending } from '@/lib/studio/rule-proposals'

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const nodeParam = req.nextUrl.searchParams.get('node_id')
  return withAuth(async (auth) => {
    const project = await requireProject(auth, id)
    const proposals = await listPending(auth, project.id, isUuid(nodeParam) ? nodeParam : null)
    return NextResponse.json({ proposals })
  })
}
