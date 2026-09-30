// POST /api/studio/nodes/:nodeId/check — reads one piece or part against the
// rules in force over it. The reading itself, and the rules it keeps, live in
// lib/studio/rule-check.ts.

import { aiGate } from '@/lib/billing/fair-use'
import { NextResponse, type NextRequest } from 'next/server'
import { withAuth } from '@/lib/studio/db'
import { checkNodeAgainstRules } from '@/lib/studio/rule-check'

export const maxDuration = 60

type Params = { params: Promise<{ nodeId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { nodeId } = await params
  return withAuth(async (auth) => {
    const gated = await aiGate(auth)
    if (gated) return gated
    return NextResponse.json(await checkNodeAgainstRules(auth, nodeId))
  })
}
