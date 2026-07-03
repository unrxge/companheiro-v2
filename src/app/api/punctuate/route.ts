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

    const { text } = await request.json()

    if (!text?.trim()) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 1024,
      system: `You are a punctuation assistant. Your task is to add proper punctuation and sentence structure to raw voice transcription.

Rules:
- Add punctuation only (periods, commas, question marks, exclamation marks, apostrophes)
- Capitalize the first letter of sentences
- Fix obvious capitalization (names, "I")
- Do NOT rewrite, rephrase, or change word order
- Preserve the speaker's voice, tone, and phrasing exactly
- Do NOT add or remove any words
- Return ONLY the punctuated text, nothing else`,
      messages: [
        {
          role: 'user',
          content: `Add punctuation to this voice transcript:\n\n${text}`,
        },
      ],
    })

    const punctuatedText =
      response.content[0].type === 'text' ? response.content[0].text.trim() : text

    return NextResponse.json({
      punctuated: punctuatedText,
    })
  } catch (err) {
    console.error('punctuate error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
