import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_SECONDS_PER_PING = 600
const HISTORY_DAYS = 40

// Heartbeats from the Write page — active-tab seconds, bucketed by the
// client's own local date so it lines up with how the weather strip buckets
// days. Powers the Inner Weather widget's "wrote, didn't check in" signal.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const seconds = Math.round(Number(body?.seconds))
    const date = body?.date

    if (!Number.isFinite(seconds) || seconds < 1 || typeof date !== 'string' || !DATE_RE.test(date)) {
      return NextResponse.json({ error: 'seconds (>=1) and date (YYYY-MM-DD) are required' }, { status: 400 })
    }

    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const clamped = Math.min(seconds, MAX_SECONDS_PER_PING)
    const { error } = await auth.supabase.rpc('increment_writing_activity', {
      p_user_id: auth.user.id,
      p_date: date,
      p_seconds: clamped,
    })

    if (error) {
      console.error('writing activity increment error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('writing activity log error:', error)
    return NextResponse.json({ error: 'Unknown error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ activity: [] }, { status: 401 })
    }

    const { data } = await auth.supabase
      .from('writing_activity')
      .select('date, seconds')
      .eq('user_id', auth.user.id)
      .order('date', { ascending: false })
      .limit(HISTORY_DAYS)

    return NextResponse.json({ activity: data || [] })
  } catch (error) {
    console.error('writing activity fetch error:', error)
    return NextResponse.json({ activity: [] }, { status: 500 })
  }
}
