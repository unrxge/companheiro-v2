// GET/POST /api/studio/projects/:id/companion — the companion, at whatever
// altitude you are standing.
//
// It is given the shape of the work, not the prose: what the thing is for, the
// rules in force, the parts and what each is meant to do, the threads and where
// they appear and where they go quiet. That is enough to talk about strategy
// and shape, and it is deliberately not enough to write anything.
//
// At the project altitude it can see every piece and every thread. Inside a
// part it sees that part, what it owes the thing above it, and its siblings.

import { NextResponse, type NextRequest } from 'next/server'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { withLanguage } from '@/lib/language'
import { MODELS } from '@/lib/models'
import { cacheLastMessage } from '@/lib/prompt-cache'
import { streamClaudeText } from '@/lib/streaming'
import {
  badRequest, fromDbError, isRecord, isString, isUuid, readJson, requireProject, withAuth,
} from '@/lib/studio/db'
import { loadTree } from '@/lib/studio/nodes-db'
import type { Rule, TreeNode } from '@/lib/studio/node-types'
import { appearancesOf, buildTree, extentOf, findNode, pathTo } from '@/lib/studio/tree'

export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

const ROUTE = 'studio/companion'
const HISTORY_LIMIT = 24
const MAX_MESSAGE = 4000

const ROLE = `You are sitting beside someone who is holding a long piece of work together — a series, a record, a book, a film. You are here for its SHAPE and its DIRECTION, never for its prose.

WHAT YOU CAN SEE: what each part is for, the rules they set themselves, how the parts are ordered and how big each one is, and the threads running across the whole thing with the places they appear. You can see almost none of the actual writing, and you should not ask for it.

WHAT YOU DO:
- Notice what the shape is telling you. A thread that runs through the first two pieces and then goes quiet. A part carrying four times the weight of everything around it. A stated intent that nothing beneath it seems aimed at. Say the observation, then ask about it.
- Help them decide: what goes where, what is missing, what two parts are doing the same job, whether something should stand on its own or be folded in.
- Take the intent seriously and hold them to it. If they wrote that a piece has to earn its ending and the parts are all setup, say so.

WHAT YOU NEVER DO:
- You never write the work. No lines, no prose they could paste, no titles, no rewrites. If they ask for a version, say what the part has to do instead and hand the doing back.
- You never say whether the writing is good. You have barely seen it, and quality is not your business.
- No preamble, no restating the question, no summarising what they just said. Start with the thing itself.
- No lists of options unless they asked for options. One thought, followed at most by one question.

Short replies. Match the weight of what they brought.`

