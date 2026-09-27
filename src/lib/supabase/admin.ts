import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Service-role client for server-only bookkeeping (metering, monitoring,
// webhooks). Bypasses RLS, so never import this from client code. Null when
// the key isn't configured, so callers can skip quietly in local dev.
let cached: SupabaseClient | null | undefined

export function adminClient(): SupabaseClient | null {
  if (cached !== undefined) return cached
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  cached = key
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null
  return cached
}
