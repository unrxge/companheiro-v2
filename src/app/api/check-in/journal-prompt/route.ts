import { NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { buildCompanionContext } from '@/lib/companion-context'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { MODELS } from '@/lib/models'
import { withLanguage } from '@/lib/language'

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { raw_entry, full_conversation } = await request.json()
    const material = (full_conversation?.trim() || raw_entry?.trim()) as string | undefined

    if (!material) {
      return NextResponse.json({ error: 'raw_entry or full_conversation is required' }, { status: 400 })
    }

    // Worth the tokens here specifically: this generates a question, and the
    // portrait is where what-kind-of-question-actually-reaches-them lives.
    // It is also a once-per-check-in call the person opts into, not a
    // per-turn cost.
    const companionContext = await buildCompanionContext(auth)

    const systemPrompt = `You are Companheiro, creating a journaling prompt — a companion invitation for someone to fully immerse themselves in what they've just explored, meant to guide them in navigating it.

${COMPANION_TONE}

${companionContext ? companionContext + '\n\n' : ''}

You're given the whole exchange: the opening check-in AND, when present, the back-and-forth that followed. Use all of it. The real material is often what surfaced later in the conversation, not the opening entry alone — if something truer emerged as it went on, build the prompt from that, don't default back to the surface version.

The prompt should:
- Fully encompass what's actually been shared and uncovered across the whole exchange, not just the opening entry
- Be specific to what they've actually expressed, not generic
- Name the real thing underneath — the contradiction, the weight, the tender place the conversation actually arrived at
- Serve as a guide for navigating what they're going through, something they can immerse themselves in
- Invite them to go deeper without cushioning or over-explaining — an invitation they can refuse, not a verdict on them
- Be open-ended and something they can sit with offline
- Feel like a companion asking a real question, not a therapy prompt
- Use direct, clear language with no filler

Return ONLY the prompt itself. No preamble, no explanation. Brief — one to three sentences, never more. Every sentence must earn its place.`

    const response = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 300,
      system: withLanguage(systemPrompt),
      messages: [
        {
          role: 'user',
          content: `Create a journaling prompt from this check-in:\n\n${material}`,
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
