import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'
import { getLens } from '@/lib/lenses'
import { streamClaudeText } from '@/lib/streaming'

// Reimagine: runs the finished draft (flattened, section-unaware) through a
// creative lens to surface an unexpected treatment. Streamed prose.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { piece_id, lens: lensKey } = await request.json()
    if (!piece_id || !lensKey) {
      return NextResponse.json({ error: 'Missing piece_id/lens' }, { status: 400 })
    }

    const lens = getLens(lensKey)
    if (!lens) return NextResponse.json({ error: 'Unknown lens' }, { status: 400 })

    const { supabase, user } = auth

    const { data: piece } = await supabase
      .from('pieces')
      .select('title, substack_draft, conviction_statement, core_truth')
      .eq('id', piece_id)
      .eq('user_id', user.id)
      .single()

    if (!piece) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })

    const draft = (piece.substack_draft || '').trim()
    if (!draft) return NextResponse.json({ error: 'No draft to reimagine' }, { status: 400 })

    const systemPrompt = `You are Companheiro, running a finished piece through a creative lens. This is exploration, not correction — you are producing a bold reimagining to surface an unexpected form the writer might not have reached alone.

Hold onto the piece's core truth and the writer's voice, but transform the FORM completely and commit to it fully. Don't hedge, don't half-do it, don't explain what you're doing — just deliver the reimagined piece itself.

THE LENS: ${lens.label} — ${lens.instruction}

Core truth to preserve: ${piece.core_truth || '(infer it from the draft)'}
${piece.conviction_statement ? `Conviction to preserve: ${piece.conviction_statement}` : ''}

Output only the reimagined piece.`

    return streamClaudeText({
      model: MODELS.deep,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Title: ${piece.title || '(untitled)'}\n\nTHE DRAFT:\n"""\n${draft}\n"""\n\nReimagine it through the lens.`,
        },
      ],
    })
  } catch (error) {
    console.error('reimagine error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
