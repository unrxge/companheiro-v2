// POST /api/studio/compass/:entryId — the person's verbs on a compass entry (D-053, D-058, D-052)

import { NextResponse, type NextRequest } from 'next/server'
import { isUuid, notFound, readJson, withAuth } from '@/lib/studio/db'
import { decide, parseDecideRequest } from '@/lib/studio/compass'

type Params = { params: Promise<{ entryId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { entryId } = await params
  return withAuth(async (auth) => {
    const decision = parseDecideRequest(await readJson(req))
    if (!isUuid(entryId)) throw notFound()
    const entry = await decide(auth, entryId, decision)
    return NextResponse.json({ entry })
  })
}
