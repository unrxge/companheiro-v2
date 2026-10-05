import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'
import { markEmailVerified } from '@/lib/billing/email-verified'

const TYPES = new Set(['email', 'signup', 'magiclink'])

/**
 * POST /api/auth/verify-email — spends the one-time token from a
 * confirmation email (the /confirm page calls this). Done here rather than
 * in the browser so that "this address is theirs" is recorded by the server
 * that saw Supabase accept the token, never on the browser's say-so. It also
 * signs them in, for when the email is opened somewhere they were not.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const token_hash = typeof body.token_hash === 'string' ? body.token_hash : ''
  const type = typeof body.type === 'string' && TYPES.has(body.type) ? body.type : 'email'
  if (!token_hash) return NextResponse.json({ error: 'missing token' }, { status: 400 })

  const supabase = await createRouteClient()
  const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: type as 'email' | 'signup' | 'magiclink' })
  if (error || !data.user) return NextResponse.json({ error: 'expired' }, { status: 400 })

  await markEmailVerified(data.user.id)
  return NextResponse.json({ ok: true })
}
