// PATCH /api/studio/checks/:checkId — how a collision was answered.
// `amended` is the interesting one: the rule changed, which is the only honest
// way a vision evolves inside the app. Amending retires the old rule on its
// source and leaves the new one in its place — done by the client, which owns
// the wording; this route records what happened.

import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, fromDbError, isRecord, readJson, withAuth } from '@/lib/studio/db'
import type { CheckOutcome, RuleCheck } from '@/lib/studio/node-types'

type Params = { params: Promise<{ checkId: string }> }
const OUTCOMES: CheckOutcome[] = ['fixed', 'amended', 'meant_it', 'dismissed']

export async function PATCH(req: NextRequest, { params }: Params) {
  const { checkId } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')
    if (typeof body.outcome !== 'string' || !OUTCOMES.includes(body.outcome as CheckOutcome)) {
      throw badRequest('outcome must be fixed, amended, meant_it or dismissed')
    }
    const note = typeof body.note === 'string' ? body.note.slice(0, 1000) : null

    const { data, error } = await auth.supabase
      .from('studio_rule_checks')
      .update({ outcome: body.outcome, outcome_note: note, resolved_at: new Date().toISOString() })
      .eq('id', checkId)
      .eq('user_id', auth.user.id)
      .select('*')
      .single()
    if (error) throw fromDbError(error)
    return NextResponse.json({ check: data as RuleCheck })
  })
}
