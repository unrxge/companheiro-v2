import { NextResponse } from 'next/server'
import { isDisposableEmail, normaliseEmail } from '@/lib/billing/email'

/**
 * POST /api/auth/check-email — asked by the signup page before it creates
 * the account. Only turns away throwaway inboxes; whether an address has
 * already had a free month is decided by the database trigger (migration
 * 025), and never revealed here, so this can't be used to find out who has
 * an account.
 */
export async function POST(request: Request) {
  const { email } = (await request.json().catch(() => ({}))) as { email?: unknown }
  if (typeof email !== 'string' || !normaliseEmail(email)) {
    return NextResponse.json({ ok: false, error: 'That doesn’t look like an email address.' }, { status: 400 })
  }
  if (isDisposableEmail(email)) {
    return NextResponse.json(
      { ok: false, error: 'Please use an address you’ll keep. Temporary inboxes can’t receive what we send later, like receipts or a way back into your account.' },
      { status: 400 }
    )
  }
  return NextResponse.json({ ok: true })
}
