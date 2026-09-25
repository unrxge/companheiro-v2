// GET/POST /api/studio/projects/:id/companion — the companion, at whatever
// altitude you are standing.
//
// Reflect mode is given the shape of the work, not the prose: what the thing
// is for, the rules in force, the parts and what each is meant to do, the
// threads and where they appear and where they go quiet. That is enough to
// talk about strategy and shape, and it is deliberately not enough to write
// anything — this is the companion's default, and its behavior everywhere
// except the two exceptions below.
//
// The first exception: a passage highlighted in the editor travels along in
// either mode, because handing it over is the person's own act, the same as
// pasting it into the message would be — reflect can discuss it, but that one
// passage is all it gets; the rest of the part stays unseen.
//
// Write mode is the second, bigger exception: opened deliberately, one part
// at a time, it is handed that part's actual prose and permitted to propose a
// rewrite — never speculatively, and never anywhere else in the same
// conversation. A write-lock (user_settings.assistant_write_locked_until,
// shared with the main app) can hold the companion to reflect-only regardless
// of what the client asks for, for anyone who wants no AI prose at all while
// they write.
//
// At the project altitude it can see every piece and every thread. Inside a
// part it sees that part, what it owes the thing above it, and its siblings.
//
// The vision is more than the shape, too: who this actually reaches, what it
// takes for that to happen, what it is really handing someone, why any of it
// is worth their time or the person's own — that lives in reflect mode as
// well, since none of it needs the prose either. It only comes up when asked
// for, the same restraint that governs everything else here.

import { aiGate, pickModel } from '@/lib/billing/fair-use'
import { NextResponse, type NextRequest } from 'next/server'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { withLanguage } from '@/lib/language'
import { MODELS } from '@/lib/models'
import { cacheLastMessage } from '@/lib/prompt-cache'
import { htmlToPlainText } from '@/lib/rich-text'
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

Short replies. Match the weight of what they brought.`

/** Only ever appended in write mode, with a real part to write into. */
function writeAddendum(selectedText: string | null): string {
  return `

You are now in WRITE MODE for this one part only — permission to see and propose its actual prose is granted here, and only here; the rule above about never seeing the writing still holds everywhere else in this conversation.

Before you ever offer a rewrite, once you've understood what they're reaching for, weave in a brief, concrete example of their own idea put into practice, seamlessly, as part of the natural back-and-forth — keep their own creative reflexes alive, don't jump straight to a full solve.

Only once that's happened, and only when it's genuinely the moment for it, offer the choice: try it themselves first, or have you show a version — phrased freshly each time, specific to what's actually being discussed, never a repeated template.

When — and only when — they clearly want you to write or rewrite prose, produce the revision and append it at the very end wrapped exactly like this:
<proposed_edit>
the revised text
</proposed_edit>

Rules:
${selectedText
    ? `- They highlighted a specific passage — that is the ENTIRE scope of this edit. Return ONLY the rewritten version of that highlighted passage, not the surrounding text. It gets spliced back exactly where the highlight was.`
    : `- No passage was highlighted, so this is a whole-part edit — return the part's complete revised text. It replaces the part wholesale on approval.`}
- Preserve their voice and intent. Consistency with what comes before this part, in reading order, is non-negotiable — if your proposal would contradict or ignore something already established, don't propose it; raise the tension in chat instead.
- Let the length be whatever the moment needs — a tightened line or a full redraft.
- Say briefly what you changed and why in your chat message; they approve or reject the proposed text before anything lands.
- Never propose an edit speculatively or on the first exchange about this part — earn it through the back-and-forth.`
}

const WRITE_NO_TARGET = `

