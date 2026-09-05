import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'
import { withLanguage } from '@/lib/language'

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { text, context } = await request.json()
    if (!text?.trim()) return NextResponse.json({ error: 'text is required' }, { status: 400 })

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 1024,
      system: withLanguage(`You add punctuation to transcribed speech. Your only job is to insert punctuation marks — commas, periods, question marks, exclamation marks, ellipses, em dashes, colons, semicolons — where they naturally belong.

STRICT RULES:
- Every word in the input must appear in the output, unchanged, in the same order
- You may not add, remove, reorder, or rephrase any word — not even filler words
- Fix obvious capitalisation: first word of a sentence, the word "I"
- You may not add quotation marks unless the speaker is clearly quoting
- Return ONLY the punctuated text — no preamble, no explanation`),
      messages: [
        {
          role: 'user',
          content: context?.trim()
            ? `Previous text (context only — do not include in output): "${context}"\n\nText to punctuate: ${text}`
            : `Text to punctuate: ${text}`,
        },
      ],
    })

    const result =
      response.content[0].type === 'text' ? response.content[0].text.trim() : text

    // Return both keys so old callers (check-in, post-publication) and the
    // new hook (which reads `text`) both work without a separate migration.
    return NextResponse.json({ text: result, punctuated: result })
  } catch (err) {
    console.error('punctuate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
