import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { getStripe } from '@/lib/billing/stripe'
import { priceIdFor, isTier, isInterval } from '@/lib/billing/plans'
import { countryOf, localPricesFor } from '@/lib/billing/local-prices'

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
      .select('stripe_customer_id, status')
      .eq('user_id', user.id)
      .maybeSingle()
    // One plan at a time: changing it is done in the billing portal, so
    // nobody ends up paying for two.
    if (existing?.status === 'active' || existing?.status === 'past_due') {
      return NextResponse.json({ error: 'You already have a plan. Change it from Manage billing in Settings.', code: 'already_subscribed' }, { status: 409 })
    }

    const origin = new URL(request.url).origin
    const stripe = getStripe()
    const params = {
      mode: 'subscription' as const,
      customer: existing?.stripe_customer_id ?? undefined,
      customer_email: existing?.stripe_customer_id ? undefined : user.email,
      client_reference_id: user.id,
      line_items: [{ price: priceIdFor(tier, interval), quantity: 1 }],
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${origin}/home?checkout=success`,
      cancel_url: `${origin}/home?checkout=cancelled`,
    }
    // Charge the currency the page showed them (lib/billing/local-prices.ts).
    // Only for a new customer: one who has paid before is tied to the currency
    // they first paid in. If Stripe refuses the currency, checkout still opens
    // in the prices' own.
    const local = existing?.stripe_customer_id ? null : await localPricesFor(countryOf(request))
    const currency = local && local.source === 'stripe' && local.currency !== local.base ? local.currency : undefined
    let session
    try {
      session = await stripe.checkout.sessions.create(currency ? { ...params, currency } : params)
    } catch (error) {
      if (!currency) throw error
      console.error('billing checkout: currency refused, opening in the base currency:', error)
      session = await stripe.checkout.sessions.create(params)
    }

    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('billing checkout error:', error)
    const reason = error instanceof Error ? error.message : 'unknown error'
    return NextResponse.json({ error: `Could not start checkout: ${reason}` }, { status: 500 })
  }
}
