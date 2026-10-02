import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { getSubscription } from '@/lib/billing/access'
import { allowanceFor, usageFor } from '@/lib/billing/fair-use'
import { entitlementsFor } from '@/lib/billing/entitlements'

/** GET /api/billing/status — the current user's plan/trial state and fair-use standing. */
export async function GET() {
  const auth = await requireUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const subscription = await getSubscription(auth.supabase, auth.user.id)
  const allowance = allowanceFor(subscription)
  const usage =
    allowance.kind === 'capped'
      ? {
          plan: allowance.plan,
          period: allowance.period,
          used_micros: await usageFor(auth, allowance.period),
          cap_micros: allowance.hardMicros,
        }
      : null
  const entitlements = entitlementsFor(subscription)
  // More projects in Active than the plan carries (a trial that ended, or a
  // move from Direction to Practice): the person chooses which one stays.
  let over_limit: Array<{ id: string; title: string }> | null = null
  if (entitlements.maxActiveProjects !== null) {
    const { data } = await auth.supabase
      .from('studio_projects')
      .select('id, title')
      .eq('user_id', auth.user.id)
      .eq('shelf_stage', 'active')
      .order('last_opened_at', { ascending: false })
    const active = (data as Array<{ id: string; title: string }> | null) ?? []
    if (active.length > entitlements.maxActiveProjects) over_limit = active
  }
  return NextResponse.json({ subscription, access: allowance.kind, usage, entitlements, over_limit })
}
