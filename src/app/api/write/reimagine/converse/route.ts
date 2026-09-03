import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { MODELS } from '@/lib/models'
import { streamClaudeText } from '@/lib/streaming'
import { withLanguage } from '@/lib/language'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ConverseRequest {
  piece_id: string
  messages: Message[]
}

// Conversational front door to Reimagine: draws out the writer's own
// instinct for what form the finished piece wants to become, sharpens it
// through a short back-and-forth, then surfaces a <lens>/<energy> pair for
// them to confirm (and tune) before the transformation itself runs.
// Deliberately no pre-set lens list — the whole point is that it can't be
// pre-defined.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ response: '' }, { status: 401 })

    const body: ConverseRequest = await request.json()
    if (!body.piece_id || !Array.isArray(body.messages)) {
      return NextResponse.json({ response: '' }, { status: 400 })
    }

    const { supabase, user } = auth

    const { data: piece } = await supabase
      .from('pieces')
      .select('title, core_truth, conviction_statement, emotional_journey')
      .eq('id', body.piece_id)
      .eq('user_id', user.id)
      .single()

    if (!piece) return NextResponse.json({ response: '' }, { status: 404 })

    const isFirstTurn = body.messages.length === 0

    const systemPrompt = `You are Companheiro, helping a writer discover what form their just-finished piece wants to become — its Creative Lens. This is a moment of play, not analysis: draw out their own instinct for shape, image, or genre, and sharpen it through conversation until it's vivid enough to run with.

${COMPANION_TONE}

THE PIECE (for grounding — it's already written, don't re-litigate it):
Title: ${piece.title || '(untitled)'}
Core truth: ${piece.core_truth || '(not written)'}
Conviction: ${piece.conviction_statement || '(not written)'}
Emotional journey: ${piece.emotional_journey || '(not written)'}

FIRST TURN ONLY: open with one inviting, wonder-sparking question about what form this piece is asking to become — an open invitation, not a menu of options (e.g. "a shape, a scene, a genre that has nothing to do with writing"). Never propose a lens on the first turn.

ONGOING: most good answers only need one exchange — if theirs is already vivid and specific, don't manufacture more rounds. If it's vague or genuinely needs one thing clarified (who's speaking, what shape, what's at stake), ask exactly ONE sharp question — never a checklist.

When their vision is vivid enough to run with, append on its own line:
<lens>a vivid one-to-two sentence distillation of the form/treatment, written as an instruction to reimagine the piece through it</lens>
<energy>one word for the emotional intensity/pace this calls for by default — e.g. hushed, measured, vivid, urgent, thunderous</energy>
Only include these when genuinely earned — never on the first turn, never speculatively.`

    const claudeMessages: Message[] = isFirstTurn
      ? [{ role: 'user', content: 'Open the conversation.' }]
      : body.messages

    return streamClaudeText(
      {
        model: MODELS.deep,
        max_tokens: 600,
        system: withLanguage(systemPrompt),
        messages: claudeMessages,
      },
      (fullText) => {
        const lensMatch = fullText.match(/<lens>([\s\S]*?)<\/lens>/)
        const energyMatch = fullText.match(/<energy>([\s\S]*?)<\/energy>/)
        return {
          lens: lensMatch ? lensMatch[1].trim() : undefined,
          energy: energyMatch ? energyMatch[1].trim().toLowerCase() : undefined,
        }
      }
    )
  } catch (error) {
    console.error('Reimagine converse route error:', error)
    return NextResponse.json({ response: '' }, { status: 500 })
  }
}
