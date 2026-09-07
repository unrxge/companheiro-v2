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

export default function LoginPage() {
  const router = useRouter()
  const { t } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const result = await createClient().auth.signInWithPassword({ email: email.trim(), password })
      if (result.error) {
        setError(result.error.message ?? 'Invalid email or password.')
        setLoading(false)
        return
      }
      router.push('/home')
    } catch (err) {
      console.error('Login exception:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back."
      subtitle="A companion for your inner life and the work it turns into."
      footer={
        <>
          <span>New here? <AuthLink href="/signup">Create an account</AuthLink></span>
          <span><AuthLink href="/reset">Forgot your password?</AuthLink></span>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <Eyebrow style={{ marginBottom: 6 }}>Email</Eyebrow>
          <TextField type="email" value={email} onChange={setEmail} ariaLabel="Email" autoFocus />
        </div>
        <div>
          <Eyebrow style={{ marginBottom: 6 }}>Password</Eyebrow>
          <TextField type="password" value={password} onChange={setPassword} ariaLabel="Password" />
        </div>
        {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>{error}</p>}
        <PrimaryButton type="submit" disabled={loading || !email || !password} loading={loading} loadingLabel="Signing in…" full size="lg">
          Sign in
        </PrimaryButton>
      </form>
    </AuthShell>
  )
}
