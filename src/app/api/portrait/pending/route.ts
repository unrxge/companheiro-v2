import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'

interface PendingResponse {
  entry: {
    id: string
    kind: string
    statement: string
  } | null
}

export async function GET(): Promise<NextResponse<PendingResponse>> {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ entry: null }, { status: 401 })
    }

    const { supabase, user } = auth

    const { data } = await supabase
      .from('portrait_entries')
      .select('id, kind, statement')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({ entry: data || null })
  } catch (error) {
    console.error('portrait pending error:', error)
    return NextResponse.json({ entry: null }, { status: 500 })
  }
}
