import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'
import { resyncPieceDraft } from '@/lib/write-sections'

// Divides freely-written prose across the piece's intended structure. Splits
// the existing text WITHOUT rewriting it — every word is preserved, in order,
// assigned to the beat it belongs to. Replaces the current sections with the
// divided result. Refuses if any section is locked (would disturb sealed work).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { piece_id } = await request.json()
    if (!piece_id) return NextResponse.json({ error: 'Missing piece_id' }, { status: 400 })

    const { supabase, user } = auth

    const [{ data: existing }, { data: piece }] = await Promise.all([
      supabase
        .from('piece_sections')
        .select('id, label, intended_emotion, is_locked')
        .eq('piece_id', piece_id)
        .eq('user_id', user.id)
        .order('position', { ascending: true }),
      supabase
        .from('pieces')
        .select('substack_draft, emotional_journey')
        .eq('id', piece_id)
        .eq('user_id', user.id)
        .single(),
    ])

    if ((existing || []).some((s) => s.is_locked)) {
      return NextResponse.json(
        { error: 'Unlock all sections before dividing — dividing would disturb locked work.' },
        { status: 409 }
      )
    }

    const prose = (piece?.substack_draft || '').trim()
    if (!prose) return NextResponse.json({ error: 'Nothing written to divide yet.' }, { status: 400 })

    const targetBeats =
      existing && existing.length > 1
        ? existing.map((s) => `- ${s.label || 'untitled'}${s.intended_emotion ? ` (${s.intended_emotion})` : ''}`).join('\n')
        : null

    const response = await anthropic.messages.create({
      model: MODELS.deep,
      max_tokens: 3000,
      system: `You divide a piece of freely-written prose into its sections. This is a SPLIT, never a rewrite.

Absolute rules:
- Do NOT change, add, remove, or reword any of the prose. Every word of the original must appear exactly once, in its original order, across the sections.
- You are only deciding where the cuts fall — assigning each contiguous stretch of the existing text to the beat it belongs to.
- Follow the intended emotional journey. ${
        targetBeats ? 'Use these existing beats as the sections, in order:' : 'Derive 3-6 natural beats from the emotional journey.'
      }

Return ONLY JSON:
{ "sections": [ { "label": "...", "intended_emotion": "...", "content": "the exact contiguous slice of the original prose for this beat" } ] }`,
      messages: [
        {
          role: 'user',
          content: `INTENDED EMOTIONAL JOURNEY: ${piece?.emotional_journey || '(none — infer a natural progression)'}
${targetBeats ? `\nBEATS TO DIVIDE INTO:\n${targetBeats}` : ''}

THE PROSE TO DIVIDE:
"""
${prose}
"""`,
        },
      ],
    })

    const textContent = response.content.find((b) => b.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'Failed to divide' }, { status: 500 })
    }

    const cleaned = textContent.text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as {
      sections?: Array<{ label?: string; intended_emotion?: string; content?: string }>
    }
    const beats = (parsed.sections || []).filter((b) => (b.content || '').trim().length > 0)
    if (beats.length === 0) return NextResponse.json({ error: 'Division produced nothing' }, { status: 500 })

    // Replace existing sections with the divided set.
    await supabase.from('piece_sections').delete().eq('piece_id', piece_id).eq('user_id', user.id)

    const rows = beats.map((b, i) => ({
      user_id: user.id,
      piece_id,
      position: i,
      label: b.label || `Section ${i + 1}`,
      intended_emotion: b.intended_emotion || null,
      content: b.content || '',
    }))

    const { data: inserted, error } = await supabase
      .from('piece_sections')
      .insert(rows)
      .select('id, position, label, intended_emotion, content, is_locked')

    if (error) {
      console.error('divide insert error:', error)
      return NextResponse.json({ error: 'Failed to save divided sections' }, { status: 500 })
    }

    await resyncPieceDraft(auth, piece_id)

    return NextResponse.json({ sections: inserted })
  } catch (error) {
    console.error('divide error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
