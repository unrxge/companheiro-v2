import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { confirmPortraitEntry } from '@/lib/portrait'

interface ConfirmRequest {
  id: string
  confirmed: boolean
  correction?: string
}

export async function POST(request: NextRequest): Promise<NextResponse<{ success: boolean }>> {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ success: false }, { status: 401 })
    }

    const body: ConfirmRequest = await request.json()
    if (!body.id) {
      return NextResponse.json({ success: false }, { status: 400 })
    }

    const { supabase, user } = auth

    if (body.confirmed) {
      await confirmPortraitEntry(auth, body.id)
    } else {
      await supabase
        .from('portrait_entries')
        .update({ status: 'rejected', rejection_note: body.correction?.trim() || null })
        .eq('id', body.id)
        .eq('user_id', user.id)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('portrait confirm error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
