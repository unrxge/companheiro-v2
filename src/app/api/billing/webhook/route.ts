import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'
import { getStripe } from '@/lib/billing/stripe'
import { tierForPriceId } from '@/lib/billing/plans'
import type { SubscriptionStatus } from '@/lib/billing/access'
import { recordOpsEvent } from '@/lib/ops/ai-calls'
import { alertNow } from '@/lib/ops/notify'

function adminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

type BillingKind =
  | 'subscribed' | 'resubscribed' | 'tier_changed' | 'cancel_scheduled'
  | 'cancel_reverted' | 'canceled' | 'payment_failed'

// The lifecycle record behind the /admin page's churn and conversion views.
// Keyed by (Stripe event, kind), so Stripe's retries never double-count.
async function recordBillingEvent(
  eventId: string,
  userId: string | null,
  kind: BillingKind,
  tier: string | null,
  interval: string | null,
  detail: Record<string, unknown> = {}
) {
  const { error } = await adminClient()
    .from('billing_events')
    .upsert(
      { stripe_event_id: eventId, user_id: userId, kind, tier, billing_interval: interval, detail },
      { onConflict: 'stripe_event_id,kind', ignoreDuplicates: true }
    )
  if (error) console.error('billing webhook: failed to record event', kind, error.message)
}

function cancellationDetail(subscription: Stripe.Subscription): Record<string, unknown> {
  const c = subscription.cancellation_details
  return c ? { reason: c.reason, feedback: c.feedback, comment: c.comment?.slice(0, 500) ?? null } : {}
}

const PAYING: SubscriptionStatus[] = ['active', 'past_due']

// Something only a human can fix: a payment that can't be tied to an
// account, or our own write failing. Logged, emailed, and thrown so Stripe
// retries the delivery.
async function fail(message: string, detail: Record<string, unknown>): Promise<never> {
  await recordOpsEvent('webhook_error', 'billing/webhook', message, detail)
  await alertNow('billing/webhook', 'Stripe webhook failing', `${message}<br><br>Stripe will retry. Check /admin and the Stripe dashboard's webhook log.`)
  const err = new Error(message)
  err.name = 'ReportedWebhookError'
  throw err
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

async function syncSubscription(subscription: Stripe.Subscription, event: Stripe.Event) {
  // Defensive optional chaining throughout: a thin-payload event carries only
  // an id and type, not these fields, and shouldn't crash the handler even
  // though we don't otherwise expect to receive one (see plans.ts / the
  // dashboard destination should only route snapshot-format events here).
  const userId = subscription.metadata?.user_id
  if (!userId) {
    return fail(`Subscription ${subscription.id} has no user_id metadata, so it can't be linked to an account.`, {
      subscription: subscription.id,
      event: event.id,
    })
  }
  const item = subscription.items?.data?.[0]
  const priceId = item?.price?.id
  const tier = priceId ? tierForPriceId(priceId) : null
  const interval = item?.price?.recurring?.interval === 'year' ? 'yearly' : item?.price?.recurring ? 'monthly' : null
  const periodEnd = item?.current_period_end
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
  const status = event.type === 'customer.subscription.deleted' ? 'canceled' : mapStatus(subscription.status)

  const db = adminClient()
  const { data: prev } = await db
    .from('subscriptions')
    .select('status, tier, cancel_at_period_end, stripe_subscription_id')
    .eq('user_id', userId)
    .maybeSingle()

  const { error } = await db
    .from('subscriptions')
    .update({
      status,
      tier,
      billing_interval: interval,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (error) {
    return fail(`Couldn't sync subscription for ${userId.slice(0, 8)}: ${error.message}`, { event: event.id })
  }

  // What changed, as the lifecycle sees it.
  const wasPaying = !!prev && PAYING.includes(prev.status as SubscriptionStatus)
  const isPaying = PAYING.includes(status)
  const record = (kind: BillingKind, detail?: Record<string, unknown>) =>
    recordBillingEvent(event.id, userId, kind, tier, interval, detail)
  if (!wasPaying && isPaying) {
    const returning = !!prev?.stripe_subscription_id && prev.stripe_subscription_id !== subscription.id
    await record(returning ? 'resubscribed' : 'subscribed', { from: prev?.status ?? null })
  } else if (wasPaying && !isPaying) {
    await record('canceled', cancellationDetail(subscription))
  } else if (wasPaying && isPaying) {
    if (prev?.tier && tier && prev.tier !== tier) await record('tier_changed', { from: prev.tier })
    if (!prev?.cancel_at_period_end && subscription.cancel_at_period_end) {
      await record('cancel_scheduled', cancellationDetail(subscription))
    } else if (prev?.cancel_at_period_end && !subscription.cancel_at_period_end) {
      await record('cancel_reverted')
    }
  }
}

async function recordPaymentFailed(invoice: Stripe.Invoice, event: Stripe.Event) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  let userId = invoice.parent?.subscription_details?.metadata?.user_id ?? null
  if (!userId && customerId) {
    const { data } = await adminClient()
      .from('subscriptions')
      .select('user_id')
      .eq('stripe_customer_id', customerId)
      .maybeSingle()
    userId = (data?.user_id as string | undefined) ?? null
  }
  await recordBillingEvent(event.id, userId, 'payment_failed', null, null, {
    attempt: invoice.attempt_count,
    amount: invoice.amount_due,
    currency: invoice.currency,
  })
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
        await syncSubscription(event.data.object as Stripe.Subscription, event)
        break
      case 'invoice.payment_failed':
        await recordPaymentFailed(event.data.object as Stripe.Invoice, event)
        break
      default:
        break
    }
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('billing webhook: handler error', error)
    const reason = error instanceof Error ? error.message : 'unknown error'
    if (!(error instanceof Error && error.name === 'ReportedWebhookError')) {
      await recordOpsEvent('webhook_error', 'billing/webhook', reason, { event: event.id, type: event.type })
      await alertNow('billing/webhook', 'Stripe webhook failing', `${event.type}: ${reason}`)
    }
    return NextResponse.json({ error: `Internal error: ${reason}` }, { status: 500 })
  }
}
