import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { adminClient } from '@/lib/supabase/admin'
import { LEGAL_VERSION } from '@/lib/legal'

// Where Google sends people back to (the `redirectTo` given to
// signInWithOAuth on /login). Supabase has already verified them with the
// provider; this swaps the one-time code for a session cookie. It lives under
// /api so middleware (which sends signed-out visitors to /login) leaves it alone.
//
// The Supabase project must list this URL, with a wildcard for the query
// string, under Authentication → URL Configuration → Redirect URLs:
//   https://companheiro.app/api/auth/callback**

const ATTRIBUTION_KEYS = ['source', 'medium', 'campaign', 'ref', 'via', 'landing'] as const
const LIMITS: Record<(typeof ATTRIBUTION_KEYS)[number], number> = { source: 80, medium: 80, campaign: 120, ref: 80, via: 120, landing: 200 }
// Long enough to cover a slow trip through Google, short enough that
// a returning account never looks new.
const NEW_ACCOUNT_MS = 15 * 60_000

/**
 * The origin the browser actually used. `request.url` can disagree with it
 * (Vercel's proxy; `next dev` rewrites the host to localhost), and the
 * session cookie set here only reaches the page if the redirect stays on
 * the same host.
 */
function publicOrigin(request: Request, url: URL): string {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  if (!host) return url.origin
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() ?? url.protocol.replace(':', '')
  return `${proto}://${host}`
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = publicOrigin(request, url)
  const fail = () => NextResponse.redirect(new URL('/login?error=oauth', origin))

  const code = url.searchParams.get('code')
  if (!code) {
    // The person cancelled at Google, or Google refused.
    if (url.searchParams.get('error')) console.warn('oauth callback:', url.searchParams.get('error_description') ?? url.searchParams.get('error'))
    return fail()
  }

  const supabase = await createRouteClient()
  const { data, error } = await supabase.auth.exchangeCodeForSession(code)
  if (error || !data.user) {
    console.error('oauth callback: code exchange failed:', error)
    return fail()
  }
  const user = data.user

  // Same record the email form keeps: which Terms/Privacy version was agreed
  // to, and when. Only written once.
  if (!user.user_metadata?.consent) {
    const provider = typeof user.app_metadata?.provider === 'string' ? user.app_metadata.provider : 'oauth'
    const { error: metaErr } = await supabase.auth.updateUser({
      data: { consent: { terms: LEGAL_VERSION, privacy: LEGAL_VERSION, via: provider, at: new Date().toISOString() } },
    })
    if (metaErr) console.error('oauth callback: consent record failed:', metaErr)
  }

  // A brand-new account: its signup_attribution row was created empty by the
  // trigger (OAuth sign-ups carry no metadata of ours), so fill it from the URL.
  const isNew = Date.now() - new Date(user.created_at).getTime() < NEW_ACCOUNT_MS
  const admin = adminClient()
  if (isNew && admin) {
    const values: Record<string, string> = {}
    for (const k of ATTRIBUTION_KEYS) {
      const v = url.searchParams.get(k)?.trim()
      if (v) values[k] = (k === 'source' || k === 'medium' || k === 'via' ? v.toLowerCase() : v).slice(0, LIMITS[k])
    }
    if (Object.keys(values).length) {
      const { error: attrErr } = await admin
        .from('signup_attribution')
        .update(values)
        .eq('user_id', user.id)
        .is('source', null)
        .is('via', null)
        .is('landing', null)
      if (attrErr) console.error('oauth callback: attribution failed:', attrErr)
    }
  }

  // /home sends accounts that haven't been through first run on to /tour, then /welcome.
  // New sign-ups arrive with next=set-password: choose a password first.
  if (url.searchParams.get('next') === 'set-password') return NextResponse.redirect(new URL('/reset?set=1', origin))
  // A new Google account is active from here: the tour comes first, once.
  if (isNew && !user.user_metadata?.tour_seen_at) return NextResponse.redirect(new URL('/tour', origin))
  return NextResponse.redirect(new URL('/home', origin))
}
