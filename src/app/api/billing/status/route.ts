import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { getSubscription } from '@/lib/billing/access'
import { allowanceFor, usageFor } from '@/lib/billing/fair-use'

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
          cap_micros: allowance.capMicros,
        }
      : null
  return NextResponse.json({ subscription, access: allowance.kind, usage })
}
