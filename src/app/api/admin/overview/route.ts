import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { capsMicros, moneyConfig, requireAdmin, WATCH_LIST } from '@/lib/ops/admin'

/** GET /api/admin/overview?days=30&env=production — everything on /admin in one call. */
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const db = adminClient()
  if (!db) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 500 })

  const url = new URL(request.url)
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 180)
  const env = url.searchParams.get('env') || 'production'

  const { data, error } = await db.rpc('admin_dashboard', { p_days: days, p_env: env, p_caps: capsMicros() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, days, env, money: moneyConfig(), watch: WATCH_LIST })
}
