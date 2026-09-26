import { NextRequest, NextResponse } from 'next/server'
import { htmlToPlainText } from '@/lib/rich-text'
import { requireUser } from '@/lib/supabase/route'
import { aiGate, pickModel } from '@/lib/billing/fair-use'
import { MODELS } from '@/lib/models'
import { streamClaudeText } from '@/lib/streaming'
import { withLanguage } from '@/lib/language'

// Reimagine: runs the finished draft (flattened, section-unaware) through a
// lens the writer defined themselves in conversation — there's no pre-set
// list, the form is whatever they said it should be.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const gated = await aiGate(auth)
    if (gated) return gated

    const { node_id, lens_description, energy } = await request.json()
    if (!node_id || !lens_description?.trim()) {
      return NextResponse.json({ error: 'Missing node_id/lens_description' }, { status: 400 })
    }

    const { supabase, user } = auth

    const { data: root } = await supabase
      .from('studio_nodes')
      .select('title, body, intent, core_truth')
      .eq('id', node_id)
      .eq('user_id', user.id)
      .single()

    if (!root) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })
    const piece = { ...root, substack_draft: htmlToPlainText(root.body || ''), conviction_statement: root.intent }

    const draft = (piece.substack_draft || '').trim()
    if (!draft) return NextResponse.json({ error: 'No draft to reimagine' }, { status: 400 })

    const systemPrompt = `You are Companheiro, running a finished piece through a creative lens. This is exploration, not correction — you are producing a bold reimagining to surface an unexpected form the writer might not have reached alone.

Hold onto the piece's core truth and the writer's voice, but transform the FORM completely and commit to it fully. Don't hedge, don't half-do it, don't explain what you're doing — just deliver the reimagined piece itself.

THE LENS THEY WANT: ${lens_description.trim()}
${energy ? `The intensity/pace they're after: ${energy}` : ''}

Core truth to preserve: ${piece.core_truth || '(infer it from the draft)'}
${piece.conviction_statement ? `Conviction to preserve: ${piece.conviction_statement}` : ''}

Output only the reimagined piece.`

    return streamClaudeText(auth.user.id, 'write/reimagine', {
      model: pickModel(auth, MODELS.deep),
      max_tokens: 2000,
      system: withLanguage(systemPrompt),
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
