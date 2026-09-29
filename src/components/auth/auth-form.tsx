'use client'

// The one page for signing in and creating an account (/login; /signup
// redirects here). No passwords: Google, or an email link. The same link
// signs in an existing account or creates a new one, and lands on
// /api/auth/callback, which records the agreed Terms version and attribution.
//
// Agreement is by the sentence under the button (no tick boxes, at the
// owner's request): age, AI processing and wellbeing data are covered in the
// Terms and Privacy Policy it links to.

import { useState } from 'react'
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
function callbackUrl(): string {
  const callback = new URL('/api/auth/callback', window.location.origin)
  for (const [k, v] of Object.entries(readAttribution())) if (v) callback.searchParams.set(k, v)
  return callback.toString()
}

export function AuthForm({ providers, oauthFailed }: { providers: OAuthProvider[]; oauthFailed: boolean }) {
  const { t } = useTheme()
  const [email, setEmail] = useState('')
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const address = email.trim()
    try {
      const check = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: address }),
      })
      if (!check.ok) {
        const d = await check.json().catch(() => ({}))
        setError(d.error || 'Please check the address and try again.')
        return
      }
      const { error: err } = await createClient().auth.signInWithOtp({
        email: address,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: callbackUrl(),
          // Only used if this creates the account: filed by a trigger (migration 026).
          data: { attribution: readAttribution() },
        },
      })
      if (err) {
        setError(err.message)
        return
      }
      setSentTo(address)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const link: React.CSSProperties = { color: t.textPrimary, textDecoration: 'underline', textUnderlineOffset: 3 }

  return (
    <AuthShell title="Your vision is waiting." subtitle="Try Companheiro risk-free for 30 days. No card needed." wide>
      {sentTo ? (
        <div role="status">
          <p style={{ ...typeRoles.ui, fontSize: 15, fontWeight: 500, color: t.textPrimary }}>Check your email.</p>
          <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 6 }}>
            We sent a link to {sentTo}. Open it on this device to continue.{' '}
            <button type="button" onClick={() => setSentTo(null)} style={{ ...link, background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}>
              Use a different email
            </button>
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ProviderButtons providers={providers} busy={oauthBusy} disabled={loading || oauthBusy !== null} onChoose={continueWith} />

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <TextField type="email" value={email} onChange={setEmail} ariaLabel="Email" placeholder="Your email" autoComplete="email" />
            {error && (
              <p role="alert" style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>
                {error}
              </p>
            )}
            <PrimaryButton type="submit" disabled={oauthBusy !== null || !email.trim()} loading={loading} loadingLabel="Sending…" full size="lg">
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
