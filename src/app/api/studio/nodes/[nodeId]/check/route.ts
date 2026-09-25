// POST /api/studio/nodes/:nodeId/check — reads one part against the rules in
// force over it: its own, every ancestor's, and every thread it belongs to.
//
// Three hard rules, which are the whole point of the feature:
//   * it never fires while someone is writing. This route is called at a
//     boundary — marking a part drafted, or asking for it by hand.
//   * it never says whether the writing is good. It reports a collision
//     between the words and a rule the person wrote themselves.
//   * it arrives as a question, never a verdict, because breaking your own
//     rule is sometimes the right call and the answer may be to amend the rule.

import { aiGate, pickModel } from '@/lib/billing/fair-use'
import { NextResponse, type NextRequest } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { withLanguage } from '@/lib/language'
import { MODELS } from '@/lib/models'
import { htmlToPlainText } from '@/lib/rich-text'
import { logUsage } from '@/lib/usage-log'
import { fromDbError, requireProject, withAuth } from '@/lib/studio/db'
import { loadTree, requireNode } from '@/lib/studio/nodes-db'
import type { Rule, RuleCheck } from '@/lib/studio/node-types'
import { buildTree, findNode, leavesOf, pathTo } from '@/lib/studio/tree'

export const maxDuration = 60

type Params = { params: Promise<{ nodeId: string }> }

const ROUTE = 'studio/nodes/check'
const MAX_WORDS = 6000
const MAX_RULES = 24

const ROLE = `You are reading one part of a longer work against rules the maker wrote for themselves.

WHAT YOU ARE DOING: finding places where the words in front of you collide with one of their own rules. Nothing else.

HARD LIMITS:
- You never say whether the writing is good, strong, weak or working. Quality is not your business and never will be.
- You only report a collision you can point at. If a rule is kept, or you cannot tell, say nothing about it.
- A collision is reported as a QUESTION, never a verdict. They may have broken the rule deliberately, and the right answer may be to change the rule. Your question must leave both doors open.
- Quote or name the specific place in their words. "It drifts" is useless; "the last paragraph answers the question the rule says to leave open" is usable.
- Silence is a good answer. Most parts break no rules. Returning nothing is normal and correct.
- Never invent a rule. Only the numbered rules below exist.

OUTPUT: a JSON array, nothing else — no prose before or after. At most three entries, the clearest ones.
[{"rule_index": 2, "question": "…"}]
Return [] when nothing collides.
Each question is one or two sentences, in the second person, plain, no preamble.`

interface Collision {
  rule_index: number
  question: string
}

function parseCollisions(text: string): Collision[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start === -1 || end <= start) return []
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    if (!Array.isArray(parsed)) return []
    const out: Collision[] = []
    for (const item of parsed) {
      if (typeof item !== 'object' || item === null) continue
      const rec = item as Record<string, unknown>
      const idx = typeof rec.rule_index === 'number' ? rec.rule_index : Number(rec.rule_index)
      const question = typeof rec.question === 'string' ? rec.question.trim() : ''
      if (!Number.isInteger(idx) || !question) continue
      out.push({ rule_index: idx, question: question.slice(0, 600) })
      if (out.length >= 3) break
    }
    return out
  } catch {
    return []
  }
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { nodeId } = await params
  return withAuth(async (auth) => {
    const gated = await aiGate(auth)
    if (gated) return gated
    const node = await requireNode(auth, nodeId)
    const project = await requireProject(auth, node.project_id)
    const tree = await loadTree(auth, project.id)
    const roots = buildTree(tree.nodes, tree.tags, tree.threads.map((t) => t.id))
    const here = findNode(roots, node.id)
    if (!here) throw fromDbError(null, 'the part vanished while it was being read')

    // Rules in force: this node's own and every ancestor's, nearest first,
    // then the rules of every thread this part belongs to.
    const ancestry = pathTo(roots, node.id)
    const sources: Array<{ rule: Rule; sourceNodeId: string | null; sourceThreadId: string | null; label: string }> = []
    for (let i = ancestry.length - 1; i >= 0; i--) {
      const owner = ancestry[i]
      for (const rule of owner.rules) {
        if (rule.retired_at) continue
        sources.push({
          rule,
          sourceNodeId: owner.id,
          sourceThreadId: null,
          label: i === ancestry.length - 1 ? 'this part' : owner.title || 'the work above',
        })
      }
    }
    for (const threadId of here.threads) {
      const thread = tree.threads.find((t) => t.id === threadId)
      if (!thread) continue
      for (const rule of thread.rules) {
        if (rule.retired_at) continue
        sources.push({ rule, sourceNodeId: null, sourceThreadId: thread.id, label: thread.name || 'a thread' })
      }
    }

    const inForce = sources.slice(0, MAX_RULES)
    if (inForce.length === 0) return NextResponse.json({ checks: [], reason: 'no rules in force here' })

    // The words: this part's own, or everything beneath it when it has parts.
    const words = leavesOf(here)
      .map((leaf) => {
        const text = htmlToPlainText(leaf.body).trim()
        if (!text) return ''
        return leaf.title ? `## ${leaf.title}\n${text}` : text
      })
      .filter(Boolean)
      .join('\n\n')
      .split(/\s+/)
      .slice(0, MAX_WORDS)
      .join(' ')

    if (!words.trim()) return NextResponse.json({ checks: [], reason: 'nothing written here yet' })

    const ruleList = inForce
      .map((s, i) => `${i}. (${s.label}) ${s.rule.text}`)
      .join('\n')

    const intent = [
      here.title ? `Title: ${here.title}` : '',
      here.intent ? `What this part is for: ${here.intent}` : '',
      here.beat ? `The beat it carries: ${here.beat}` : '',
    ].filter(Boolean).join('\n')

    const response = await anthropic.messages.create({
      model: pickModel(auth, MODELS.deep),
      max_tokens: 900,
      system: withLanguage(`${COMPANION_TONE}\n\n${ROLE}`),
      messages: [
        {
          role: 'user',
          content: `THE RULES IN FORCE\n${ruleList}\n\n${intent ? `${intent}\n\n` : ''}THE WORDS\n${words}`,
        },
      ],
    })

    logUsage(auth.user.id, ROUTE, response.model, response.usage, { node: node.id, rules: inForce.length })

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
    const collisions = parseCollisions(text)
    if (collisions.length === 0) return NextResponse.json({ checks: [], reason: 'nothing collided' })

    const rows = collisions
      .filter((c) => c.rule_index >= 0 && c.rule_index < inForce.length)
      .map((c) => {
        const source = inForce[c.rule_index]
        return {
          user_id: auth.user.id,
          project_id: project.id,
          node_id: node.id,
          source_node_id: source.sourceNodeId,
          source_thread_id: source.sourceThreadId,
          rule_id: source.rule.id,
          rule_text: source.rule.text,
          question: c.question,
        }
      })
    if (rows.length === 0) return NextResponse.json({ checks: [], reason: 'nothing collided' })

    const { data, error } = await auth.supabase.from('studio_rule_checks').insert(rows).select('*')
    if (error) throw fromDbError(error)
    return NextResponse.json({ checks: (data ?? []) as RuleCheck[] })
  })
}
