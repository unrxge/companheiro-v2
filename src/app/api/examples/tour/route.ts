// GET /api/examples/tour — has this person had the walks round an example yet
// (the canvas's, and the writing page's), round the check-in, Home, the Idea Lab's summoning and the Portrait, and what did they say they make (so
// a walk can talk about songs to a songwriter). POST { which } — they have now. Kept in the auth user's metadata
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
    if (!auth) return NextResponse.json({ seen: false, pieceSeen: false, checkInSeen: false, pageSeen: { home: false, idealab: false, portrait: false }, practices: [], signedIn: false })
    const { supabase, user } = auth
    const kept = user.user_metadata?.example_tour as Record<string, string | undefined> | undefined
    const seen = !!kept?.seen_at
    const pieceSeen = !!kept?.piece_seen_at
    const checkInSeen = !!kept?.check_in_seen_at
    const { data: row } = await supabase.from('profiles').select('practices').eq('user_id', user.id).maybeSingle()
    const raw: unknown = (row as { practices?: unknown } | null)?.practices ?? user.user_metadata?.profile?.practices
    const practices = Array.isArray(raw) ? raw.map(String) : []
    // The walks round Home, the Idea Lab's summoning and the Portrait.
    const pageSeen = { home: !!kept?.home_seen_at, idealab: !!kept?.idea_lab_seen_at, portrait: !!kept?.portrait_seen_at }
    // Walks switched back on from Settings: the Project Board then opens the example nearest to
    // what they make and the canvas walk plays; at its end the piece's walk follows.
    const rearmedAt = typeof kept?.rearmed_at === 'string' ? kept.rearmed_at : null
    const autoOpen = !!rearmedAt && !seen
    const chainPiece = !!rearmedAt && !pieceSeen
    return NextResponse.json({ seen, pieceSeen, checkInSeen, pageSeen, practices, rearmedAt, autoOpen, chainPiece, signedIn: true })
  } catch (error) {
    console.error('example tour GET error:', error)
    // Not knowing is not a reason to play it again over someone's work.
    return NextResponse.json({ seen: true, pieceSeen: true, checkInSeen: true, pageSeen: { home: true, idealab: true, portrait: true }, practices: [], signedIn: false }, { status: 500 })
  }
}

// POST { which } — they have now. POST { rearm: true } — every walk is due again (Settings → Take the tour).
export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) return new NextResponse(null, { status: 204 })
    const body = (await request.json().catch(() => ({}))) as { which?: unknown; rearm?: unknown }
    if (body.rearm === true) {
      // "Take the tour" in Settings: every walk is due again, and the example projects are on so the board has one to open.
      const now = new Date().toISOString()
      const { error } = await auth.supabase.auth.updateUser({ data: { example_tour: { rearmed_at: now }, examples: { on: true, changed_at: now } } })
      if (error) {
        console.error('example tour rearm error:', error)
        return NextResponse.json({ success: false }, { status: 500 })
      }
      return NextResponse.json({ success: true })
    }
    const FIELD: Record<string, string> = { piece: 'piece_seen_at', checkin: 'check_in_seen_at', home: 'home_seen_at', idealab: 'idea_lab_seen_at', portrait: 'portrait_seen_at' }
    const field = typeof body.which === 'string' && FIELD[body.which] ? FIELD[body.which] : 'seen_at'
    const kept = (auth.user.user_metadata?.example_tour ?? {}) as Record<string, unknown>
    const { error } = await auth.supabase.auth.updateUser({ data: { example_tour: { ...kept, [field]: new Date().toISOString() } } })
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
