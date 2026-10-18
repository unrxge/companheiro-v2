// GET /api/examples/tour — has this person had the walk round an example yet,
// and what did they say they make (so the walk can talk about songs to a
// songwriter). POST — they have now. Kept in the auth user's metadata
// (`example_tour`), beside `examples`, so it follows the account across
// devices and needs no table. It is shown once: the first example opened.
//
// Signed out (an example opened from a shared link, or the preview), there is
// no account to keep it in: the page keeps it in the browser instead.

import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ seen: false, practices: [], signedIn: false })
    const { supabase, user } = auth
    const seen = !!(user.user_metadata?.example_tour as { seen_at?: string } | undefined)?.seen_at
    const { data: row } = await supabase.from('profiles').select('practices').eq('user_id', user.id).maybeSingle()
    const raw: unknown = (row as { practices?: unknown } | null)?.practices ?? user.user_metadata?.profile?.practices
    const practices = Array.isArray(raw) ? raw.map(String) : []
    return NextResponse.json({ seen, practices, signedIn: true })
  } catch (error) {
    console.error('example tour GET error:', error)
    // Not knowing is not a reason to play it again over someone's work.
    return NextResponse.json({ seen: true, practices: [], signedIn: false }, { status: 500 })
  }
}

export async function POST() {
  try {
    const auth = await requireUser()
    if (!auth) return new NextResponse(null, { status: 204 })
    const { error } = await auth.supabase.auth.updateUser({ data: { example_tour: { seen_at: new Date().toISOString() } } })
    if (error) {
      console.error('example tour POST error:', error)
      return NextResponse.json({ success: false }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('example tour POST error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
