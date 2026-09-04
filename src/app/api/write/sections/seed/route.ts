import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'
import { withLanguage } from '@/lib/language'

// Derives an editable section skeleton for a piece from its Core Concept's
// emotional_journey (each beat -> one section, with a loose suggestion +
// example). Refuses if sections already exist unless force=true.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { piece_id, force } = await request.json()
    if (!piece_id) return NextResponse.json({ error: 'Missing piece_id' }, { status: 400 })

    const { supabase, user } = auth

    const { data: existing } = await supabase
      .from('piece_sections')
      .select('id')
      .eq('piece_id', piece_id)
      .eq('user_id', user.id)
      .limit(1)

    if (existing && existing.length > 0 && !force) {
      return NextResponse.json({ error: 'Sections already exist' }, { status: 409 })
    }

    const { data: piece } = await supabase
      .from('pieces')
      .select('title, emotional_journey, conviction_statement, core_truth, substack_draft')
      .eq('id', piece_id)
      .eq('user_id', user.id)
      .single()

    if (!piece) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })

    const response = await anthropic.messages.create({
      model: MODELS.deep,
      max_tokens: 900,
      system: withLanguage(`You are Companheiro, turning a piece's intended emotional journey into a section skeleton the writer will draft into.

Break the emotional journey into an ordered set of 3-6 sections. Each section is a beat of the piece with:
- "label": a short, evocative name for the beat (2-4 words)
- "intended_emotion": the single feeling this beat should carry (one or two words)
- "suggestion": one sentence of loose guidance on what this beat does — direction, not prescription

Follow the emotional journey's actual shape. Do not invent an arc it doesn't have. If the journey is thin, infer a natural, honest progression from the conviction and core truth.

Return ONLY JSON:
{ "sections": [ { "label": "...", "intended_emotion": "...", "suggestion": "..." }, ... ] }`),
      messages: [
        {
          role: 'user',
          content: `Title: ${piece.title || '(untitled)'}
Conviction: ${piece.conviction_statement || '(none)'}
Core truth: ${piece.core_truth || '(none)'}
Emotional journey: ${piece.emotional_journey || '(not defined — infer an honest progression)'}`,
        },
      ],
    })

    const textContent = response.content.find((b) => b.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'Failed to generate sections' }, { status: 500 })
    }

    const cleaned = textContent.text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as {
      sections?: Array<{ label?: string; intended_emotion?: string; suggestion?: string }>
    }
    const beats = (parsed.sections || []).slice(0, 6)
    if (beats.length === 0) {
      return NextResponse.json({ error: 'No sections generated' }, { status: 500 })
    }

    // If regenerating, clear the old skeleton first.
    if (force) {
      await supabase
        .from('piece_sections')
        .delete()
        .eq('piece_id', piece_id)
        .eq('user_id', user.id)
    }

    const rows = beats.map((b, i) => ({
      user_id: user.id,
      piece_id,
      position: i,
      label: b.label || `Section ${i + 1}`,
      intended_emotion: b.intended_emotion || null,
      content: '',
    }))

    const { data: inserted, error } = await supabase
      .from('piece_sections')
      .insert(rows)
      .select('id, position, label, intended_emotion, content, is_locked')

    if (error) {
      console.error('seed insert error:', error)
      return NextResponse.json({ error: 'Failed to save sections' }, { status: 500 })
    }

    // Return sections plus the per-beat suggestions (client shows them as guidance).
    const suggestions = beats.map((b) => b.suggestion || '')

    return NextResponse.json({ sections: inserted, suggestions })
  } catch (error) {
    console.error('sections seed error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
