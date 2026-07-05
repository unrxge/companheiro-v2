import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'

export async function POST(request: NextRequest): Promise<NextResponse<{ success: boolean }>> {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ success: false }, { status: 401 })
    }

    const { id } = await request.json()
    if (!id) {
      return NextResponse.json({ success: false }, { status: 400 })
    }

    const { supabase, user } = auth
    await supabase
      .from('portrait_entries')
      .update({ status: 'dormant' })
      .eq('id', id)
      .eq('user_id', user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('portrait retire error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
