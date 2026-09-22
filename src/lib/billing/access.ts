import type { SupabaseClient } from '@supabase/supabase-js'
import type { Tier } from './plans'

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled' | 'grandfathered'

export type Subscription = {
  status: SubscriptionStatus
  tier: Tier | null
  trial_ends_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export async function getSubscription(
  supabase: SupabaseClient,
  userId: string
): Promise<Subscription | null> {
  const { data } = await supabase
    .from('subscriptions')
    .select('status, tier, trial_ends_at, current_period_end, cancel_at_period_end')
    .eq('user_id', userId)
    .maybeSingle()
  return data as Subscription | null
}

// No row (trigger hasn't run yet, or predates it) fails closed rather than
// granting write access silently.
export function hasWriteAccess(sub: Subscription | null): boolean {
  if (!sub) return false
  if (sub.status === 'grandfathered' || sub.status === 'active' || sub.status === 'past_due') return true
  if (sub.status === 'trialing' && sub.trial_ends_at) {
    return new Date(sub.trial_ends_at).getTime() > Date.now()
  }
  return false
}
