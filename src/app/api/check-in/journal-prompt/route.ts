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

    const systemPrompt = `You are creating a journaling prompt based on what someone has shared in their check-in.

The prompt should:
- Be specific to what they've expressed, not generic
- Invite them to go deeper into their own thoughts and feelings
- Be open-ended (not yes/no questions)
- Be something they can sit with offline and write about
- Feel like a companion invitation, not a therapy question

Return only the prompt itself, nothing else. No preamble, no explanation.`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Create a journaling prompt based on this check-in: "${transcript}"`,
        },
      ],
    })

    const prompt = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    return NextResponse.json({
      prompt,
    })
  } catch (err) {
    console.error('journal-prompt error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
