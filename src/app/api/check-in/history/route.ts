import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { patternsForCheckIns } from '@/lib/portrait'

const HISTORY_LIMIT = 20
// The weather strip is a rolling 30 days, so everything in that window has to
// come back however many check-ins it holds. One extra day covers the gap
// between UTC and the person's own midnight; the ceiling is only a guard.
const WINDOW_DAYS = 31
const WINDOW_CEILING = 300
const COLUMNS = 'id, created_at, raw_entry, full_conversation, energy, inner_weather, arc_texture, check_in_type'

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ checkIns: [] }, { status: 401 })
    }

    const { supabase, user } = auth

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const { data: windowRows } = await supabase
      .from('check_ins')
      .select(COLUMNS)
      .eq('user_id', user.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(WINDOW_CEILING)

    // Someone who checks in rarely still sees their last few, as before.
    let rows = windowRows || []
    if (rows.length < HISTORY_LIMIT) {
      const { data: latest } = await supabase
        .from('check_ins')
        .select(COLUMNS)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(HISTORY_LIMIT)
      rows = latest || rows
    }
    const patterns = await patternsForCheckIns(auth, rows.map((r) => r.id))

    return NextResponse.json({ checkIns: rows.map((r) => ({ ...r, patterns: patterns[r.id] ?? [] })) })
  } catch (error) {
    console.error('check-in history error:', error)
    return NextResponse.json({ checkIns: [] }, { status: 500 })
  }
}
