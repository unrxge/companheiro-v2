import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'

const HISTORY_LIMIT = 20

export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ checkIns: [] }, { status: 401 })
    }

    const { supabase, user } = auth

    const { data } = await supabase
      .from('check_ins')
      .select('id, created_at, raw_entry, full_conversation, energy, inner_weather, arc_texture, check_in_type')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)

    return NextResponse.json({ checkIns: data || [] })
  } catch (error) {
    console.error('check-in history error:', error)
    return NextResponse.json({ checkIns: [] }, { status: 500 })
  }
}
