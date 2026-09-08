import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { buildCompanionContext } from '@/lib/companion-context'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { MODELS } from '@/lib/models'
import { streamClaudeText } from '@/lib/streaming'
import { withLanguage } from '@/lib/language'

// `localHour` is the person's own clock (sent by the client). The server runs
// in UTC on Vercel, so its hour would be wrong for almost everyone.
function inferCheckInType(transcript: string, localHour: number): 'morning' | 'after_work' | 'evening' | 'moment' {
  const hour = localHour
  const lower = transcript.toLowerCase()

  if (lower.includes('dream') || lower.includes('woke') || lower.includes('slept') || hour < 11) {
    return 'morning'
  }
  if (lower.includes('just finished work') || lower.includes('leaving the office') || (hour >= 16 && hour < 18)) {
    return 'after_work'
  }
  if (hour >= 20 || lower.includes('tonight') || lower.includes('end of the day')) {
    return 'evening'
  }
  return 'moment'
}

interface Signals {
  energy: 'low' | 'medium' | 'high'
  inner_weather: string
  creative_readiness: boolean
  arc_texture: 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration'
}

function parseSignals(fullText: string): Signals {
  // Reached when the model omits or malforms the <signals> block. This gets
  // written into the permanent emotional record, so the weather word says it
  // is unread rather than inventing a plausible-sounding one.
  const fallback: Signals = {
    energy: 'medium',
    inner_weather: 'unclear',
    creative_readiness: false,
    arc_texture: 'Expansion',
  }

  const match = fullText.match(/<signals>([\s\S]*?)<\/signals>/)
  if (!match) return fallback

  try {
    const parsed = JSON.parse(match[1].trim())
    return {
      energy: parsed.energy ?? fallback.energy,
      inner_weather: parsed.inner_weather ?? fallback.inner_weather,
      creative_readiness: parsed.creative_readiness ?? fallback.creative_readiness,
      arc_texture: parsed.arc_texture ?? fallback.arc_texture,
    }
  } catch {
    return fallback
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { transcript, local_hour } = await request.json()
    const localHour =
      typeof local_hour === 'number' && local_hour >= 0 && local_hour <= 23 ? local_hour : new Date().getHours()

    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
    }

    const companionContext = await buildCompanionContext(auth)

    const systemPrompt = `You are Companheiro, a companion for a creative person's inner life.

${COMPANION_TONE}

${companionContext ? companionContext + '\n\n' : ''}When responding to a check-in, keep it to 2–3 sentences.

They have just disclosed something, and this is the first thing they hear back. Read what state they are actually in — depleted, ashamed, avoiding, steady, genuinely alright — and let that decide the shape of the reply:

- If saying it cost them something, or they are at the end of their capacity: meet that first, specifically and in your own words. Do not interpret them on this turn. A question that hands control back is enough. An interpretation delivered to someone mid-disclosure lands as exposure, not insight.
- If they are circling, minimising, or justifying: name the specific move — the sentence, the word, the thing left out — not their character. This is where you do not let it slide.
- If they have genuinely done the work, or are simply alright: say so and stop. Do not manufacture a shadow underneath a good week. "Nothing underneath this one" is a real and correct reply.
- Otherwise: name one specific thing you notice underneath what they said — not a summary, not a restatement — and close with a single open question that invites curiosity rather than demands an answer.

If what they wrote is too thin to read honestly, ask rather than invent. If it connects to something you already know about them, let that show naturally. Leave space. Do not over-explain.

Then extract four signals from the check-in as a JSON block at the very end of your response, in this exact format:
<signals>
{
  "energy": "low" | "medium" | "high",
  "inner_weather": "<short evocative descriptor, e.g. 'foggy but clearing', 'steady', 'stormy'>",
  "creative_readiness": true | false,
  "arc_texture": "Breakaway" | "Beginning" | "Expansion" | "Integration"
}
</signals>

Arc texture guide:
- Breakaway: restless, wanting to escape, resistant to structure
- Beginning: fresh energy, openness, new curiosity
- Expansion: building momentum, going deeper, multiplying ideas
- Integration: consolidating, reflecting, letting things settle`

    const inferredType = inferCheckInType(transcript, localHour)

    return streamClaudeText(
      {
        model: MODELS.fast,
        max_tokens: 512,
        system: withLanguage(systemPrompt),
        messages: [
          {
            role: 'user',
            content: `Here is my check-in: "${transcript}"`,
          },
        ],
      },
      (fullText) => ({
        signals: parseSignals(fullText),
        inferredType,
      })
    )
  } catch (err) {
    console.error('check-in process error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
