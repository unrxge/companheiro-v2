// Whether this account's email address has been shown to be theirs, and the
// one place that records it. Server only.
//
// Both fail open: before migration 032 is applied, or if the lookup fails,
// everyone counts as confirmed. Our own bookkeeping must never be what
// stops someone.

import type { AuthedContext } from '@/lib/supabase/route'
import { adminClient } from '@/lib/supabase/admin'

export async function isEmailVerified(auth: AuthedContext): Promise<boolean> {
  const { data, error } = await auth.supabase
    .from('subscriptions')
    .select('email_verified_at')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error || !data) return true
  return !!(data as { email_verified_at: string | null }).email_verified_at
}

/** Called only after Supabase itself has accepted an emailed token or an OAuth code for this user. */
export async function markEmailVerified(userId: string): Promise<void> {
  const admin = adminClient()
  if (!admin) return
  const { error } = await admin
    .from('subscriptions')
    .update({ email_verified_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('email_verified_at', null)
  if (error) console.error('markEmailVerified failed:', error.message)
}
