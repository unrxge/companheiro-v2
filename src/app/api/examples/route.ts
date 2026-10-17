// GET /api/examples — the example projects this person's Project Board shows,
// theirs first (chosen from the practices they named at sign-up), or none
// when they have put them away or their account is older than the examples.
// PATCH { on } — show them again, or put them away. Kept in the auth user's
// metadata (`examples`), beside the consent record, so it needs no table.

import { NextResponse, type NextRequest } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { exampleCard, examplesFor, examplesShown } from '@/lib/examples'

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ shown: false, examples: [] }, { status: 401 })
    const { supabase, user } = auth
    const shown = examplesShown(user.user_metadata, user.created_at)
    if (!shown) return NextResponse.json({ shown: false, examples: [] })
    // What they said their practice is: the `profiles` row when there is one, otherwise the account's metadata.
    const { data: row } = await supabase.from('profiles').select('practices').eq('user_id', user.id).maybeSingle()
    const practices: unknown = (row as { practices?: unknown } | null)?.practices ?? user.user_metadata?.profile?.practices
    const now = Date.now()
    const examples = examplesFor(Array.isArray(practices) ? practices.map(String) : []).map(({ example, matched }) => exampleCard(example, matched, now))
    return NextResponse.json({ shown: true, examples })
  } catch (error) {
    console.error('examples GET error:', error)
    return NextResponse.json({ shown: false, examples: [] }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false }, { status: 401 })
    const body = (await request.json().catch(() => ({}))) as { on?: unknown }
    if (typeof body.on !== 'boolean') return NextResponse.json({ success: false, error: 'on must be true or false' }, { status: 400 })
    const { error } = await auth.supabase.auth.updateUser({ data: { examples: { on: body.on, changed_at: new Date().toISOString() } } })
    if (error) {
      console.error('examples PATCH error:', error)
      return NextResponse.json({ success: false }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('examples PATCH error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
