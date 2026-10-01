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

import { useState } from 'react'
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
import type { OAuthProvider } from '@/lib/auth-providers'

const PROVIDER_NAME: Record<OAuthProvider, string> = { google: 'Google' }

/** /api/auth/callback, carrying any attribution in the URL (never a cookie). */
function callbackUrl(next?: 'set-password'): string {
  const callback = new URL('/api/auth/callback', window.location.origin)
  if (next) callback.searchParams.set('next', next)
  for (const [k, v] of Object.entries(readAttribution())) if (v) callback.searchParams.set(k, v)
  return callback.toString()
}

export function AuthForm({ providers, oauthFailed }: { providers: OAuthProvider[]; oauthFailed: boolean }) {
  const { t } = useTheme()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // True once the server has said this address has an account.
  const [askPassword, setAskPassword] = useState(false)
  const [sentKind, setSentKind] = useState<'signup' | 'signin'>('signup')
  const [error, setError] = useState<string | null>(oauthFailed ? 'That sign-in link didn’t work or has expired. Please try again.' : null)
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
      setPassword('')
      setError(null)
    }
  }

  /** Email a link: sign-up (then choose a password) or plain sign-in. */
  const sendLink = async (kind: 'signup' | 'signin') => {
    const address = email.trim()
    const { error: err } = await createClient().auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: callbackUrl(kind === 'signup' ? 'set-password' : undefined),
        // Only used if this creates the account: filed by a trigger (migration 026).
        data: { attribution: readAttribution() },
      },
    })
    if (err) {
      setError(err.message)
      return
    }
    setSentKind(kind)
    setSentTo(address)
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
    if (askPassword) {
      return run(async () => {
        const { error: err } = await createClient().auth.signInWithPassword({ email: address, password })
        if (err) setError('That password didn’t match. Try again, or get a sign-in link by email.')
        else router.push('/home')
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
      if (d.exists === true) setAskPassword(true)
      // Unknown (null) gets a plain link, which works for either case.
      else await sendLink(d.exists === false ? 'signup' : 'signin')
    })
  }

  const link: React.CSSProperties = { color: t.textPrimary, textDecoration: 'underline', textUnderlineOffset: 3 }

  return (
    <AuthShell title="Your vision is waiting." subtitle="Try Companheiro risk-free for 30 days. No card needed." wide>
      {sentTo ? (
        <div role="status">
          <p style={{ ...typeRoles.ui, fontSize: 15, fontWeight: 500, color: t.textPrimary }}>Check your email.</p>
          <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 6 }}>
            {sentKind === 'signup'
              ? `We sent a link to ${sentTo}. Open it on this device to choose a password and finish creating your account.`
              : `We sent a sign-in link to ${sentTo}. Open it on this device to continue.`}{' '}
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
                    <TextField type="password" value={password} onChange={setPassword} ariaLabel="Password" placeholder="Your password" autoComplete="current-password" autoFocus />
                    <div style={{ ...typeRoles.small, fontSize: 12, marginTop: 8, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <button type="button" onClick={() => run(() => sendLink('signin'))} style={{ ...link, color: t.textSecondary, background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
                        Email me a sign-in link instead
                      </button>
                      <Link href="/reset" style={{ ...link, color: t.textSecondary }}>Forgot password?</Link>
                    </div>
                  </div>
                </m.div>
              )}
            </AnimatePresence>
            {error && (
              <p role="alert" style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>
                {error}
              </p>
            )}
            <PrimaryButton type="submit" disabled={oauthBusy !== null || !email.trim() || (askPassword && !password)} loading={loading} loadingLabel={askPassword ? 'Signing in…' : 'One moment…'} full size="lg">
              Continue
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
