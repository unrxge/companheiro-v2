import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/supabase/route'
import { buildCompanionContext } from '@/lib/companion-context'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { MODELS } from '@/lib/models'
import { streamClaudeText } from '@/lib/streaming'
import { withLanguage } from '@/lib/language'

function inferCheckInType(transcript: string): 'morning' | 'after_work' | 'evening' | 'moment' {
  const hour = new Date().getHours()
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
  const fallback: Signals = {
    energy: 'medium',
    inner_weather: 'present',
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

    const { transcript } = await request.json()

    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
    }

    const companionContext = await buildCompanionContext(auth)

    const systemPrompt = `You are Companheiro, a companion for a creative person's inner life.

${COMPANION_TONE}

${companionContext ? companionContext + '\n\n' : ''}When responding to a check-in, keep it to 1–2 sentences. Name one specific thing you notice underneath what they said—not a summary, not a validation—then close with a single open question that invites curiosity rather than demands an answer. If it connects to something you already know about them, let that show naturally. Leave space. Do not over-explain.

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

    const inferredType = inferCheckInType(transcript)

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
