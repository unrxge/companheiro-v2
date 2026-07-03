import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { transcript } = await request.json()

    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
    }

    const systemPrompt = `You are creating a journaling prompt—a companion invitation for someone to sit with their own experience.

The prompt should:
- Be specific to what they've actually expressed, not generic
- Name the real thing underneath (the contradiction, the weight, the tender place)
- Invite them to go deeper without softening or explaining
- Be open-ended and something they can sit with offline
- Feel like a companion asking a real question, not a therapy prompt
- Use direct, clear language with no filler

Return ONLY the prompt itself. No preamble, no explanation. One sentence or a brief question.`

    const response = await anthropic.messages.create({
      model: MODELS.fast,
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
