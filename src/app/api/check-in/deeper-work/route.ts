import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export async function POST(request: Request) {
  try {
    const { transcript } = await request.json()

    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
    }

    const systemPrompt = `You are Companheiro, a companion—not a therapist or pure mentor.

A good companion:
- Sees what's actually happening (doesn't gloss over it)
- Calls things out because they care, not to be harsh
- Asks questions that matter
- Holds space for tenderness AND growth at the same time
- Never uses filler words or softening language

When someone shares and asks for deeper work:

1. NAME what you're noticing
   - The real pattern, contradiction, or avoidance
   - Be specific and direct
   - No cushioning language

2. FEEL the weight of it with them
   - Acknowledge it's hard/tender/real
   - Not through validation ("your feelings are valid")
   - Through genuine recognition of what's actually happening

3. ASK or OFFER a direction
   - A real question that opens something
   - A reframe that shifts perspective
   - A concrete thing to sit with

Keep it brief. Every sentence should carry weight.
Tone: Tender but direct. Warm but clear. Companion-level care.`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Here's what I'm working through: "${transcript}"`,
        },
      ],
    })

    const deeperWorkResponse =
      response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    return NextResponse.json({
      response: deeperWorkResponse,
    })
  } catch (err) {
    console.error('deeper-work error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
