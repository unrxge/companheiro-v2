import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'

interface DraftMessage {
  role: 'user' | 'assistant'
  content: string
}

interface SaveDraftRequest {
  seed?: string | null
  messages: DraftMessage[]
  phase: number
  ready_to_advance?: boolean
}

// One draft per user (unique on user_id) — GET/PUT/DELETE all operate on
// "the" draft, no id needed. Autosaved from the conceptualise chat so a
// session can be resumed instead of lost on refresh or tab close.
export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ draft: null }, { status: 401 })

    const { supabase, user } = auth

    const { data } = await supabase
      .from('conceptualise_drafts')
      .select('seed, messages, phase, ready_to_advance, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()

    return NextResponse.json({ draft: data || null })
  } catch (error) {
    console.error('conceptualise draft GET error:', error)
    return NextResponse.json({ draft: null }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false }, { status: 401 })

    const body: SaveDraftRequest = await request.json()
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ success: false }, { status: 400 })
    }

    const { supabase, user } = auth

    const { error } = await supabase
      .from('conceptualise_drafts')
      .upsert(
        {
          user_id: user.id,
          seed: body.seed || null,
          messages: body.messages,
          phase: body.phase,
          ready_to_advance: body.ready_to_advance ?? false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('conceptualise draft upsert error:', error)
      return NextResponse.json({ success: false }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('conceptualise draft PUT error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false }, { status: 401 })

    const { supabase, user } = auth

    await supabase.from('conceptualise_drafts').delete().eq('user_id', user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('conceptualise draft DELETE error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
