import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/billing/stripe'
import { tierForPriceId } from '@/lib/billing/plans'
import type { SubscriptionStatus } from '@/lib/billing/access'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function mapStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'unpaid':
      return 'past_due'
    default:
      return 'canceled'
  }
}

async function syncSubscription(subscription: Stripe.Subscription) {
  // Defensive optional chaining throughout: a thin-payload event carries only
  // an id and type, not these fields, and shouldn't crash the handler even
  // though we don't otherwise expect to receive one (see plans.ts / the
  // dashboard destination should only route snapshot-format events here).
  const userId = subscription.metadata?.user_id
  if (!userId) {
    console.error('billing webhook: subscription missing user_id metadata', subscription.id)
    return
  }
  const item = subscription.items?.data?.[0]
  const priceId = item?.price?.id
  const tier = priceId ? tierForPriceId(priceId) : null
  const periodEnd = item?.current_period_end
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id

  const { error } = await adminClient()
    .from('subscriptions')
    .update({
      status: mapStatus(subscription.status),
      tier,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (error) console.error('billing webhook: failed to sync subscription', userId, error)
}

/** POST /api/billing/webhook — Stripe event delivery. */
export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature')
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim()
  if (!signature || !secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }

  const body = await request.text()
  let event: Stripe.Event
  try {
    event = getStripe().webhooks.constructEvent(body, signature, secret)
  } catch (error) {
    console.error('billing webhook: signature verification failed', error)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object as Stripe.Subscription)
        break
      default:
        break
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('billing webhook: handler error', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
