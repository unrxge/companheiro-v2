import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'
import { withLanguage } from '@/lib/language'
import { logUsage } from '@/lib/usage-log'

// Derives an editable section skeleton (child studio_nodes under node_id)
// from the root node's emotional_journey (each beat -> one section, with a
// loose suggestion + example). Refuses if sections already exist unless
// force=true.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { node_id, force } = await request.json()
    if (!node_id) return NextResponse.json({ error: 'Missing node_id' }, { status: 400 })

    const { supabase, user } = auth

    const { data: existing } = await supabase
      .from('studio_nodes')
      .select('id')
      .eq('parent_id', node_id)
      .eq('user_id', user.id)
      .limit(1)

    if (existing && existing.length > 0 && !force) {
      return NextResponse.json({ error: 'Sections already exist' }, { status: 409 })
    }

    const { data: piece } = await supabase
      .from('studio_nodes')
      .select('id, project_id, title, emotional_journey, intent, core_truth')
      .eq('id', node_id)
      .eq('user_id', user.id)
      .single()

    if (!piece) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })

    // This is extraction/formatting from a journey the writer already
    // confirmed (3-6 short beats, no craft judgement being made) — the same
    // job the fast model already does for the analogous seed inside
    // write/sections/ingest.
    const response = await anthropic.messages.create({
      model: MODELS.fast,
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
Conviction: ${piece.intent || '(none)'}
Core truth: ${piece.core_truth || '(none)'}
Emotional journey: ${piece.emotional_journey || '(not defined — infer an honest progression)'}`,
        },
      ],
    })

    logUsage('write/sections/seed', response.model, response.usage)

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
        .from('studio_nodes')
        .delete()
        .eq('parent_id', node_id)
        .eq('user_id', user.id)
    }

    const rows = beats.map((b, i) => ({
      user_id: user.id,
      project_id: piece.project_id,
      parent_id: node_id,
      position: i,
      title: b.label || `Section ${i + 1}`,
      beat: b.intended_emotion || '',
      body: '',
    }))

    const { data: inserted, error } = await supabase
      .from('studio_nodes')
      .insert(rows)
      .select('id, position, title, beat, body, is_locked')

    if (error) {
      console.error('seed insert error:', error)
      return NextResponse.json({ error: 'Failed to save sections' }, { status: 500 })
    }

    const sections = (inserted || [])
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, position: s.position, label: s.title || null, intended_emotion: s.beat || null, content: s.body || '', is_locked: s.is_locked }))

    // Return sections plus the per-beat suggestions (client shows them as guidance).
    const suggestions = beats.map((b) => b.suggestion || '')

    return NextResponse.json({ sections, suggestions })
  } catch (error) {
    console.error('sections seed error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
