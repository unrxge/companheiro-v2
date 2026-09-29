'use client'

// The one page for signing in and creating an account (/login; /signup
// redirects here with mode=create). Apple and Google sign in or register in
// the same step, so the mode switch only changes what the email form does.
//
// Agreement is by the sentence under the buttons (no tick boxes, at the
// owner's request): age, AI processing and wellbeing data are covered in the
// Terms and Privacy Policy it links to. The accepted version is stored on the
// auth user as `consent` (here for email sign-up, in /api/auth/callback for
// Apple and Google).

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/components/theme/theme-provider'
import { AuthShell } from '@/components/auth/auth-shell'
import { ProviderButtons } from '@/components/auth/provider-buttons'
import { PrimaryButton } from '@/components/ui/buttons'
import { TextField } from '@/components/ui/field'
import { Eyebrow } from '@/components/shell/page-shell'
import { radius, type as typeRoles } from '@/lib/design-tokens'
import { readAttribution } from '@/lib/attribution'
import { LEGAL_VERSION } from '@/lib/legal'
import type { OAuthProvider } from '@/lib/auth-providers'

type Mode = 'signin' | 'create'

const PROVIDER_NAME: Record<OAuthProvider, string> = { apple: 'Apple', google: 'Google' }

export function AuthForm({ initialMode, providers, oauthFailed }: { initialMode: Mode; providers: OAuthProvider[]; oauthFailed: boolean }) {
  const router = useRouter()
  const { t } = useTheme()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(oauthFailed ? 'That sign-in didn’t finish. Please try again, or use your email.' : null)
  const [loading, setLoading] = useState(false)
  const [oauthBusy, setOauthBusy] = useState<OAuthProvider | null>(null)
  const [checkEmail, setCheckEmail] = useState(false)

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
  }

  const continueWith = async (provider: OAuthProvider) => {
    setError(null)
    setOauthBusy(provider)
    // Attribution rides along in the callback URL (never a cookie), so the
    // callback can file it for a brand-new account.
    const callback = new URL('/api/auth/callback', window.location.origin)
    for (const [k, v] of Object.entries(readAttribution())) if (v) callback.searchParams.set(k, v)
    const { error: err } = await createClient().auth.signInWithOAuth({ provider, options: { redirectTo: callback.toString() } })
    // On success the browser is already on its way to Apple or Google.
    if (err) {
      setError(`Couldn’t reach ${PROVIDER_NAME[provider]}. Please try again, or use your email.`)
      setOauthBusy(null)
    }
  }

  const signIn = async () => {
    const result = await createClient().auth.signInWithPassword({ email: email.trim(), password })
    if (result.error) {
      setError(result.error.message ?? 'Invalid email or password.')
      return
    }
    router.push('/home')
  }

  const createAccount = async () => {
    if (password.length < 8) {
      setError('Use at least 8 characters for your password.')
      return
    }
    const check = await fetch('/api/auth/check-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
    if (!check.ok) {
      const d = await check.json().catch(() => ({}))
      setError(d.error || 'Please check the address and try again.')
      return
    }
    const { data, error: err } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          // Filed by a database trigger (migration 026) for the owner's /admin view.
          attribution: readAttribution(),
          consent: { terms: LEGAL_VERSION, privacy: LEGAL_VERSION, via: 'email', at: new Date().toISOString() },
        },
      },
    })
    if (err) {
      setError(err.message)
      return
    }
    // With email confirmation on, there is no session yet.
    if (data.session) router.push('/welcome')
    else setCheckEmail(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await (mode === 'signin' ? signIn() : createAccount())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const busy = loading || oauthBusy !== null
  const link: React.CSSProperties = { color: t.textPrimary, textDecoration: 'underline', textUnderlineOffset: 3 }

  return (
    <AuthShell title="Your vision is waiting." subtitle="Sign in, or create an account. New accounts get 30 days free, no card needed.">
      {checkEmail ? (
        <div role="status">
          <p style={{ ...typeRoles.ui, fontSize: 15, fontWeight: 500, color: t.textPrimary }}>Check your email.</p>
          <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 6 }}>
            We sent a confirmation link to {email}. Open it, then sign in here. The first thing we do together is find your territories.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Mode switch: two plain buttons, the current one pressed. */}
          <div role="group" aria-label="Sign in or create an account" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4, borderRadius: radius.field + 4, backgroundColor: t.cardBgInner }}>
            {(['signin', 'create'] as const).map((m) => {
              const on = mode === m
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() => switchMode(m)}
                  style={{
                    ...typeRoles.ui,
                    fontSize: 14,
                    fontWeight: on ? 600 : 500,
                    padding: '9px 6px',
                    whiteSpace: 'nowrap',
                    borderRadius: radius.field,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: on ? t.cardBg : 'transparent',
                    color: on ? t.textPrimary : t.textSecondary,
                    boxShadow: on ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
                  }}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              )
            })}
          </div>

          <ProviderButtons providers={providers} busy={oauthBusy} disabled={busy} onChoose={continueWith} />

          {providers.length > 0 && (
            <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 12, ...typeRoles.small, fontSize: 12, color: t.textMuted }}>
              <span style={{ flex: 1, height: 1, backgroundColor: t.divider }} />
              or with email
              <span style={{ flex: 1, height: 1, backgroundColor: t.divider }} />
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Eyebrow style={{ marginBottom: 6 }}>Email</Eyebrow>
              <TextField type="email" value={email} onChange={setEmail} ariaLabel="Email" autoComplete="email" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <Eyebrow>Password</Eyebrow>
                {mode === 'signin' && (
                  <Link href="/reset" style={{ ...typeRoles.small, fontSize: 12, color: t.textSecondary, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                    Forgot?
                  </Link>
                )}
              </div>
              <TextField
                type="password"
                value={password}
                onChange={setPassword}
                ariaLabel="Password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder={mode === 'create' ? 'At least 8 characters' : undefined}
              />
            </div>
            {error && (
              <p role="alert" style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>
                {error}
              </p>
            )}
            <PrimaryButton
              type="submit"
              disabled={busy || !email || !password}
              loading={loading}
              loadingLabel={mode === 'signin' ? 'Signing in…' : 'Creating…'}
              full
              size="lg"
            >
              {mode === 'signin' ? 'Sign in' : 'Create account'}
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
