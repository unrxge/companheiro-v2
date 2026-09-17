// POST /api/studio/catches/:catchId — the person marks a catch right or wrong
// (D-056). A mark is final for the sentence (it is never re-spoken); `wrong`
// feeds later context under "where you said the companion was wrong".

import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, fromDbError, isRecord, isUuid, notFound, nowIso, readJson, withAuth } from '@/lib/studio/db'
import type { Catch, CatchMarkRequest } from '@/lib/studio/types'

type Params = { params: Promise<{ catchId: string }> }

function parseMark(body: unknown): CatchMarkRequest {
  if (!isRecord(body)) throw badRequest('body required')
  if (body.mark !== 'right' && body.mark !== 'wrong') throw badRequest('mark must be right or wrong')
  return { mark: body.mark }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { catchId } = await params
  return withAuth(async (auth) => {
    const { mark } = parseMark(await readJson(req))
    if (!isUuid(catchId)) throw notFound()
    const { data, error } = await auth.supabase
      .from('studio_catches')
      .update({ mark, marked_at: nowIso() })
      .eq('id', catchId)
      .select('*')
      .maybeSingle()
    if (error) throw fromDbError(error)
    if (!data) throw notFound()
    return NextResponse.json({ catch: data as Catch })
  })
}
