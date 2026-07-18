import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser } from '@/lib/supabase/route'
import { buildCompanionContext } from '@/lib/companion-context'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { MODELS } from '@/lib/models'

interface CoverageItem {
  item: string
  status: 'landed' | 'partial' | 'missing'
  note: string
}

interface TestResponse {
  coverage: CoverageItem[]
  emotional_journey: { verdict: string; drift: string }
  challenge: string[]
  error?: string
}

// The Test mode analysis: reads the FLATTENED draft unbiased (sections are
// ignored here on purpose) against what the writer set out to do.
export async function POST(request: NextRequest): Promise<NextResponse<TestResponse>> {
  const empty: TestResponse = {
    coverage: [],
    emotional_journey: { verdict: '', drift: '' },
    challenge: [],
  }

  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ ...empty, error: 'Unauthorized' }, { status: 401 })

    const { piece_id } = await request.json()
    if (!piece_id) return NextResponse.json({ ...empty, error: 'Missing piece_id' }, { status: 400 })

    const { supabase, user } = auth

    const [{ data: piece }, { data: anchorLines }, companionContext] = await Promise.all([
      supabase
        .from('pieces')
        .select('title, substack_draft, writing_ethos, emotional_journey, conviction_statement, core_truth')
        .eq('id', piece_id)
        .eq('user_id', user.id)
        .single(),
      supabase.from('anchor_lines').select('text').eq('piece_id', piece_id).eq('user_id', user.id),
      buildCompanionContext(auth),
    ])

    if (!piece) return NextResponse.json({ ...empty, error: 'Piece not found' }, { status: 404 })

    const draft = (piece.substack_draft || '').trim()
    if (!draft) {
      return NextResponse.json({
        ...empty,
        emotional_journey: { verdict: 'There is no draft to test yet.', drift: '' },
      })
    }

    const anchorText =
      anchorLines && anchorLines.length > 0
        ? anchorLines.map((l) => `- "${l.text}"`).join('\n')
        : '(none)'

    const systemPrompt = `You are Companheiro, testing a finished draft against what the writer set out to make. Read the draft COLD and unbiased — judge only from the words on the page, not from the intentions.

${COMPANION_TONE}

${companionContext ? companionContext + '\n\n' : ''}Return THREE things as JSON:

1. "coverage": go through what they wanted in this piece — the items in their ETHOS and each of their ANCHOR LINES — and for each, judge from the ACTUAL draft text whether it "landed", "partial", or "missing". Give a short, specific note grounded in the text (quote or point to where). One entry per distinct intended thing.

2. "emotional_journey": read the draft cold. "verdict" = does the intended emotional arc actually land, in your honest read of the text? "drift" = the single clearest place it drifts from that arc, or "" if it holds.

3. "challenge": 2-4 hard questions the finished piece is avoiding, glossing, or where it fell short of what they meant. Tender but direct — the questions that would make it truer.

Return ONLY:
{
  "coverage": [ { "item": "...", "status": "landed"|"partial"|"missing", "note": "..." } ],
  "emotional_journey": { "verdict": "...", "drift": "..." },
  "challenge": [ "...", "..." ]
}`

    const response = await anthropic.messages.create({
      model: MODELS.deep,
      max_tokens: 1600,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: `TITLE: ${piece.title || '(untitled)'}

WHAT THEY SET OUT TO MAKE (ethos): ${piece.writing_ethos || '(not written)'}
CONVICTION: ${piece.conviction_statement || '(none)'}
CORE TRUTH: ${piece.core_truth || '(none)'}
INTENDED EMOTIONAL JOURNEY: ${piece.emotional_journey || '(none)'}

ANCHOR LINES (precious lines they wanted in):
${anchorText}

THE DRAFT:
"""
${draft}
"""

Test it.`,
        },
      ],
    })

    const textContent = response.content.find((b) => b.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json({ ...empty, error: 'Failed to analyze' }, { status: 500 })
    }

    const cleaned = textContent.text.replace(/```json\n?|\n?```/g, '').trim()
    const parsed = JSON.parse(cleaned) as TestResponse

    return NextResponse.json({
      coverage: Array.isArray(parsed.coverage) ? parsed.coverage : [],
      emotional_journey: parsed.emotional_journey || { verdict: '', drift: '' },
      challenge: Array.isArray(parsed.challenge) ? parsed.challenge : [],
    })
  } catch (error) {
    console.error('write test error:', error)
    return NextResponse.json({ ...empty, error: 'Internal server error' }, { status: 500 })
  }
}
