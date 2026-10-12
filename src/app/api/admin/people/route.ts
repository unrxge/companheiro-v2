import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { moneyConfig, requireAdmin } from '@/lib/ops/admin'
import { currentEnv } from '@/lib/ops/ai-calls'
import { personMoney } from '@/lib/ops/money'
import { analyticsChoiceOf, sharesAnalytics } from '@/lib/usage-analytics'
import { summarise } from '@/lib/ops/people'
import { accountsFor, everyUser, listRows, moneyRows } from '@/lib/ops/people-db'

/**
 * GET /api/admin/people — usage analytics, one line per person who shares
 * them: their plan, how many projects sit where, when they were last at
 * work, how often they have written this month, and what they have cost
 * and brought in. Owner only. Someone who
 * has switched analytics off, or has not yet been told about them, is not in
 * the list; they are only counted, so the totals add up.
 */
export async function GET() {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const db = adminClient()
  if (!db) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 500 })

  try {
    const users = await everyUser(db)
    const sharing = users.filter((u) => sharesAnalytics(u.user_metadata))
    const accounts = await accountsFor(db, sharing)
    const rows = await listRows(db, sharing.map((u) => u.id))
    const of = (id: string) => ({
      studio_projects: (rows.studio_projects ?? []).filter((r) => r.user_id === id),
      writing_activity: (rows.writing_activity ?? []).filter((r) => r.user_id === id),
    })
    const { calls, events } = await moneyRows(db, sharing.map((u) => u.id), currentEnv())
    const prices = moneyConfig()
    const people = accounts
      .map((a) => ({ ...summarise(a, of(a.id)), money: personMoney(events.get(a.id) ?? [], calls.get(a.id) ?? [], prices) }))
      .sort((a, b) => (b.lastActive ?? b.joined).localeCompare(a.lastActive ?? a.joined))
    return NextResponse.json({
      people,
      switchedOff: users.filter((u) => !analyticsChoiceOf(u.user_metadata).on).length,
      notYetTold: users.filter((u) => { const c = analyticsChoiceOf(u.user_metadata); return c.on && !c.told }).length,
    })
  } catch (error) {
    console.error('admin people error:', error)
    return NextResponse.json({ error: 'Could not read usage analytics.' }, { status: 500 })
  }
}