They have asked for write mode, but there is nothing here with actual prose to rewrite — either no part is focused, or this one is already marked done. Stay conversational; do not propose an edit.`

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
    const wantsWrite = body.mode === 'write'
    const selectedText = isString(body.selected_text) && body.selected_text.trim()
      ? body.selected_text.trim().slice(0, MAX_MESSAGE)
      : null

    const project = await requireProject(auth, id)
    const tree = await loadTree(auth, project.id)
    const roots = buildTree(tree.nodes, tree.tags, tree.threads.map((x) => x.id))
    const threadNames = new Map(tree.threads.map((x) => [x.id, x.name || 'an unnamed thread']))

    // The write-lock is re-checked here, not trusted from the client — the
    // whole point of the lock is that switching back to write mode early
    // isn't possible, including by calling this endpoint directly.
    const { data: settings } = await auth.supabase
      .from('user_settings')
      .select('assistant_write_locked_until')
      .eq('user_id', auth.user.id)
      .maybeSingle()
    const lockedUntil = settings?.assistant_write_locked_until ?? null
    const isLocked = !!lockedUntil && new Date(lockedUntil).getTime() > Date.now()
    const assistantMode: 'coach' | 'write' = isLocked ? 'coach' : wantsWrite ? 'write' : 'coach'

    // ── what the companion is standing in front of ─────────────────────────
    const here = nodeId ? findNode(roots, nodeId) : null
    const canEdit = assistantMode === 'write' && !!here && here.status !== 'done'
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

      // A highlighted passage is the person bringing it, not you going and
      // reading the part — the same as pasting it into the message would be,
      // so this travels in either mode, unlike everything in canEdit below.
      if (selectedText) {
        lines.push(`SELECTED PASSAGE (they highlighted this — it is the exact focus; this is the verbatim current text, never ask them to paste it again):\n"""\n${selectedText}\n"""`)
      }

      // ── the one exception: actual prose, only here, only in write mode ───
      if (canEdit) {
        const precedingText = above
          ? above.children
            .filter((s) => s.position < here.position)
            .sort((a, b) => a.position - b.position)
            .map((s) => `[${s.title || 'untitled'}]\n${htmlToPlainText(s.body).trim() || '(not written yet)'}`)
            .join('\n\n')
          : ''
        lines.push(
          precedingText
            ? `THE PIECE SO FAR (read before proposing anything; match its established tone and voice):\n\n${precedingText}`
            : 'Nothing has been written before this part yet — it is the opening.',
        )
        lines.push(`THE ACTUAL TEXT OF THIS PART, RIGHT NOW:\n"""\n${htmlToPlainText(here.body).trim() || '(empty)'}\n"""`)
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

    const addendum = assistantMode === 'write' ? (canEdit ? writeAddendum(selectedText) : WRITE_NO_TARGET) : ''

    return streamClaudeText(auth.user.id, 
      ROUTE,
      {
        model: pickModel(auth, MODELS.deep),
        // A whole-part rewrite needs real room; a reflect-mode reply is
        // meant to stay short, so only write mode gets the bigger cap.
        max_tokens: assistantMode === 'write' ? 4096 : 1200,
        system: withLanguage(`${COMPANION_TONE}\n\n${ROLE}${addendum}`),
        messages: cacheLastMessage(messages),
      },
      async (fullText) => {
        // The <proposed_edit> block is shown to the person inline, in the
        // document itself, once approved — it does not belong in the chat
        // transcript twice, so only the conversational half is persisted.
        const clean = fullText.replace(/<proposed_edit>[\s\S]*?<\/proposed_edit>/, '').trim()
        if (clean) {
          await auth.supabase.from('studio_vision_messages').insert({
            user_id: auth.user.id, project_id: project.id, node_id: nodeId,
            role: 'companion', text: clean,
          })
        }
        const meta: Record<string, unknown> = { lockedMode: isLocked ? 'coach' : null }
        if (canEdit) {
          const match = fullText.match(/<proposed_edit>\s*([\s\S]*?)\s*<\/proposed_edit>/)
          if (match) meta.proposedEdit = { node_id: nodeId, content: match[1], anchor_text: selectedText }
        }
        return meta
      },
    )
  })
}
