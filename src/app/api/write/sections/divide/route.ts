import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'
import { resyncPieceDraft } from '@/lib/write-sections'
import { logUsage } from '@/lib/usage-log'

// Divides freely-written prose across the piece's intended structure. Splits
// the existing text WITHOUT rewriting it — every word is preserved, in order,
// assigned to the beat it belongs to. Replaces the current sections with the
// divided result. Refuses if any section is locked (would disturb sealed work).
//
// The model is only ever asked WHERE the cuts fall (a short "starts_with"
// anchor per section), never to retype the prose itself — the actual section
// content is always a slice of the ORIGINAL string, located by searching for
// that anchor. This makes "not a rewrite" a property of the code instead of
// something trusted to instruction-following, and cuts output tokens from a
// full retyped draft down to a handful of words per section.

// Locates each section's start in the original prose from its anchor phrase,
// trying progressively shorter prefixes of the anchor before giving up (a
// model's "verbatim" copy can drift a word or two near the end). The first
// boundary is always 0 and boundaries never go backwards, so concatenating
// the resulting slices always reconstructs the original text exactly — no
// text can be dropped or duplicated regardless of how the anchors resolve.
function findBoundaries(prose: string, anchors: string[]): number[] {
  const boundaries: number[] = [0]
  let cursor = 0
  for (let i = 1; i < anchors.length; i++) {
    const anchor = (anchors[i] || '').trim()
    let idx = -1
    if (anchor) {
      const words = anchor.split(/\s+/).filter(Boolean)
      for (let take = words.length; take >= 3 && idx === -1; take--) {
        idx = prose.indexOf(words.slice(0, take).join(' '), cursor)
      }
    }
    if (idx === -1 || idx < cursor) {
      // Anchor missing or out of order — split what's left evenly rather
      // than lose or duplicate any text.
      const remaining = anchors.length - i
      idx = cursor + Math.floor((prose.length - cursor) / (remaining + 1))
    }
    boundaries.push(idx)
    cursor = idx
  }
  return boundaries
}

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
      max_tokens: 700,
      system: `You divide a piece of freely-written prose into its sections. This is a SPLIT, never a rewrite — you are only deciding WHERE the cuts fall, not retyping any text.

Rules:
- You are assigning each contiguous stretch of the existing text to the beat it belongs to, in order.
- Follow the intended emotional journey. ${
        targetBeats ? 'Use these existing beats as the sections, in order:' : 'Derive 3-6 natural beats from the emotional journey.'
      }
- For each section, "starts_with" is the first 6-10 words of that section, copied EXACTLY verbatim from the prose (character for character, same punctuation) — this is how the split point is located. The first section's starts_with should match the very beginning of the prose.

Return ONLY JSON:
{ "sections": [ { "label": "...", "intended_emotion": "...", "starts_with": "..." } ] }`,
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

    logUsage('write/sections/divide', response.model, response.usage)

    const textContent = response.content.find((b) => b.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ error: 'Failed to divide' }, { status: 500 })
    }

    const cleaned = textContent.text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as {
      sections?: Array<{ label?: string; intended_emotion?: string; starts_with?: string }>
    }
    const beatMeta = (parsed.sections || []).filter((b) => b.label || b.starts_with)
    if (beatMeta.length === 0) return NextResponse.json({ error: 'Division produced nothing' }, { status: 500 })

    const boundaries = findBoundaries(prose, beatMeta.map((b) => b.starts_with || ''))
    const beats = beatMeta.map((b, i) => ({
      label: b.label,
      intended_emotion: b.intended_emotion,
      // Always a verbatim slice of the ORIGINAL prose — the model's own copy
      // of the text (starts_with) never lands in the database.
      content: prose.slice(boundaries[i], i === beatMeta.length - 1 ? prose.length : boundaries[i + 1]),
    }))

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
