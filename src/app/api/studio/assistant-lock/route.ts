// GET/POST /api/studio/assistant-lock — the commitment device: lock the
// companion and the writing assistant to reflect-only for a stretch of time,
// for anyone who wants no AI prose at all while they write.
//
// Lives on user_settings (assistant_write_locked_until), which both chat
// routes re-check on every request. No migration needed here.

import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, isRecord, readJson, unauthorized } from '@/lib/studio/db'
import { requireUser } from '@/lib/supabase/route'

export async function GET() {
  const auth = await requireUser()
  if (!auth) return unauthorized()
  const { data } = await auth.supabase
    .from('user_settings')
    .select('assistant_write_locked_until')
    .eq('user_id', auth.user.id)
    .maybeSingle()
  const lockedUntil = data?.assistant_write_locked_until ?? null
  const active = !!lockedUntil && new Date(lockedUntil).getTime() > Date.now()
  return NextResponse.json({ lockedUntil: active ? lockedUntil : null })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (!auth) return unauthorized()

  const body = await readJson(req)
  if (!isRecord(body)) throw badRequest('body required')
  const minutes = Number(body.minutes)
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return NextResponse.json({ success: false, error: 'invalid duration' }, { status: 400 })
  }

  const { data: existing } = await auth.supabase
    .from('user_settings')
    .select('assistant_write_locked_until')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  const now = Date.now()
  const currentLock = existing?.assistant_write_locked_until
    ? new Date(existing.assistant_write_locked_until).getTime()
    : 0
  const proposed = now + minutes * 60_000

  // Extend-only: this is the entire point of the feature — an active lock
  // can never be shortened or cleared through this endpoint.
  if (currentLock > now && proposed <= currentLock) {
    return NextResponse.json({ success: false, error: 'an active lock cannot be shortened' }, { status: 409 })
  }

  const lockedUntil = new Date(proposed).toISOString()
  const { error } = await auth.supabase
    .from('user_settings')
    .upsert(
      { user_id: auth.user.id, assistant_write_locked_until: lockedUntil, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  if (error) return NextResponse.json({ success: false, error: 'internal' }, { status: 500 })
  return NextResponse.json({ success: true, lockedUntil })
}
