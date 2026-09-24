import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { getStripe } from '@/lib/billing/stripe'

/** POST /api/billing/portal — open Stripe's hosted portal for an existing customer. */
export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { supabase, user } = auth

    const { data } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!data?.stripe_customer_id) {
      return NextResponse.json({ error: 'No billing account yet' }, { status: 400 })
    }

    const origin = new URL(request.url).origin
    const session = await getStripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${origin}/home`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('billing portal error:', error)
    return NextResponse.json({ error: 'Could not open billing portal' }, { status: 500 })
  }
}
