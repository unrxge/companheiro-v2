'use client'

// The one page for signing in and creating an account (/login; /signup
// redirects here). Google, or an email address: Continue asks the server
// whether the address has an account. If it does, a password field slides in;
// if not, a sign-up link is emailed, which lands on /api/auth/callback (records
// the agreed Terms version and attribution) and then on /reset?set=1 to choose
// a password.
//
// Agreement is by the sentence under the button (no tick boxes, at the
// owner's request): age, AI processing and wellbeing data are covered in the
// Terms and Privacy Policy it links to.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion as m } from 'motion/react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/components/theme/theme-provider'
import { AuthShell } from '@/components/auth/auth-shell'
import { ProviderButtons } from '@/components/auth/provider-buttons'
import { PrimaryButton } from '@/components/ui/buttons'
import { TextField } from '@/components/ui/field'
import { type as typeRoles } from '@/lib/design-tokens'
import { readAttribution } from '@/lib/attribution'
import { LEGAL_VERSION } from '@/lib/legal'
import { sendConfirmEmail } from '@/lib/confirm-email'
import type { OAuthProvider } from '@/lib/auth-providers'
import { lastSeenProjects } from '@/lib/studio/last-seen'
import { forgetOpened } from '@/lib/studio/opened'
import { chosenPlanLine, chosenPlanQuery, readChosenPlan, type ChosenPlan } from '@/lib/billing/chosen-plan'
import { usePrices } from '@/lib/billing/use-prices'

const PROVIDER_NAME: Record<OAuthProvider, string> = { google: 'Google' }

/** /api/auth/callback, carrying any attribution in the URL (never a cookie). */
function callbackUrl(next?: 'set-password'): string {
  const callback = new URL('/api/auth/callback', window.location.origin)
  if (next) callback.searchParams.set('next', next)
  for (const [k, v] of Object.entries(readAttribution())) if (v) callback.searchParams.set(k, v)
  // A plan chosen on the landing page travels with them to checkout.
  const chosen = readChosenPlan(window.location.search)
  if (chosen) {
    callback.searchParams.set('plan', chosen.tier)
    callback.searchParams.set('interval', chosen.interval)
  }
  return callback.toString()
}

