'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const supabase = createClient()

      const result = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      console.log('signInWithPassword result:', JSON.stringify({
        user: result.data?.user?.id ?? null,
        session: result.data?.session ? 'present' : null,
        error: result.error ? { message: result.error.message, status: result.error.status } : null,
      }))

      if (result.error) {
        setError(result.error.message ?? 'Invalid email or password.')
        setLoading(false)
        return
      }

      // Success — navigate to the app. router.refresh() is not needed here;
      // the middleware cookie check will recognise the session on the next request.
      router.push('/check-in')
    } catch (err) {
      console.error('Login exception:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#111110] flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-1">
          <h1 className="text-xl font-medium text-[#e8e6e1] tracking-tight">
            Companheiro
          </h1>
          <p className="text-sm text-[#6b6966]">Sign in to continue.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-xs text-[#8c8a87] tracking-wide">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded-lg px-4 py-3 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] transition-colors"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="block text-xs text-[#8c8a87] tracking-wide">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-[#1c1c1a] border border-[#2e2d2a] rounded-lg px-4 py-3 text-sm text-[#e8e6e1] placeholder:text-[#3d3c39] focus:outline-none focus:border-[#4a4946] transition-colors"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-[#e8e6e1] text-[#111110] text-sm font-medium rounded-lg hover:bg-[#d4d2cd] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
