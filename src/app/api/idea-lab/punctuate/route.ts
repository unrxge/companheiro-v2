import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { MODELS } from '@/lib/models'

// Adds real punctuation to a raw speech-recognition segment.
// Called once per finalized segment during dictation in the "bring an idea" panel.
export async function POST(req: NextRequest) {
  try {
    const { text, context } = await req.json() as { text: string; context?: string }
    if (!text?.trim()) return NextResponse.json({ text: '' })

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 256,
      system: `You add punctuation to transcribed speech segments. Rules:
- Add commas, periods, question marks, exclamation marks, ellipses, em dashes, colons, semicolons wherever they naturally belong
- Capitalise the first word if the segment starts a new sentence
- Do NOT change, add, or remove any words
- Do NOT add quotation marks unless quoting is obvious
- Return ONLY the punctuated text — no explanation, no surrounding quotes`,
      messages: [
        {
          role: 'user',
          content: context?.trim()
            ? `Previous text (for context only): "${context}"\n\nSegment to punctuate: ${text}`
            : `Segment to punctuate: ${text}`,
        },
      ],
    })

    const block = response.content.find((b) => b.type === 'text')
    const punctuated = block?.type === 'text' ? block.text.trim() : text
    return NextResponse.json({ text: punctuated })
  } catch (err) {
    console.error('punctuate error:', err)
    // Fall back to raw text on error so nothing is lost
    return NextResponse.json({ text: '' }, { status: 500 })
  }
}
