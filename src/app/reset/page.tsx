'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/components/theme/theme-provider'
import { AuthShell, AuthLink } from '@/components/auth/auth-shell'
import { PrimaryButton } from '@/components/ui/buttons'
import { TextField } from '@/components/ui/field'
import { Eyebrow } from '@/components/shell/page-shell'
import { type as typeRoles } from '@/lib/design-tokens'

/**
 * Two states on one route: request a reset link (signed out), and set a new
 * password (arriving through the recovery link, which signs you in).
 */
export default function ResetPage() {
  const router = useRouter()
  const { t } = useTheme()
  const [mode, setMode] = useState<'request' | 'update'>('request')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    const hashSaysRecovery = typeof window !== 'undefined' && window.location.hash.includes('type=recovery')
    if (hashSaysRecovery) setMode('update')
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('update')
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && hashSaysRecovery) setMode('update')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const request = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { error: err } = await createClient().auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset` })
      if (err) setError(err.message)
      else setSent(true)
    } finally {
      setLoading(false)
    }
  }

  const update = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Use at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      const { error: err } = await createClient().auth.updateUser({ password })
      if (err) setError(err.message)
      else router.push('/home')
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'update') {
    return (
      <AuthShell title="Choose a new password.">
        <form onSubmit={update} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>New password</Eyebrow>
            <TextField type="password" value={password} onChange={setPassword} ariaLabel="New password" placeholder="At least 8 characters" autoFocus />
          </div>
          {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>{error}</p>}
          <PrimaryButton type="submit" disabled={loading || !password} loading={loading} loadingLabel="Saving…" full size="lg">Save and continue</PrimaryButton>
        </form>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Reset your password." subtitle="We will send a link to your email." footer={<span><AuthLink href="/login">Back to sign in</AuthLink></span>}>
      {sent ? (
        <div>
          <p style={{ ...typeRoles.ui, fontSize: 15, fontWeight: 500, color: t.textPrimary }}>Check your email.</p>
          <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 6 }}>If an account exists for {email}, a reset link is on its way.</p>
        </div>
      ) : (
        <form onSubmit={request} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <Eyebrow style={{ marginBottom: 6 }}>Email</Eyebrow>
            <TextField type="email" value={email} onChange={setEmail} ariaLabel="Email" autoFocus />
          </div>
          {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>{error}</p>}
          <PrimaryButton type="submit" disabled={loading || !email} loading={loading} loadingLabel="Sending…" full size="lg">Send reset link</PrimaryButton>
        </form>
      )}
    </AuthShell>
  )
}
