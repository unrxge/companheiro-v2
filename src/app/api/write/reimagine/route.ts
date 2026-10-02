import { NextRequest, NextResponse } from 'next/server'
import { ensureHtml, htmlToPlainText } from '@/lib/rich-text'
import { requireUser, type AuthedContext } from '@/lib/supabase/route'
import { aiGate, pickModel } from '@/lib/billing/fair-use'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { MODELS } from '@/lib/models'
import { streamClaudeText } from '@/lib/streaming'
import { withLanguage } from '@/lib/language'
import { nodeGate } from "@/lib/studio/plan-access";

// Reimagine: the whole piece, whole sections, or runs of paragraphs, rewritten
// through a lens the writer found in conversation. Each chosen passage gets
// its own take, streamed as <take key="…">…</take>, so the page can set every
// take beside the words it would replace and the writer decides, passage by
// passage, whether to use it, ask for another, or borrow from it by hand.

interface Part {
  id: string
  title: string
  beat: string
  body: string
  is_locked: boolean
}

interface NodeRow {
  id: string
  parent_id: string | null
  position: number
  title: string | null
  beat: string | null
  body: string | null
  is_locked: boolean | null
}

/** The piece's writing in reading order: its leaves, depth first. A piece
 *  that was never divided is its own single leaf. */
