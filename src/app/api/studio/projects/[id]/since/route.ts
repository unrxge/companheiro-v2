// GET /api/studio/projects/:id/since — the poll target (D-031); no side effects.

import { NextResponse, type NextRequest } from 'next/server'
import { isUuid, notFound, sinceFor, withAuth } from '@/lib/studio/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    if (!isUuid(id)) throw notFound()
    const since = await sinceFor(auth, id)
    if (!since) throw notFound()
    return NextResponse.json({ since })
  })
}
