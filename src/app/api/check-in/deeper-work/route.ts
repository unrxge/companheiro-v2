import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { buildCompanionContext } from '@/lib/companion-context'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { MODELS } from '@/lib/models'
import { streamClaudeText } from '@/lib/streaming'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messages } = await request.json()

    const history: Message[] = Array.isArray(messages)
      ? messages.filter(
          (m: Message) =>
            (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
        )
      : []

    if (history.length === 0) {
      return NextResponse.json({ error: 'messages is required' }, { status: 400 })
    }

    const companionContext = await buildCompanionContext(auth)

    const systemPrompt = `You are Companheiro, a companion in an ongoing check-in conversation. You already reflected once on what they shared, below — they are now asking to be challenged and pushed deeper into it, not to hear that same reflection again.

${COMPANION_TONE}

${companionContext ? companionContext + '\n\n' : ''}Building on everything already said in this conversation — do not repeat, rephrase, or re-summarize what you already reflected back:

1. NAME what is underneath the surface of what has been shared so far
   - The real pattern, contradiction, or avoidance — something not already named
   - Be specific and direct, no cushioning language

2. FEEL the weight of it with them
   - Acknowledge it is hard, tender, or real, through genuine recognition, not restating

3. ASK or OFFER a direction
   - A real question that opens something new
   - A reframe that shifts perspective
   - A concrete thing to sit with

Keep it brief.`

    return streamClaudeText({
      model: MODELS.fast,
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        ...history,
        {
          role: 'user',
          content: 'Challenge me on this. Push past what you already reflected back and go deeper into what is actually underneath it.',
        },
      ],
    })
  } catch (err) {
    console.error('deeper-work error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
