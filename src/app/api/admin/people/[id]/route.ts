import { NextResponse } from 'next/server'
import { adminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/ops/admin'
import { sharesAnalytics } from '@/lib/usage-analytics'
import { projectStories, summarise, writingByDay } from '@/lib/ops/people'
import { accountsFor, personRows } from '@/lib/ops/people-db'

/**
 * GET /api/admin/people/[id] — one person's usage analytics: each of their
 * projects as the dates things happened and how much of each kind there is,
 * and the minutes they wrote on each recent day. Never a title or a word of
 * what they made. Owner only, and answers "not found" for anyone who does
 * not share analytics, whether or not the account exists.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (!auth) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const db = adminClient()
  if (!db) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY missing' }, { status: 500 })

  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const { data } = await db.auth.admin.getUserById(id)
    if (!data?.user || !sharesAnalytics(data.user.user_metadata)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const [[account], rows] = await Promise.all([accountsFor(db, [data.user]), personRows(db, id)])
    return NextResponse.json({
      person: summarise(account, rows),
      projects: projectStories(rows),
      writing: writingByDay(rows),
    })
  } catch (error) {
    console.error('admin person error:', error)
    return NextResponse.json({ error: 'Could not read usage analytics.' }, { status: 500 })
  }
}
