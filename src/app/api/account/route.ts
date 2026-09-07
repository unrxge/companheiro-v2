import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireUser } from '@/lib/supabase/route'

const TABLES = [
  'check_ins',
  'captures',
  'ideas',
  'pieces',
  'piece_sections',
  'anchor_lines',
  'tasks',
  'session_logs',
  'post_publication_logs',
  'trajectories',
  'portrait_entries',
  'conceptualise_drafts',
  'user_territory_config',
  'user_settings',
  'letters',
] as const

/** GET /api/account — export everything this person owns as one JSON document. */
export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { supabase, user } = auth

    const out: Record<string, unknown> = {
      exported_at: new Date().toISOString(),
      user: { id: user.id, email: user.email },
    }
    await Promise.all(
      TABLES.map(async (table) => {
        const { data, error } = await supabase.from(table).select('*').eq('user_id', user.id)
        out[table] = error ? { error: error.message } : data
      })
    )
    return new NextResponse(JSON.stringify(out, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="companheiro-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    })
  } catch (error) {
    console.error('account export error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

/**
 * DELETE /api/account — delete the account and, through ON DELETE CASCADE,
 * every row that belongs to it. Needs the service-role key server-side.
 */
export async function DELETE() {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!key) {
      return NextResponse.json({ success: false, error: 'Account deletion is not configured on this server yet.' }, { status: 501 })
    }
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await admin.auth.admin.deleteUser(auth.user.id)
    if (error) {
      console.error('account delete error:', error)
      return NextResponse.json({ success: false, error: 'Failed to delete account' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('account DELETE error:', error)
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 })
  }
}