function outline(node: TreeNode, depth: number, threadNames: Map<string, string>): string {
  const pad = '  '.repeat(depth)
  const bits: string[] = []
  bits.push(`${pad}- ${node.title || 'untitled'}${node.stands_whole ? ' [stands whole]' : ''} · ${extentOf(node)} words · ${node.status}`)
  if (node.intent) bits.push(`${pad}  for: ${node.intent}`)
  if (node.beat) bits.push(`${pad}  beat here: ${node.beat}`)
  const live = (node.rules ?? []).filter((r: Rule) => !r.retired_at)
  for (const rule of live) bits.push(`${pad}  rule: ${rule.text}`)
  const names = node.threads.map((id) => threadNames.get(id)).filter(Boolean)
  if (names.length) bits.push(`${pad}  threads: ${names.join(', ')}`)
  for (const child of node.children) bits.push(outline(child, depth + 1, threadNames))
  return bits.join('\n')
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  const nodeId = req.nextUrl.searchParams.get('node_id')
  return withAuth(async (auth) => {
    const project = await requireProject(auth, id)
    let q = auth.supabase
      .from('studio_vision_messages')
      .select('id, role, text, created_at')
      .eq('project_id', project.id)
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: true })
      .limit(200)
    q = nodeId && isUuid(nodeId) ? q.eq('node_id', nodeId) : q.is('node_id', null)
    const { data, error } = await q
    if (error) throw fromDbError(error)
    return NextResponse.json({ messages: data ?? [] })
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')
    if (!isString(body.message) || !body.message.trim()) throw badRequest('say something')
    const message = body.message.trim().slice(0, MAX_MESSAGE)
    const nodeId = isUuid(body.node_id) ? body.node_id : null

    const project = await requireProject(auth, id)
    const tree = await loadTree(auth, project.id)
    const roots = buildTree(tree.nodes, tree.tags, tree.threads.map((x) => x.id))
    const threadNames = new Map(tree.threads.map((x) => [x.id, x.name || 'an unnamed thread']))

    // ── what the companion is standing in front of ─────────────────────────
    const here = nodeId ? findNode(roots, nodeId) : null
    const lines: string[] = []

    if (here) {
      const trail = pathTo(roots, here.id)
      const above = trail.length > 1 ? trail[trail.length - 2] : null
      lines.push(`WHERE WE ARE: inside “${here.title || 'an untitled part'}”, within ${project.title}.`)
      if (above) {
        lines.push(`IT SITS INSIDE “${above.title || 'an untitled part'}”${above.intent ? `, which is for: ${above.intent}` : ''}.`)
        if (here.beat) lines.push(`WHAT IT OWES THAT: ${here.beat}`)
        const siblings = above.children.map((s, i) => `${i + 1}. ${s.title || 'untitled'}${s.id === here.id ? '  ← here' : ''} (${extentOf(s)}w)${s.beat ? ` — ${s.beat}` : ''}`)
        lines.push(`THE PARTS AROUND IT, IN ORDER:\n${siblings.join('\n')}`)
      }
      lines.push(`THIS PART:\n${outline(here, 0, threadNames)}`)
    } else {
      lines.push(`WHERE WE ARE: the whole of ${project.title}.`)
      if (project.intent) lines.push(`WHAT THE WHOLE THING IS FOR: ${project.intent}`)
      const projectRules = ((project.rules ?? []) as Rule[]).filter((r) => r && !r.retired_at)
      if (projectRules.length) lines.push(`RULES OVER EVERYTHING:\n${projectRules.map((r) => `- ${r.text}`).join('\n')}`)
      lines.push(`THE PIECES:\n${roots.map((r) => outline(r, 0, threadNames)).join('\n')}`)
    }

    // ── the threads, and where they go quiet ───────────────────────────────
    if (tree.threads.length) {
      const threadLines = tree.threads.map((thread) => {
        const appearances = appearancesOf(roots, thread.id)
        const touched = new Set(appearances.map((a) => a.rootId))
        const silent = roots.filter((r) => !touched.has(r.id)).map((r) => r.title || 'untitled')
        const rules = (thread.rules ?? []).filter((r: Rule) => !r.retired_at)
        return [
          `- ${thread.name || 'unnamed thread'}${thread.intent ? ` — for: ${thread.intent}` : ''}`,
          ...rules.map((r) => `    rule: ${r.text}`),
          appearances.length
            ? `    appears in: ${appearances.map((a) => `${a.trail.join(' / ')}${tree.tags.find((t) => t.node_id === a.node.id && t.thread_id === thread.id)?.note ? ` (${tree.tags.find((t) => t.node_id === a.node.id && t.thread_id === thread.id)?.note})` : ''}`).join('; ')}`
            : '    appears nowhere yet',
          silent.length ? `    absent from: ${silent.join(', ')}` : '',
        ].filter(Boolean).join('\n')
      })
      lines.push(`WHAT RUNS ACROSS IT:\n${threadLines.join('\n')}`)
    }

    // ── history ────────────────────────────────────────────────────────────
    let hq = auth.supabase
      .from('studio_vision_messages')
      .select('role, text, created_at')
      .eq('project_id', project.id)
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)
    hq = nodeId ? hq.eq('node_id', nodeId) : hq.is('node_id', null)
    const { data: history, error: histErr } = await hq
    if (histErr) throw fromDbError(histErr)

    const past: MessageParam[] = (history ?? [])
      .slice()
      .reverse()
      .map((m: { role: string; text: string }) => ({
        role: m.role === 'companion' ? ('assistant' as const) : ('user' as const),
        content: m.text,
      }))

    const { error: insErr } = await auth.supabase.from('studio_vision_messages').insert({
      user_id: auth.user.id, project_id: project.id, node_id: nodeId, role: 'person', text: message,
    })
    if (insErr) throw fromDbError(insErr)

    const messages: MessageParam[] = [
      { role: 'user', content: `THE WORK AS IT STANDS\n\n${lines.join('\n\n')}` },
      { role: 'assistant', content: 'I have it.' },
      ...past,
      { role: 'user', content: message },
    ]

    return streamClaudeText(
      ROUTE,
      {
        model: MODELS.deep,
        max_tokens: 1200,
        system: withLanguage(`${COMPANION_TONE}\n\n${ROLE}`),
        messages: cacheLastMessage(messages),
      },
      async (fullText) => {
        if (fullText.trim()) {
          await auth.supabase.from('studio_vision_messages').insert({
            user_id: auth.user.id, project_id: project.id, node_id: nodeId,
            role: 'companion', text: fullText.trim(),
          })
        }
        return {}
      },
    )
  })
}
