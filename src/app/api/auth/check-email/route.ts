import { NextResponse } from 'next/server'
import { isDisposableEmail, normaliseEmail } from '@/lib/billing/email'
import { recordOpsEvent } from '@/lib/ops/ai-calls'

/**
 * Does an account already use this address? Asks Supabase's admin API, which
 * filters by a partial match, so the result is compared exactly. Null when it
 * can't tell (no service key, request failed); the page then emails a link,
 * which works either way.
 */
async function accountExists(email: string): Promise<boolean | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!url || !key) return null
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?per_page=50&filter=${encodeURIComponent(email)}`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const body = (await res.json()) as { users?: { email?: string }[] }
    return (body.users ?? []).some((u) => u.email?.toLowerCase() === email)
  } catch {
    return null
  }
}

/**
 * POST /api/auth/check-email — asked by the sign-in page when Continue is
 * pressed. Turns away throwaway inboxes, and says whether the address already
 * has an account so the page can ask for a password instead of emailing a
 * sign-up link. That does let someone test whether an address is registered
 * (the owner chose this flow knowingly). Whether an address has already had a
 * free month is still decided by the database trigger (migration 025) and
 * never revealed here.
 */
export async function POST(request: Request) {
  const { email } = (await request.json().catch(() => ({}))) as { email?: unknown }
  if (typeof email !== 'string' || !normaliseEmail(email)) {
    return NextResponse.json({ ok: false, error: 'That doesn’t look like an email address.' }, { status: 400 })
  }
  if (isDisposableEmail(email)) {
    // Counted for /admin, by domain only.
    await recordOpsEvent('signup_blocked', 'auth/check-email', 'disposable address', {
      domain: email.split('@').pop()?.toLowerCase().slice(0, 80) ?? null,
    })
    return NextResponse.json(
      { ok: false, error: 'Please use an address you’ll keep. Temporary inboxes can’t receive what we send later, like receipts or a way back into your account.' },
      { status: 400 }
    )
  }
  return NextResponse.json({ ok: true, exists: await accountExists(email.trim().toLowerCase()) })
}
