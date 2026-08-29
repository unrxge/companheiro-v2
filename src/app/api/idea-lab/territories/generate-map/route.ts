import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'

interface GenerateMapResponse {
  rangeMap: string
  facetSeeds: string[]
}

const SYSTEM = `You are writing a creative territory definition for an Idea Lab — a tool that helps writers find unexpected, dreamy, expansive entry points into a theme.

You will be given a theme label. Generate two things:

RANGE MAP — A rich description of the territory written to give a prompt-generating system room to roam. The spirit: universal over confessional (anyone can enter regardless of personal history), expansive and curious, specific and strange rather than generic. Never describe the obvious centre — find the full span including the unexpected edges.

Structure it exactly as follows (no headings, just flowing text):
- First: one or two sentences naming what this territory is really about at its fullest span — not just the surface
- Then "Contains:" followed by at least 8 specific things this territory holds — particular observations, experiences, questions, moments, tensions — comma-separated
- Then "Its lighter end:" — the expansive, forward-facing corner where possibility lives, what opens up when this territory is at its most alive
- Then "Its heavier end:" — the honest, unflinching corner where something real and unresolved lives; not bleak, but weighted

FACET SEEDS — Exactly 15 specific entry points that force a writer into different corners of this territory. Each seed is a tight phrase: a specific angle, observation, or question that names something precise and unexpected within the territory. They must cover both lighter and heavier ends. Written in the style: "the [specific thing] — [the angle or what it reveals]". Never restate the territory name obviously. Always find the edge, not the centre.

Return only valid JSON in this exact shape:
{
  "rangeMap": "...",
  "facetSeeds": ["...", "...", "...", "...", "...", "...", "...", "...", "...", "...", "...", "...", "...", "...", "..."]
}`

export async function POST(request: NextRequest): Promise<NextResponse<GenerateMapResponse | { error: string }>> {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { label }: { label: string } = await request.json()
    if (!label || typeof label !== 'string' || label.trim().length < 2) {
      return NextResponse.json({ error: 'Invalid label' }, { status: 400 })
    }

    const response = await anthropic.messages.create({
      model: MODELS.deep,
      max_tokens: 1200,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `Generate a range map and facet seeds for the territory: "${label.trim()}"`,
      }],
    })

    const text = response.content.find((b) => b.type === 'text')?.text ?? ''

    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()

    let parsed: GenerateMapResponse
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      console.error('Failed to parse generate-map response:', cleaned)
      return NextResponse.json({ error: 'Failed to parse' }, { status: 500 })
    }

    if (
      typeof parsed.rangeMap !== 'string' ||
      !Array.isArray(parsed.facetSeeds) ||
      parsed.facetSeeds.length === 0
    ) {
      return NextResponse.json({ error: 'Invalid response shape' }, { status: 500 })
    }

    return NextResponse.json({
      rangeMap: parsed.rangeMap,
      facetSeeds: parsed.facetSeeds.slice(0, 15),
    })
  } catch (error) {
    console.error('generate-map error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