export function AuthForm({ providers }: { providers: OAuthProvider[] }) {
  const { t } = useTheme()
  const prices = usePrices()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // True once the server has said this address has an account.
  const [askPassword, setAskPassword] = useState(false)
  // True once the server has said it does not: the password field is then
  // for choosing one, and Continue creates the account.
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set when they came from a plan's own button on the landing page: they are
  // signing up to pay for that plan now, not to start the free month.
  const [chosen, setChosen] = useState<ChosenPlan | null>(null)

  // ?error=oauth comes back from /api/auth/callback when a Google sign-in or
  // email link failed. Read here rather than on the server so the page itself
  // stays static.
  useEffect(() => {
    // Nobody is signed in on this page: forget the last person's project list.
    lastSeenProjects.clear()
    forgetOpened()
    setChosen(readChosenPlan(window.location.search))
    if (new URLSearchParams(window.location.search).get('error') === 'oauth') {
      setError('That sign-in link didn’t work or has expired. Please try again.')
    }
  }, [])
  const [loading, setLoading] = useState(false)
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const continueWith = async (provider: OAuthProvider) => {
    setError(null)
    setOauthBusy(provider)
    const { error: err } = await createClient().auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl() } })
    // On success the browser is already on its way to Google.
    if (err) {
      setError(`Couldn’t reach ${PROVIDER_NAME[provider]}. Please try again, or use your email.`)
      setOauthBusy(null)
    }
  }

  const changeEmail = (v: string) => {
    setEmail(v)
    if (askPassword) {
      setAskPassword(false)
      setCreating(false)
      setPassword('')
      setError(null)
    }
  }

  /**
   * New address: the account is made here and now, and they go straight in.
   * The address is confirmed in the background (lib/confirm-email.ts); until
   * it is, the free month's companion allowance is a small one.
   */
  const createAccount = async () => {
    const address = email.trim()
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    const { data, error: err } = await createClient().auth.signUp({
      email: address,
      password,
      options: {
        emailRedirectTo: callbackUrl(),
        data: {
          // Filed by a trigger (migration 026).
          attribution: readAttribution(),
          // Which Terms and Privacy Policy were agreed to, and when.
          consent: { terms: LEGAL_VERSION, privacy: LEGAL_VERSION, via: 'email', at: new Date().toISOString() },
        },
      },
    })
    if (err) {
      setError(err.message)
      return
    }
    // No session means the Supabase project still insists on a confirmed
    // address before signing anyone in: it has sent its own email.
    if (!data.session) {
      setSentTo(address)
      return
    }
    // Not waited on: a confirmation that fails to send can be asked for again from inside.
    void sendConfirmEmail(address)
    router.push(chosen ? `/subscribe?${chosenPlanQuery(chosen)}` : '/tour')
  }

  const run = async (work: () => Promise<void>) => {
    setError(null)
    setLoading(true)
    try {
      await work()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const address = email.trim()
    if (askPassword && creating) return run(createAccount)
    if (askPassword) {
      return run(async () => {
        const { error: err } = await createClient().auth.signInWithPassword({ email: address, password })
        if (err) setError('That password didn’t match. Try again, or use “Forgot password?” to set a new one.')
        else router.push(chosen ? `/subscribe?${chosenPlanQuery(chosen)}` : '/home')
      })
    }
    return run(async () => {
      const check = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address }),
      })
      const d = await check.json().catch(() => ({}))
      if (!check.ok) {
        setError(d.error || 'Please check the address and try again.')
        return
      }
      // Registered accounts sign in with a password (or Google), never a link.
      if (d.exists === true) setAskPassword(true)
      else if (d.exists === false) { setCreating(true); setAskPassword(true) }
      else setError('We couldn’t check that address just now. Please try again in a moment.')
    })
  }

  const link: React.CSSProperties = { color: t.textPrimary, textDecoration: 'underline', textUnderlineOffset: 3 }

  return (
    <AuthShell
      title="Your vision is waiting."
      subtitle={chosen
        ? `Sign in or create your account, then on to checkout for ${chosenPlanLine(chosen, prices.money(chosen.tier, chosen.interval))}.`
        : 'Try Companheiro risk-free for 30 days. No card needed.'}
      back="/"
      footer={chosen ? <span>Rather look around first? <Link href="/login" onClick={() => setChosen(null)} style={{ color: t.textPrimary, textDecoration: 'underline', textUnderlineOffset: 3 }}>Start with 30 days free</Link></span> : undefined}
      wide
    >
      {sentTo ? (
        <div role="status">
          <p style={{ ...typeRoles.ui, fontSize: 15, fontWeight: 500, color: t.textPrimary }}>Check your email.</p>
          <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 6 }}>
            We sent a link to {sentTo}. Open it to finish creating your account.{' '}
            <button type="button" onClick={() => setSentTo(null)} style={{ ...link, background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
              Use a different email
            </button>
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ProviderButtons providers={providers} busy={oauthBusy} disabled={loading || oauthBusy !== null} onChoose={continueWith} />

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TextField type="email" value={email} onChange={changeEmail} ariaLabel="Email" placeholder="Your email" autoComplete="email" />
            <AnimatePresence initial={false}>
              {askPassword && (
                <m.div
                  key="password"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.2, 0.7, 0.2, 1] }}
                  style={{ overflow: 'hidden' }}
                >
                  {/* Padding keeps the field's focus border inside the clipped box. */}
                  <div style={{ padding: '1px 1px 2px' }}>
                    <TextField
                      type="password"
                      value={password}
                      onChange={setPassword}
                      ariaLabel={creating ? 'Choose a password' : 'Password'}
                      placeholder={creating ? 'Choose a password (at least 8 characters)' : 'Your password'}
                      autoComplete={creating ? 'new-password' : 'current-password'}
                      autoFocus
                    />
                    {creating ? (
                      <p style={{ ...typeRoles.small, fontSize: 12, marginTop: 8, color: t.textSecondary }}>
                        New here. Choose a password and you&rsquo;re in.
                      </p>
                    ) : (
                      <div style={{ ...typeRoles.small, fontSize: 12, marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                        <Link href="/reset" style={{ ...link, color: t.textSecondary }}>Forgot password?</Link>
                      </div>
                    )}
                  </div>
                </m.div>
              )}
            </AnimatePresence>
            {error && (
              <p role="alert" style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>
                {error}
              </p>
            )}
            <PrimaryButton type="submit" disabled={oauthBusy !== null || !email.trim() || (askPassword && !password)} loading={loading} loadingLabel={creating ? 'Creating your account…' : askPassword ? 'Signing in…' : 'One moment…'} full size="lg">
              {creating ? 'Create account' : 'Continue'}
            </PrimaryButton>
          </form>

          <p style={{ ...typeRoles.small, fontSize: 12, lineHeight: 1.5, color: t.textSecondary, textAlign: 'center' }}>
            By signing in, you agree to Companheiro&rsquo;s{' '}
            <Link href="/terms" style={link}>Terms and Conditions</Link> and{' '}
            <Link href="/privacy" style={link}>Privacy Policy</Link>.
          </p>
        </div>
      )}
    </AuthShell>
  )
}
