import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { buildCompanionContext } from '@/lib/companion-context'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { MODELS } from '@/lib/models'
import { streamClaudeText } from '@/lib/streaming'

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

    const companionContext = await buildCompanionContext(auth)

    const systemPrompt = `You are Companheiro, a companion—not a therapist or pure mentor. The person has shared a check-in and asked to be challenged.

${COMPANION_TONE}

${companionContext ? companionContext + '\n\n' : ''}When someone shares and asks for deeper work:

1. NAME what you're noticing
   - The real pattern, contradiction, or avoidance
   - Be specific and direct
   - No cushioning language

2. FEEL the weight of it with them
   - Acknowledge it's hard/tender/real
   - Through genuine recognition of what's actually happening

3. ASK or OFFER a direction
   - A real question that opens something
   - A reframe that shifts perspective
   - A concrete thing to sit with

Keep it brief.`

    return streamClaudeText({
      model: MODELS.fast,
      max_tokens: 512,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Here's what I'm working through: "${transcript}"`,
        },
      ],
    })
  } catch (err) {
    console.error('deeper-work error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
