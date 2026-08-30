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

    const { response, messages, wrapUp } = await request.json()

    if (!wrapUp && !response?.trim()) {
      return NextResponse.json({ error: 'response is required' }, { status: 400 })
    }

    const companionContext = await buildCompanionContext(auth)

    const history: Message[] = Array.isArray(messages)
      ? messages.filter(
          (m: Message) =>
            (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
        )
      : []

    const depth = history.filter((m) => m.role === 'assistant').length

    let responseInstruction: string
    if (wrapUp) {
      responseInstruction = `Offer a brief landing reflection — what seems to have genuinely come into focus through this conversation. Not a summary of what was said, but what it points toward. No question at the end. This is a resting point.`
    } else if (depth >= 4) {
      responseInstruction = `Respond to what they just said. Acknowledge what is shifting and name what is coming into focus. If the conversation has arrived somewhere real, a synthesis or landing is as welcome as another question — not every exchange needs to push further. If something important is still unresolved, one more direction is fine. Keep it brief.`
    } else {
      responseInstruction = `Respond to what they just said. Acknowledge what is shifting, name something specific that is coming into focus, and offer one direction or question that moves a step further than the last exchange. Do not repeat or rephrase what was already said — carry it forward. Keep it brief.`
    }

    const systemPrompt = `You are Companheiro, a companion in an ongoing check-in conversation. Each exchange naturally goes a little deeper than the one before it.

${COMPANION_TONE}

${companionContext ? companionContext + '\n\n' : ''}${responseInstruction}

What you know about this person should quietly shape how you respond — which question you reach for, which angle you take, what you hold back. Let that knowledge inform the reflection without ever stating it directly.`

    const apiMessages = wrapUp
      ? [...history, { role: 'user' as const, content: 'Let\'s land here.' }]
      : [...history, { role: 'user' as const, content: response }]

    return streamClaudeText({
      model: MODELS.fast,
      max_tokens: 512,
      system: systemPrompt,
      messages: apiMessages,
    })
  } catch (err) {
    console.error('check-in respond error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
