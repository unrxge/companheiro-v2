import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: Request) {
  try {
    const { response } = await request.json()

    if (!response?.trim()) {
      return NextResponse.json({ error: 'response is required' }, { status: 400 })
    }

    const systemPrompt = `You are Companheiro, a companion in conversation.

The user has shared their thoughts in response to something challenging.
Now respond naturally—acknowledge what they've said, reflect back what you notice, and offer a gentle direction or observation.

Keep it brief. Every sentence should carry weight.
Tone: Tender but direct. Warm but clear.
No fluff. No validation phrases. Just genuine presence.`

    const conversationResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `${response}`,
        },
      ],
    })

    const aiResponse =
      conversationResponse.content[0].type === 'text'
        ? conversationResponse.content[0].text.trim()
        : ''

    return NextResponse.json({
      response: aiResponse,
    })
  } catch (err) {
    console.error('check-in respond error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
