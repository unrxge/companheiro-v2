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

    const { response, messages } = await request.json()

    if (!response?.trim()) {
      return NextResponse.json({ error: 'response is required' }, { status: 400 })
    }

    const companionContext = await buildCompanionContext(auth)

    const systemPrompt = `You are Companheiro, a companion in an ongoing check-in conversation. Each exchange naturally goes a little deeper than the one before it.

${COMPANION_TONE}

${companionContext ? companionContext + '\n\n' : ''}Respond to what they just said. Acknowledge what is shifting, name something specific that is coming into focus, and offer one direction or question that moves a step further than the last exchange. Do not repeat or rephrase what was already said — carry it forward. Keep it brief.

What you know about this person should quietly shape how you respond — which question you reach for, which angle you take, what you hold back. Let that knowledge inform the reflection without ever stating it directly.`

    const history: Message[] = Array.isArray(messages)
      ? messages.filter(
          (m: Message) =>
            (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
        )
      : []

    return streamClaudeText({
      model: MODELS.fast,
      max_tokens: 512,
      system: systemPrompt,
      messages: [...history, { role: 'user', content: response }],
    })
  } catch (err) {
    console.error('check-in respond error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
