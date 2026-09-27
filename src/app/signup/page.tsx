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

export default function SignupPage() {
  const router = useRouter()
  const { t } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkEmail, setCheckEmail] = useState(false)
  const [heardFrom, setHeardFrom] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Use at least 8 characters.')
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
          data: { attribution: { ...readAttribution(), heard_from: heardFrom.trim().slice(0, 300) || undefined } },
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
            <TextField type="email" value={email} onChange={setEmail} ariaLabel="Email" autoFocus />
          </div>
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>Password</Eyebrow>
            <TextField type="password" value={password} onChange={setPassword} ariaLabel="Password" placeholder="At least 8 characters" />
          </div>
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>How did you hear about us? <span style={{ textTransform: 'none', letterSpacing: 0, opacity: 0.7 }}>(optional)</span></Eyebrow>
            <TextField value={heardFrom} onChange={setHeardFrom} ariaLabel="How did you hear about us? (optional)" placeholder="A friend, a post, a podcast…" />
          </div>
          {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>{error}</p>}
          <PrimaryButton type="submit" disabled={loading || !email || !password} loading={loading} loadingLabel="Creating…" full size="lg">
            Create account
          </PrimaryButton>
          <p style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted }}>What you write here is processed by an AI model to respond to you. It is never used to train anything, and you can export or delete all of it from Settings.</p>
        </form>
      )}
    </AuthShell>
  )
}
