import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'

// POST   -> add an anchor line. If no section_id given, AI places it into the
//           best-fitting existing section.
// DELETE -> remove an anchor line.

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { piece_id, text, section_id } = await request.json()
    if (!piece_id || !text?.trim()) {
      return NextResponse.json({ error: 'Missing piece_id/text' }, { status: 400 })
    }

    const { supabase, user } = auth

    let resolvedSectionId: string | null = section_id ?? null

    // No explicit section → let the AI place the line into the best section.
    if (!resolvedSectionId) {
      const { data: sections } = await supabase
        .from('piece_sections')
        .select('id, label, intended_emotion, content')
        .eq('piece_id', piece_id)
        .eq('user_id', user.id)
        .order('position', { ascending: true })

      if (sections && sections.length > 0) {
        try {
          const response = await anthropic.messages.create({
            model: MODELS.fast,
            max_tokens: 60,
            system: `You place a writer's precious one-liner into whichever section it most belongs. Return ONLY the exact id of the best-fitting section, nothing else. If none fit well, return the id of the section whose intended emotion is closest.`,
            messages: [
              {
                role: 'user',
                content: `Line: "${text.trim()}"

Sections:
${sections
  .map(
    (s) =>
      `id: ${s.id} | ${s.label || 'untitled'} (emotion: ${s.intended_emotion || 'n/a'})${
        s.content ? ` | current text: ${s.content.slice(0, 200)}` : ''
      }`
  )
  .join('\n')}

Return the id only.`,
              },
            ],
          })
          const raw = response.content.find((b) => b.type === 'text')
          const guessed = raw && raw.type === 'text' ? raw.text.trim() : ''
          const match = sections.find((s) => guessed.includes(s.id))
          resolvedSectionId = match ? match.id : null
        } catch (err) {
          // Placement is best-effort — fall back to unassigned.
          console.error('anchor-line placement error:', err)
          resolvedSectionId = null
        }
      }
    }

    const { data, error } = await supabase
      .from('anchor_lines')
      .insert({
        user_id: user.id,
        piece_id,
        section_id: resolvedSectionId,
        text: text.trim(),
      })
      .select('id, section_id, text, created_at')
      .single()

    if (error) {
      console.error('anchor-line insert error:', error)
      return NextResponse.json({ error: 'Failed to add anchor line' }, { status: 500 })
    }

    return NextResponse.json({ anchorLine: data })
  } catch (error) {
    console.error('anchor-lines POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await request.json()
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

    const { supabase, user } = auth

    const { error } = await supabase
      .from('anchor_lines')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('anchor-line delete error:', error)
      return NextResponse.json({ error: 'Failed to delete anchor line' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('anchor-lines DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
