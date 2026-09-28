'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/components/theme/theme-provider'
import { AuthShell, AuthLink } from '@/components/auth/auth-shell'
import { PrimaryButton } from '@/components/ui/buttons'
import { TextField } from '@/components/ui/field'
import { Eyebrow } from '@/components/shell/page-shell'
import { type as typeRoles } from '@/lib/design-tokens'
import { readAttribution } from '@/lib/attribution'
import { LEGAL_VERSION } from '@/lib/legal'

export default function SignupPage() {
  const router = useRouter()
  const { t } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)
  const [heardFrom, setHeardFrom] = useState('')
  // Two separate, unticked boxes: agreeing to the Terms is a contract
  // formality; processing wellbeing data needs its own explicit consent
  // (UK/EU GDPR art 9(2)(a)), so it can't be bundled into the first.
  const [agreed, setAgreed] = useState(false)
  const [sensitive, setSensitive] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    if (!agreed || !sensitive) {
      setError('Please tick both boxes to create your account.')
      return
    }
    setLoading(true)
    try {
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
          // Filed by a database trigger (migration 026) for the owner's
          // /admin view of where people come from. Optional, never shown.
          data: {
            attribution: { ...readAttribution(), heard_from: heardFrom.trim().slice(0, 300) || undefined },
            // A record of what was agreed and when, kept on the auth user.
            consent: { terms: LEGAL_VERSION, privacy: LEGAL_VERSION, age_18: true, wellbeing_data: true, at: new Date().toISOString() },
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const checkRow: React.CSSProperties = { ...typeRoles.small, fontSize: 13, lineHeight: 1.5, color: t.textSecondary, display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }
  const checkBox: React.CSSProperties = { width: 18, height: 18, marginTop: 1, flexShrink: 0, accentColor: t.ember, cursor: 'pointer' }
  const inlineLink: React.CSSProperties = { color: t.textPrimary, textDecoration: 'underline', textUnderlineOffset: 3 }

  return (
    <AuthShell
      title="Make a place for what circles."
      subtitle="Check-ins, ideas, pieces and the reflections after. Yours, and only yours."
      footer={<span>Already have an account? <AuthLink href="/login">Sign in</AuthLink></span>}
    >
      {checkEmail ? (
        <div>
          <p style={{ ...typeRoles.ui, fontSize: 15, fontWeight: 500, color: t.textPrimary }}>Check your email.</p>
          <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 6 }}>We sent a confirmation link to {email}. Open it, then sign in. The first thing we do together is find your territories.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>Email</Eyebrow>
            <TextField type="email" value={email} onChange={setEmail} ariaLabel="Email" autoComplete="email" autoFocus />
          </div>
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>Password</Eyebrow>
            <TextField type="password" value={password} onChange={setPassword} ariaLabel="Password" autoComplete="new-password" placeholder="At least 8 characters" />
          </div>
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>How did you hear about us? <span style={{ textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>(optional)</span></Eyebrow>
            <TextField value={heardFrom} onChange={setHeardFrom} ariaLabel="How did you hear about us? (optional)" placeholder="A friend, a post, a podcast…" />
          </div>
          <label style={checkRow}>
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} style={checkBox} />
            <span>
              I&apos;m 18 or over and I agree to the <a href="/terms" target="_blank" style={inlineLink}>Terms</a> and have read the{' '}
              <a href="/privacy" target="_blank" style={inlineLink}>Privacy Policy</a>.
            </span>
          </label>
          <label style={checkRow}>
            <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} style={checkBox} />
            <span>
              I consent to Companheiro processing what I write, including anything about how I&apos;m feeling or my health, so the AI companion can respond to
              me. I can withdraw this by deleting it.
            </span>
          </label>
          {error && <p role="alert" style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>{error}</p>}
          <PrimaryButton type="submit" disabled={loading || !email || !password} loading={loading} loadingLabel="Creating…" full size="lg">
            Create account
          </PrimaryButton>
          <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted }}>The companion is an AI, not a person, and not a therapist. What you write is never used to train AI models, and you can export or delete all of it from Settings.</p>
        </form>
      )}
    </AuthShell>
  )
}
