import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { requireUser, AuthedContext } from '@/lib/supabase/route'
import { MODELS } from '@/lib/models'
import { withLanguage } from '@/lib/language'
import { logUsage } from '@/lib/usage-log'

// Discerns whether the user's brought text is a full draft or loose fragments,
// then either distributes the draft across the emotional-journey sections
// or creates anchor lines from the individual sentences.
//
// Full draft: ≥100 words OR ≥2 non-trivial paragraphs
// Loose text: everything else (notes, sentence fragments, scattered lines)

function isFullDraft(text: string): boolean {
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0).length
  const paragraphs = text
    .trim()
    .split(/\n\n+/)
    .filter((p) => p.trim().split(/\s+/).length >= 8).length
  return words >= 100 || paragraphs >= 2
}

// Extract individual sentences/phrases from loose text.
function extractLines(text: string): string[] {
  return text
    .split(/[\n.!?]+/)
    .map((s) => s.trim().replace(/^[-–—•*]\s*/, ''))
    .filter((s) => s.length > 2 && s.split(/\s+/).length >= 2)
}

// Seed empty sections from the piece's emotional journey using the same
// Claude call as /api/write/sections/seed, minus the legacy-draft placement.
async function seedSections(
  supabase: AuthedContext['supabase'],
  userId: string,
  pieceId: string,
  piece: { title: string | null; emotional_journey: string | null; conviction_statement: string | null; core_truth: string | null }
) {
  // Same extraction job as write/sections/seed — a short skeleton from a
  // journey the writer already confirmed, no craft judgement involved.
  const response = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 900,
    system: withLanguage(`You are Companheiro, turning a piece's intended emotional journey into a section skeleton the writer will draft into.

Break the emotional journey into an ordered set of 3-6 sections. Each section is a beat of the piece with:
- "label": a short, evocative name for the beat (2-4 words)
- "intended_emotion": the single feeling this beat should carry (one or two words)

Follow the emotional journey's actual shape. Do not invent an arc it doesn't have.

Return ONLY JSON: { "sections": [ { "label": "...", "intended_emotion": "..." }, ... ] }`),
    messages: [
      {
        role: 'user',
        content: `Title: ${piece.title || '(untitled)'}
Conviction: ${piece.conviction_statement || '(none)'}
Core truth: ${piece.core_truth || '(none)'}
Emotional journey: ${piece.emotional_journey || '(not defined — infer an honest progression)'}`,
      },
    ],
  })

  logUsage('write/sections/ingest:seed', response.model, response.usage)

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Failed to generate section skeleton')

  const cleaned = textBlock.text.replace(/```json\n?|\n?```/g, '').trim()
  const parsed = JSON.parse(cleaned) as { sections?: Array<{ label?: string; intended_emotion?: string }> }
  const beats = (parsed.sections || []).slice(0, 6)
  if (beats.length === 0) throw new Error('No sections generated')

  const rows = beats.map((b, i) => ({
    user_id: userId,
    piece_id: pieceId,
    position: i,
    label: b.label || `Section ${i + 1}`,
    intended_emotion: b.intended_emotion || null,
    content: '',
  }))

  const { data: inserted, error } = await supabase
    .from('piece_sections')
    .insert(rows)
    .select('id, position, label, intended_emotion, content, is_locked')

  if (error || !inserted) throw new Error('Failed to insert sections')
  return inserted as Array<{ id: string; position: number; label: string; intended_emotion: string | null; content: string; is_locked: boolean }>
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { supabase, user } = auth

    const { piece_id } = await req.json()
    if (!piece_id) return NextResponse.json({ error: 'Missing piece_id' }, { status: 400 })

    const { data: piece } = await supabase
      .from('pieces')
      .select('title, substack_draft, emotional_journey, conviction_statement, core_truth')
      .eq('id', piece_id)
      .eq('user_id', user.id)
      .single()

    if (!piece) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })

    const draft = (piece.substack_draft || '').trim()
    if (!draft) return NextResponse.json({ error: 'No draft to ingest' }, { status: 400 })

    // Load or seed sections
    const { data: existing } = await supabase
      .from('piece_sections')
      .select('id, position, label, intended_emotion, content, is_locked')
      .eq('piece_id', piece_id)
      .eq('user_id', user.id)
      .order('position', { ascending: true })

    let sections = (existing || []) as Array<{ id: string; position: number; label: string; intended_emotion: string | null; content: string; is_locked: boolean }>

    if (sections.length === 0) {
      sections = await seedSections(supabase, user.id, piece_id, piece)
    }

    // ── Discern ─────────────────────────────────────────────────────────────

    if (isFullDraft(draft)) {
      // Full draft path — distribute prose across emotional-journey sections.
      // The model is only ever asked WHICH SECTION each paragraph belongs
      // to (by number), never to retype the draft — every paragraph that
      // lands in the database is the writer's own original substring, never
      // a model-echoed copy of it. Output shrinks from a full retyped draft
      // (thousands of tokens) to a small id-per-paragraph map.
      const sectionList = sections
        .map((s) => `id: ${s.id} | "${s.label}" (emotion: ${s.intended_emotion || 'n/a'})`)
        .join('\n')

      const paragraphs: string[] = (draft as string)
        .split(/\n{2,}/)
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0)

      const distResponse = await anthropic.messages.create({
        model: MODELS.fast,
        max_tokens: 500,
        system: withLanguage(`You place a writer's existing paragraphs into the emotional journey sections of their piece. The writer's words are sacred — you are only choosing WHICH SECTION each paragraph belongs to, never rewriting, summarising, or reordering anything.

Rules:
- Assign each numbered paragraph to the section id whose emotional beat it most closely serves.
- A section may receive multiple paragraphs, or none at all.
- If a paragraph genuinely fits no section well, assign it to the emotionally closest one.
- Every paragraph number must appear exactly once.

Return ONLY JSON: { "placements": { "0": "section_id", "1": "section_id", ... } }`),
        messages: [
          {
            role: 'user',
            content: `Sections (in reading order):
${sectionList}

Paragraphs to place (each may be truncated for length — place by its gist, not its full wording):
${paragraphs.map((p: string, i: number) => `${i}: "${p.length > 300 ? p.slice(0, 300) + '…' : p}"`).join('\n')}`,
          },
        ],
      })

      logUsage('write/sections/ingest:distribute', distResponse.model, distResponse.usage)

      const distBlock = distResponse.content.find((b) => b.type === 'text')
      if (!distBlock || distBlock.type !== 'text') {
        return NextResponse.json({ error: 'Failed to distribute draft' }, { status: 500 })
      }

      const distCleaned = distBlock.text.replace(/```json\n?|\n?```/g, '').trim()
      const distParsed = JSON.parse(distCleaned) as { placements?: Record<string, string> }
      const placements = distParsed.placements || {}

      // Group paragraphs by assigned section, in original order — only the
      // model's OWN section-index choices are used, never its text, so this
      // reconstructs each section from verbatim, untouched original prose.
      const validIds = new Set(sections.map((s) => s.id))
      const bySection = new Map<string, string[]>()
      paragraphs.forEach((p: string, i: number) => {
        const placed = placements[String(i)]
        const target = placed && validIds.has(placed) ? placed : sections[0]?.id
        if (!target) return
        const list = bySection.get(target) || []
        list.push(p)
        bySection.set(target, list)
      })

      const finalSections = await Promise.all(
        sections.map(async (s) => {
          const assignedParagraphs = bySection.get(s.id)
          const newContent = assignedParagraphs ? assignedParagraphs.join('\n\n') : s.content
          if (newContent !== s.content) {
            await supabase
              .from('piece_sections')
              .update({ content: newContent })
              .eq('id', s.id)
              .eq('user_id', user.id)
          }
          return { ...s, content: newContent }
        })
      )

      return NextResponse.json({ type: 'draft', sections: finalSections })
    } else {
      // Loose text path — extract sentences and create anchor lines.
      const lines = extractLines(draft)
      if (lines.length === 0) {
        return NextResponse.json({ type: 'loose', sections, anchorLines: [] })
      }

      // Single batch placement call for all lines
      let placements: Record<string, string> = {}
      if (sections.length > 0) {
        try {
          const placeResponse = await anthropic.messages.create({
            model: MODELS.fast,
            max_tokens: 400,
            system: `Map each numbered line to the section id that best fits it emotionally. Return ONLY JSON: { "placements": { "0": "section_id", "1": "section_id", ... } }`,
            messages: [
              {
                role: 'user',
                content: `Lines:
${lines.map((l, i) => `${i}: "${l}"`).join('\n')}

Sections:
${sections.map((s) => `id: ${s.id} | "${s.label}" (emotion: ${s.intended_emotion || 'n/a'})`).join('\n')}`,
              },
            ],
          })
          logUsage('write/sections/ingest:place-lines', placeResponse.model, placeResponse.usage)
          const placeBlock = placeResponse.content.find((b) => b.type === 'text')
          if (placeBlock && placeBlock.type === 'text') {
            const placeCleaned = placeBlock.text.replace(/```json\n?|\n?```/g, '').trim()
            const placeParsed = JSON.parse(placeCleaned) as { placements?: Record<string, string> }
            placements = placeParsed.placements || {}
          }
        } catch {
          // placement is best-effort; fall through to unplaced
        }
      }

      // Insert all anchor lines
      const anchorRows = lines.map((line, i) => {
        const sectionId = placements[String(i)] || null
        const matchedSection = sectionId ? sections.find((s) => s.id === sectionId) : null
        return {
          user_id: user.id,
          piece_id,
          section_id: matchedSection ? matchedSection.id : null,
          text: line,
        }
      })

      const { data: insertedLines } = await supabase
        .from('anchor_lines')
        .insert(anchorRows)
        .select('id, section_id, text')

      return NextResponse.json({ type: 'loose', sections, anchorLines: insertedLines || [] })
    }
  } catch (err) {
    console.error('ingest error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
