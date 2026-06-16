import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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

export async function POST(request: Request) {
try {
    const { transcript } = await request.json()

    if (!transcript?.trim()) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 })
    }

    const systemPrompt = `You are Companheiro, a companion for a creative person's inner life.

Your response style:
- See what's actually happening (don't gloss over it)
- Call things out because you care, not to be harsh
- Hold space for tenderness AND growth at the same time
- Never use filler words or softening language
- Every sentence should carry weight

When responding to a check-in (2–4 sentences):
1. NAME what you're noticing—the real thing underneath what they said
2. ACKNOWLEDGE the weight of it with genuine recognition (not "your feelings are valid")
3. Ask a real question OR offer a direction that opens something

Then extract four signals from the check-in as a JSON block at the end of your response, in this exact format:
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
- Integration: consolidating, reflecting, letting things settle

First clean and punctuate the raw transcript naturally before responding to it.`

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `Here is my check-in (raw voice transcript): "${transcript}"`,
        },
      ],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

    // Split response from signals block
    const signalsMatch = rawText.match(/<signals>([\s\S]*?)<\/signals>/)
    const aiResponse = rawText.replace(/<signals>[\s\S]*?<\/signals>/, '').trim()

    let signals = {
      energy: 'medium' as 'low' | 'medium' | 'high',
      inner_weather: 'present',
      creative_readiness: false,
      arc_texture: 'Expansion' as 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration',
    }

    if (signalsMatch) {
      try {
        const parsed = JSON.parse(signalsMatch[1].trim())
        signals = {
          energy: parsed.energy ?? signals.energy,
          inner_weather: parsed.inner_weather ?? signals.inner_weather,
          creative_readiness: parsed.creative_readiness ?? signals.creative_readiness,
          arc_texture: parsed.arc_texture ?? signals.arc_texture,
        }
      } catch {
        // keep defaults if parsing fails
      }
    }

    const inferredType = inferCheckInType(transcript)

    // Punctuate/clean transcript via a quick second pass
    const cleanResponse = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `Clean up this voice transcript with proper punctuation and capitalization. Return only the cleaned text, nothing else: "${transcript}"`,
        },
      ],
    })

    const cleanedTranscript =
      cleanResponse.content[0].type === 'text'
        ? cleanResponse.content[0].text.trim()
        : transcript

    return NextResponse.json({
      aiResponse,
      signals,
      inferredType,
      cleanedTranscript,
    })
  } catch (err) {
    console.error('check-in process error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
