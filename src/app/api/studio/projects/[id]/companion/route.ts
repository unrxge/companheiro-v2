// GET/POST /api/studio/projects/:id/companion — the companion, at whatever
// altitude you are standing.
//
// It is given the shape of the work, not the prose: what the thing is for,
// the rules in force, the parts and what each is meant to do, the threads and
// where they appear and where they go quiet. That is enough to talk about
// strategy and shape, and it is deliberately not enough to write anything.
// There is no mode in which it writes (until 2026-10-13 a "write mode" could
// be switched on for one part; words on request now belong to the writing
// assistant alone, /api/write/chat, and only on a direct order).
//
// The one exception to "never the prose": a passage highlighted in the editor
// travels along, because handing it over is the person's own act, the same as
// pasting it into the message would be. It can discuss that passage, and that
// one passage is all it gets; the rest of the part stays unseen.
//
// At the project altitude it can see every piece and every thread. Inside a
// part it sees that part, what it owes the thing above it, and its siblings.
//
// The canvas no longer sends its "Talk about the vision" here: that is the
// vision room now (../vision/route.ts), which reads the whole canvas and can
// look things up. With no node_id this still answers, for anything older
// that calls it, and shares that room's conversation.
//
// The vision is more than the shape, too: who this actually reaches, what it
// takes for that to happen, what it is really handing someone, why any of it
// is worth their time or the person's own — that lives here as
// well, since none of it needs the prose either. It only comes up when asked
// for, the same restraint that governs everything else here.

import { aiGate, pickModel } from '@/lib/billing/fair-use'
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
import { appearancesOf, buildTree, extentOf, findNode, pathTo, rulesInForce } from '@/lib/studio/tree'
import { proposeRules, type RuleProposal } from '@/lib/studio/rule-proposals'
import { assertFeature, assertProjectIdWorkable } from '@/lib/studio/plan-access'

export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

const ROUTE = 'studio/companion'
// The window keeps the latest 10–17 exchanges and moves in blocks of 16
// messages rather than one per reply, so the cached prefix survives eight
// exchanges at a time instead of being rebuilt on every turn.
const HISTORY_KEEP = 20
const HISTORY_STEP = 16
const HISTORY_FETCH = HISTORY_KEEP + HISTORY_STEP - 1
const MAX_MESSAGE = 4000

