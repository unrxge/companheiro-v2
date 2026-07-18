import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { resyncPieceDraft } from '@/lib/write-sections'

// GET  ?piece_id=  -> { sections, anchorLines, writing_ethos }
// POST            -> create a section
// PATCH           -> update a section (content/label/intended_emotion/is_locked/position)
// DELETE          -> delete a section

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const pieceId = request.nextUrl.searchParams.get('piece_id')
    if (!pieceId) return NextResponse.json({ error: 'Missing piece_id' }, { status: 400 })

    const { supabase, user } = auth

    const [{ data: sections }, { data: anchorLines }, { data: piece }] = await Promise.all([
      supabase
        .from('piece_sections')
        .select('id, position, label, intended_emotion, content, is_locked')
        .eq('piece_id', pieceId)
        .eq('user_id', user.id)
        .order('position', { ascending: true }),
      supabase
        .from('anchor_lines')
        .select('id, section_id, text, created_at')
        .eq('piece_id', pieceId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('pieces')
        .select('writing_ethos')
        .eq('id', pieceId)
        .eq('user_id', user.id)
        .single(),
    ])

    return NextResponse.json({
      sections: sections || [],
      anchorLines: anchorLines || [],
      writing_ethos: piece?.writing_ethos ?? null,
    })
  } catch (error) {
    console.error('sections GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { piece_id, label, intended_emotion, content, position } = await request.json()
    if (!piece_id) return NextResponse.json({ error: 'Missing piece_id' }, { status: 400 })

    const { supabase, user } = auth

    // Default new section to the end if no position given
    let nextPosition = position
    if (nextPosition === undefined || nextPosition === null) {
      const { data: last } = await supabase
        .from('piece_sections')
        .select('position')
        .eq('piece_id', piece_id)
        .eq('user_id', user.id)
        .order('position', { ascending: false })
        .limit(1)
        .maybeSingle()
      nextPosition = last ? last.position + 1 : 0
    }

    const { data, error } = await supabase
      .from('piece_sections')
      .insert({
        user_id: user.id,
        piece_id,
        label: label ?? null,
        intended_emotion: intended_emotion ?? null,
        content: content ?? '',
        position: nextPosition,
      })
      .select('id, position, label, intended_emotion, content, is_locked')
      .single()

    if (error) {
      console.error('section insert error:', error)
      return NextResponse.json({ error: 'Failed to create section' }, { status: 500 })
    }

    if (content?.trim()) await resyncPieceDraft(auth, piece_id)

    return NextResponse.json({ section: data })
  } catch (error) {
    console.error('sections POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const { id, piece_id } = body
    if (!id || !piece_id) return NextResponse.json({ error: 'Missing id/piece_id' }, { status: 400 })

    const { supabase, user } = auth

    const update: Record<string, string | boolean | number | null> = {
      updated_at: new Date().toISOString(),
    }
    if (body.content !== undefined) update.content = body.content
    if (body.label !== undefined) update.label = body.label
    if (body.intended_emotion !== undefined) update.intended_emotion = body.intended_emotion
    if (body.is_locked !== undefined) update.is_locked = body.is_locked
    if (body.position !== undefined) update.position = body.position

    const { error } = await supabase
      .from('piece_sections')
      .update(update)
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('section update error:', error)
      return NextResponse.json({ error: 'Failed to update section' }, { status: 500 })
    }

    if (body.content !== undefined) await resyncPieceDraft(auth, piece_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('sections PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, piece_id } = await request.json()
    if (!id || !piece_id) return NextResponse.json({ error: 'Missing id/piece_id' }, { status: 400 })

    const { supabase, user } = auth

    const { error } = await supabase
      .from('piece_sections')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('section delete error:', error)
      return NextResponse.json({ error: 'Failed to delete section' }, { status: 500 })
    }

    await resyncPieceDraft(auth, piece_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('sections DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
