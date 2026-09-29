// Which "Continue with …" buttons the sign-in page shows.
//
// Read from Supabase's public auth settings, so a provider's button appears
// on its own once it is switched on in the Supabase dashboard (Authentication
// → Sign In / Providers), with no redeploy, and never shows while switching it
// on is still pending (Supabase would answer the click with a raw JSON error).

export type OAuthProvider = 'google'

const ORDER: OAuthProvider[] = ['google']

export async function enabledProviders(): Promise<OAuthProvider[]> {
  // Local dev always shows the button so the page can be laid out and
  // checked; clicking it only works once Google is enabled in Supabase.
  if (process.env.NODE_ENV === 'development') return ORDER

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) return []
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key }, next: { revalidate: 300 } })
    if (!res.ok) return []
    const settings = (await res.json()) as { external?: Record<string, boolean> }
    return ORDER.filter((p) => settings.external?.[p] === true)
  } catch {
    return []
  }
}