const ROLE = `You are sitting beside someone who is holding a long piece of work together — a series, a record, a book, a film. You are here for its SHAPE and its DIRECTION, never for its prose.

WHAT YOU CAN SEE: what each part is for, the rules they set themselves, how the parts are ordered and how big each one is, and the threads running across the whole thing with the places they appear. You can see almost none of the actual writing, and you should not ask for it. A SELECTED PASSAGE below is the one exception — they highlighted it themselves to bring it here, so read and discuss that passage directly, but it is not an opening to the rest of the part.

WHAT YOU DO:
- Notice what the shape is telling you. A thread that runs through the first two pieces and then goes quiet. A part carrying four times the weight of everything around it. A stated intent that nothing beneath it seems aimed at. Say the observation, then ask about it.
- Help them decide: what goes where, what is missing, what two parts are doing the same job, whether something should stand on its own or be folded in.
- Take the intent seriously and hold them to it. If they wrote that a piece has to earn its ending and the parts are all setup, say so.

THE VISION IS MORE THAN ITS SHAPE — this is there when they reach for it, not an agenda you bring:
- Who is actually going to receive this. Not "an audience" as an abstraction — the specific people, and separately, the mechanics that decide whether those people ever see it at all: a feed, a platform, an algorithm that reads nothing like a person does. A film cut for a six-second hook and the same film released to sit with are not the same act, even off identical footage.
- What it takes for that to land the way it deserves. The shape it travels in, what happens in the stretch before anyone sees it and the stretch after, who this is actually speaking to versus who they are picturing while they make it.
- What the work is actually handing someone, past the thing itself — the words that surround it, the idea that started it, what it might open onto next for someone who just finished it.
- Why anyone should give it their time — and just as much, why they are giving theirs. What this is in service of underneath the project itself: the thing they are actually trying to become, prove, or say by making it at all.
- What might come after, once this one is out in the world. Point at it as a door left open, not the next item on a list.

None of that needs the prose either, so it costs nothing to hold — but it is still never about writing anything for them. An angle on how something gets framed is a thought said out loud, not a caption or a post; if they want the actual words, that is theirs to write, same as everywhere else here. And this is not a checklist to work through — most conversations never touch it. Follow them into it; do not lead them there.

WHAT YOU NEVER DO:
- You never write the work. No lines, no prose they could paste, no titles, no rewrites. If they ask for a version, say what the part has to do instead and hand the doing back.
- You never say whether the writing is good. You have barely seen it, and quality is not your business.
- No preamble, no restating the question, no summarising what they just said. Start with the thing itself.
- No lists of options unless they asked for options. One thought, followed at most by one question.

THEIR OWN RULES: when what they say now settles something that runs against one of the rules they set (listed above), put that rule and today's words side by side, plainly, and ask which one stands now: the work, or the rule. Only for a real collision, never a loose echo. Never decide for them and never scold; changing the rule is as good an answer as changing the work.

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
    const gated = await aiGate(auth)
    if (gated) return gated
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')
    if (!isString(body.message) || !body.message.trim()) throw badRequest('say something')
    const message = body.message.trim().slice(0, MAX_MESSAGE)
    const nodeId = isUuid(body.node_id) ? body.node_id : null
    const selectedText = isString(body.selected_text) && body.selected_text.trim()
      ? body.selected_text.trim().slice(0, MAX_MESSAGE)
      : null

    const project = await requireProject(auth, id)
    await assertProjectIdWorkable(auth, project.id)
    // With no part named, this is the talk about the whole vision.
    if (!nodeId) await assertFeature(auth, 'visionTalk')
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
      const overAll = ((project.rules ?? []) as Rule[]).filter((r) => r && !r.retired_at)
      if (overAll.length) lines.push(`RULES OVER THE WHOLE PROJECT:\n${overAll.map((r) => `- ${r.text}`).join('\n')}`)

      // A highlighted passage is the person bringing it, not you going and
      // reading the part — the same as pasting it into the message would be,
      // so it travels with the message.
      if (selectedText) {
        lines.push(`SELECTED PASSAGE (they highlighted this — it is the exact focus; this is the verbatim current text, never ask them to paste it again):\n"""\n${selectedText}\n"""`)
      }

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
      .select('role, text, created_at', { count: 'exact' })
      .eq('project_id', project.id)
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_FETCH)
    hq = nodeId ? hq.eq('node_id', nodeId) : hq.is('node_id', null)
    const { data: history, count, error: histErr } = await hq
    if (histErr) throw fromDbError(histErr)

    const recent = (history ?? []).slice().reverse()
    const total = count ?? recent.length
    const windowStart = Math.floor(Math.max(0, total - HISTORY_KEEP) / HISTORY_STEP) * HISTORY_STEP
    const firstFetched = total - recent.length
    const past: MessageParam[] = recent
      .slice(Math.max(0, windowStart - firstFetched))
      .map((m: { role: string; text: string }) => ({
        role: m.role === 'companion' ? ('assistant' as const) : ('user' as const),
        content: m.text,
      }))
      // The API wants turns to alternate; a reply that failed to save would
      // leave two of theirs in a row, so neighbouring turns are joined.
      .reduce<MessageParam[]>((acc, m) => {
        const last = acc[acc.length - 1]
        if (last && last.role === m.role) last.content = `${last.content as string}\n\n${m.content}`
        else acc.push({ ...m })
        return acc
      }, [])

    const { data: inserted, error: insErr } = await auth.supabase.from('studio_vision_messages').insert({
      user_id: auth.user.id, project_id: project.id, node_id: nodeId, role: 'person', text: message,
    }).select('id').single()
    if (insErr) throw fromDbError(insErr)

    // Listening for a rule they just set, alongside the reply. It only ever
    // proposes; the answer is theirs (see lib/studio/rule-proposals.ts).
    const liveRules = [
      ...((project.rules ?? []) as Rule[]).filter((r) => r && !r.retired_at).map((r) => r.text),
      ...(here ? rulesInForce(roots, here.id).map((r) => r.rule.text) : []),
    ]
    const proposalPromise: Promise<RuleProposal[]> = proposeRules(auth, {
      projectId: project.id,
      nodeId,
      text: message,
      intent: here?.intent || project.intent || '',
      rulesInForce: liveRules,
      messageId: (inserted as { id: string } | null)?.id ?? null,
      source: 'talk',
    }).catch((e) => {
      console.error('[studio] rule proposals failed:', e)
      return []
    })

    const messages: MessageParam[] = [
      { role: 'user', content: `THE WORK AS IT STANDS\n\n${lines.join('\n\n')}` },
      { role: 'assistant', content: 'I have it.' },
      ...past,
      { role: 'user', content: message },
    ]

    return streamClaudeText(auth.user.id, 
      ROUTE,
      {
        model: pickModel(auth, MODELS.deep),
        // This conversation is about shape and direction and never writes
        // the work (ROLE), so replies are meant to stay short.
        max_tokens: 1200,
        system: withLanguage(`${COMPANION_TONE}\n\n${ROLE}`),
        messages: cacheLastMessage(messages),
      },
      async (fullText) => {
        const clean = fullText.trim()
        if (clean) {
          await auth.supabase.from('studio_vision_messages').insert({
            user_id: auth.user.id, project_id: project.id, node_id: nodeId,
            role: 'companion', text: clean,
          })
        }
        const meta: Record<string, unknown> = {}
        meta.proposals = await Promise.race([
          proposalPromise,
          new Promise<RuleProposal[]>((resolve) => setTimeout(() => resolve([]), 10_000)),
        ])
        return meta
      },
      { mode: 'guide' },
    )
  })
}
