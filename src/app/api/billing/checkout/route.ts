import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { getStripe } from '@/lib/billing/stripe'
import { priceIdFor, isTier, isInterval } from '@/lib/billing/plans'

/** POST /api/billing/checkout — start a Stripe Checkout session for a plan. */
export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { supabase, user } = auth

    const body = await request.json().catch(() => ({}))
    const { tier, interval } = body
    if (!isTier(tier) || !isInterval(interval)) {
      return NextResponse.json({ error: 'tier and interval are required' }, { status: 400 })
    }

    const { data: existing } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    const origin = new URL(request.url).origin
    const stripe = getStripe()
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: existing?.stripe_customer_id ?? undefined,
      customer_email: existing?.stripe_customer_id ? undefined : user.email,
      client_reference_id: user.id,
      line_items: [{ price: priceIdFor(tier, interval), quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${origin}/account/billing?checkout=success`,
      cancel_url: `${origin}/account/billing?checkout=cancelled`,
    })

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('billing checkout error:', error)
    return NextResponse.json({ error: 'Could not start checkout' }, { status: 500 })
  }
}
