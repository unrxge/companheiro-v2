import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'

interface DraftMessage {
  role: 'user' | 'assistant'
  content: string
}

interface SaveDraftRequest {
  id?: string | null
  seed?: string | null
  question?: string | null
  messages: DraftMessage[]
  phase: number
  ready_to_advance?: boolean
}

// GET: return all drafts for this user, newest first.
export async function GET() {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ drafts: [] }, { status: 401 })

    const { supabase, user } = auth

    const { data } = await supabase
      .from('conceptualise_drafts')
      .select('id, seed, question, messages, phase, ready_to_advance, updated_at')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })

    return NextResponse.json({ drafts: data || [] })
  } catch (error) {
    console.error('conceptualise draft GET error:', error)
    return NextResponse.json({ drafts: [] }, { status: 500 })
  }
}

// PUT: create a new draft (no id) or update an existing one (id in body).
// Returns { success, id } so the caller can track the draft across saves.
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false }, { status: 401 })

    const body: SaveDraftRequest = await request.json()
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return NextResponse.json({ success: false }, { status: 400 })
    }

    const { supabase, user } = auth
    const now = new Date().toISOString()

    if (body.id) {
      const { error } = await supabase
        .from('conceptualise_drafts')
        .update({
          seed: body.seed || null,
          question: body.question || null,
          messages: body.messages,
          phase: body.phase,
          ready_to_advance: body.ready_to_advance ?? false,
          updated_at: now,
        })
        .eq('id', body.id)
        .eq('user_id', user.id)

      if (error) {
        console.error('conceptualise draft update error:', error)
        return NextResponse.json({ success: false }, { status: 500 })
      }

      return NextResponse.json({ success: true, id: body.id })
    }

    const { data, error } = await supabase
      .from('conceptualise_drafts')
      .insert({
        user_id: user.id,
        seed: body.seed || null,
        question: body.question || null,
        messages: body.messages,
        phase: body.phase,
        ready_to_advance: body.ready_to_advance ?? false,
        updated_at: now,
      })
      .select('id')
      .single()

    if (error || !data) {
      console.error('conceptualise draft insert error:', error)
      return NextResponse.json({ success: false }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: data.id })
  } catch (error) {
    console.error('conceptualise draft PUT error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}

// DELETE: remove a specific draft by ?id=<uuid>.
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ success: false }, { status: 401 })

    const { supabase, user } = auth
    const id = new URL(request.url).searchParams.get('id')

    if (!id) return NextResponse.json({ success: false, error: 'id required' }, { status: 400 })

    await supabase
      .from('conceptualise_drafts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('conceptualise draft DELETE error:', error)
    return NextResponse.json({ success: false }, { status: 500 })
  }
}
