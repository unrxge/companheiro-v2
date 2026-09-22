import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { getSubscription } from '@/lib/billing/access'

/** GET /api/billing/status — the current user's plan/trial state. */
export async function GET() {
  const auth = await requireUser()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const subscription = await getSubscription(auth.supabase, auth.user.id)
  return NextResponse.json({ subscription })
}
