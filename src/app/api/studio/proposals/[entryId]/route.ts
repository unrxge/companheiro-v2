// POST /api/studio/proposals/:entryId — { action: 'keep' | 'decline', text? }.
// Keeping writes the rule (with their wording, if they changed it) onto the
// piece or project it was said about; declining means it is never offered again.

import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, isRecord, isString, isUuid, notFound, readJson, withAuth } from '@/lib/studio/db'
import { decideProposal } from '@/lib/studio/rule-proposals'

type Params = { params: Promise<{ entryId: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { entryId } = await params
  return withAuth(async (auth) => {
    if (!isUuid(entryId)) throw notFound()
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')
    const action = body.action === 'keep' ? 'keep' : body.action === 'decline' ? 'decline' : null
    if (!action) throw badRequest('action must be keep or decline')
    const text = isString(body.text) ? body.text : undefined
    const result = await decideProposal(auth, entryId, action, text)
    return NextResponse.json(result)
  })
}
