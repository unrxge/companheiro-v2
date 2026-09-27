import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/ops/admin'

/** GET /api/admin/route-calls?route=write/chat&days=30&env=production — one task's recent calls. */
export async function GET(request: Request) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const db = adminClient()
  if (!db) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 500 })

  const url = new URL(request.url)
  const route = url.searchParams.get('route')
  if (!route) return NextResponse.json({ error: 'route required' }, { status: 400 })
  const days = Math.min(Math.max(Number(url.searchParams.get('days')) || 30, 1), 180)
  const env = url.searchParams.get('env') || 'production'

  const { data, error } = await db.rpc('admin_route_calls', { p_route: route, p_days: days, p_env: env })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ calls: data ?? [] })
}
