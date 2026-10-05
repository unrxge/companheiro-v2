'use client'

// Sends (or re-sends) the "confirm your email" message to an account that
// already exists. It goes out as Supabase's Magic Link email, whose button
// lands on /confirm; registered accounts sign in with a password, so this is
// the only thing that email is used for.

export async function sendConfirmEmail(email?: string): Promise<boolean> {
  // Loaded on demand: the notices that offer "send it again" sit in the root layout.
  const { createClient } = await import('@/lib/supabase/client')
  const supabase = createClient()
  const address = email ?? (await supabase.auth.getUser()).data.user?.email
  if (!address) return false
  const { error } = await supabase.auth.signInWithOtp({
    email: address,
    options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/api/auth/callback` },
  })
  return !error
}