async function loadParts(auth: AuthedContext, rootId: string, projectId: string): Promise<Part[]> {
  const { data } = await auth.supabase
    .from('studio_nodes')
    .select('id, parent_id, position, title, beat, body, is_locked')
    .eq('project_id', projectId)
    .eq('user_id', auth.user.id)
  const rows = (data as NodeRow[] | null) ?? []
  const children = new Map<string, NodeRow[]>()
  for (const r of rows) {
    if (!r.parent_id) continue
    const list = children.get(r.parent_id) ?? []
    list.push(r)
    children.set(r.parent_id, list)
  }
  const out: Part[] = []
  const walk = (node: NodeRow, depth: number) => {
    const kids = (children.get(node.id) ?? []).sort((a, b) => a.position - b.position)
    if (kids.length === 0 || depth > 8) {
      out.push({
        id: node.id,
        title: node.title || '',
        beat: node.beat || '',
        body: ensureHtml(node.body || ''),
        is_locked: !!node.is_locked,
      })
      return
    }
    for (const k of kids) walk(k, depth + 1)
  }
  const root = rows.find((r) => r.id === rootId)
  if (root) walk(root, 0)
  return out
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const nodeId = request.nextUrl.searchParams.get('node_id')
    if (!nodeId) return NextResponse.json({ error: 'Missing node_id' }, { status: 400 })

    const { data: root } = await auth.supabase
      .from('studio_nodes')
      .select('id, project_id, title')
      .eq('id', nodeId)
      .eq('user_id', auth.user.id)
      .single()
    if (!root) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })

    const parts = await loadParts(auth, root.id, root.project_id)
    return NextResponse.json({ title: root.title || '', project_id: root.project_id, parts })
  } catch (error) {
    console.error('reimagine GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

interface TargetIn {
  key: string
  part_id: string
  /** 'part' = the whole section; 'passage' = one or more consecutive paragraphs inside it. */
  kind: 'part' | 'passage'
  text: string
  before?: string
  after?: string
  /** Takes already shown for this passage, so a new one goes somewhere else. */
  avoid?: string[]
  /** The writer's steer for this take, if they gave one. */
  note?: string
}

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : '')

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUser()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const gated = await aiGate(auth)
    if (gated) return gated

    const body = await request.json()
    const nodeId: string | undefined = body?.node_id
    const lens = clip(body?.lens, 1200).trim()
    const energy = clip(body?.energy, 40).trim()
    const rawTargets: unknown[] = Array.isArray(body?.targets) ? body.targets.slice(0, 40) : []
    if (!nodeId || !lens || rawTargets.length === 0) {
      return NextResponse.json({ error: 'Missing node_id, lens or targets' }, { status: 400 })
    }
    const notActive = await nodeGate(auth, nodeId)
    if (notActive) return notActive

    const targets: TargetIn[] = rawTargets
      .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
      .map((t): TargetIn => ({
        key: clip(t.key, 80).replace(/"/g, ''),
        part_id: clip(t.part_id, 80),
        kind: t.kind === 'passage' ? 'passage' : 'part',
        text: clip(t.text, 30000).trim(),
        before: clip(t.before, 1200).trim(),
        after: clip(t.after, 1200).trim(),
        avoid: Array.isArray(t.avoid) ? t.avoid.slice(-3).map((a) => clip(a, 4000)).filter(Boolean) : [],
        note: clip(t.note, 400).trim(),
      }))
      .filter((t) => t.key && t.text)
    if (targets.length === 0) return NextResponse.json({ error: 'Nothing to reimagine' }, { status: 400 })

    const { supabase, user } = auth
    const { data: root } = await supabase
      .from('studio_nodes')
      .select('id, project_id, title, intent, core_truth, emotional_journey, substack_goals')
      .eq('id', nodeId)
      .eq('user_id', user.id)
      .single()
    if (!root) return NextResponse.json({ error: 'Piece not found' }, { status: 404 })

    const parts = await loadParts(auth, root.id, root.project_id)
    const partById = new Map(parts.map((p) => [p.id, p]))
    const labelFor = (p: Part | undefined, i: number) => p?.title?.trim() || `Section ${i + 1}`

    const wholePiece = parts
      .map((p, i) => `[${labelFor(p, i)}]${p.beat ? ` (its beat: ${p.beat})` : ''}\n${htmlToPlainText(p.body) || '(not written yet)'}`)
      .join('\n\n')

    const targetBlocks = targets
      .map((t) => {
        const idx = parts.findIndex((p) => p.id === t.part_id)
        const part = partById.get(t.part_id)
        const lines = [
          `<passage key="${t.key}">`,
          `Where: ${t.kind === 'part' ? `the whole of [${labelFor(part, idx)}]` : `inside [${labelFor(part, idx)}]`}${part?.beat ? ` — this section's beat: ${part.beat}` : ''}`,
          t.before ? `Just before it (context, not to be rewritten): """${t.before}"""` : null,
          `The passage to reimagine:\n"""\n${t.text}\n"""`,
          t.after ? `Just after it (context, not to be rewritten): """${t.after}"""` : null,
          t.avoid && t.avoid.length
            ? `Takes they have already seen for this passage — go somewhere noticeably different, not a light variation:\n${t.avoid.map((a, i) => `(${i + 1}) """${a}"""`).join('\n')}`
            : null,
          t.note ? `Their steer for this take: ${t.note}` : null,
          `</passage>`,
        ]
        return lines.filter(Boolean).join('\n')
      })
      .join('\n\n')

    const systemPrompt = `You are Companheiro, reimagining a writer's work through a lens they chose. This is exploration, not correction: each take shows them a form they might not have reached alone, and they decide what to do with it — use it as it is, ask for another, or borrow a line and rework it themselves.

${COMPANION_TONE}

THE LENS: ${lens}
${energy ? `Intensity / pace: ${energy}` : ''}

THE CORE CONCEPT — the take changes the form, never what the piece is for:
Conviction: ${root.intent || '(not written)'}
Core truth: ${root.core_truth || '(infer it from the draft)'}
Emotional journey:
${root.emotional_journey || '(not written)'}
${root.substack_goals ? `Their goals for how it's written: ${root.substack_goals}` : ''}

HOW TO WRITE EACH TAKE:
- Commit to the lens fully. Don't hedge, half-do it, or explain what you did.
- Keep their voice and the core truth. Keep the beat the section is meant to carry; a take can reach it by a different road, but it has to arrive.
- Each take replaces exactly its passage and nothing else. A passage take must read in place: it follows from the text just before it and hands over to the text just after it, because they may drop it straight into the draft. Don't restate the surrounding text.
- When several consecutive passages or sections are being reimagined together, they must read as one continuous piece through the same lens, not as separate exercises.
- Plain prose. Separate paragraphs with a blank line. No headings, markdown, or commentary.

OUTPUT: for every passage below, in the same order, exactly one block:
<take key="KEY">the reimagined passage</take>
Use the passage's own key. Nothing before, between, or after the blocks.`

    const userMessage = `THE WHOLE PIECE, for context ("${root.title || 'untitled'}"):
"""
${wholePiece}
"""

THE PASSAGES TO REIMAGINE:
${targetBlocks}`

    const targetChars = targets.reduce((n, t) => n + t.text.length, 0)
    const maxTokens = Math.min(16000, Math.max(1500, Math.round(targetChars / 2) + 300 * targets.length))

    return streamClaudeText(auth.user.id, 'write/reimagine', {
      model: pickModel(auth, MODELS.deep),
      max_tokens: maxTokens,
      system: withLanguage(systemPrompt),
      messages: [{ role: 'user', content: userMessage }],
    })
  } catch (error) {
    console.error('reimagine error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
