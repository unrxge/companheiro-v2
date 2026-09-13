// POST /api/studio/drafts/:draftId/chat — the draft studio's companion (9.4, D-063).
// Posture is the server's truth (never the client's): locked → 409 without a
// model call; ask → questions only, any <proposed_edit> stripped; suggest → the
// copied write-chat "coach" discipline plus, when they clearly ask for a version,
// ONE proposal ≤ a paragraph in <proposed_edit>…</proposed_edit> for the focused,
// unlocked section — never inserted. Streams text/plain; meta { proposed_edit,
// truncated }. Both messages are inserted into studio_draft_messages.
// GET returns the last messages so the thread reopens where it was left.

import { NextResponse, type NextRequest } from 'next/server'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { withLanguage } from '@/lib/language'
import { MODELS } from '@/lib/models'
import { cacheLastMessage } from '@/lib/prompt-cache'
import { htmlToPlainText } from '@/lib/rich-text'
import { streamClaudeText } from '@/lib/streaming'
import {
  badRequest, conflict, fromDbError, isRecord, isString, isUuid, notFound, readJson, withAuth,
} from '@/lib/studio/db'
import type { Draft, DraftChatRequest, DraftMessage, DraftSection } from '@/lib/studio/types'
import type { AuthedContext } from '@/lib/supabase/route'

export const maxDuration = 60

type Params = { params: Promise<{ draftId: string }> }

const ROUTE = 'studio/drafts/chat'
const HISTORY_LIMIT = 20
const MAX_MESSAGE = 6000
const MAX_SELECTED = 4000
const MAX_HISTORY = 40
const PROPOSAL_RE = /<proposed_edit>\s*([\s\S]*?)\s*<\/proposed_edit>/
const ANY_PROPOSAL_RE = /<proposed_edit>[\s\S]*?(<\/proposed_edit>|$)/g

// ── roles ──────────────────────────────────────────────────────────────────

const DRAFT_ASK_ROLE = `You are sitting beside a writer inside their draft studio, in ASK posture.

ASK POSTURE — HARD RULE, NO EXCEPTIONS: you write nothing for them. No lines, no fragments they could paste, no rewrites, no <proposed_edit>, ever. You ask.
- At most three questions per reply, often one. Each about the section they named, or the passage they selected, or the move they seem to be reaching for.
- You may name a move ("this could open on the second sentence", "there is a turn missing between these two paragraphs") without filling it in.
- You never say whether the writing is good or bad, strong or weak, working or not. Nothing counts and nothing judges. Point at what is there; ask what is underneath.
- Short replies. A question about one line gets a reply about that line.`

const DRAFT_SUGGEST_ROLE = `You are sitting beside a writer inside their draft studio, in SUGGEST posture.

The prose stays theirs. You help them think, unstick a section, sharpen an angle, challenge an idea — a companion, not a ghostwriter.
- Before ever offering a version, weave in a brief illustrative fragment — half a sentence, enough to point at a technique — as part of the back-and-forth, not as an announced step. Never reach for the same move twice in a session.
- One question maximum per reply, and only when it genuinely opens something. Never stack questions.
- You never say whether the writing is good. Observations, not verdicts: "I wonder if there is a version of this only you could write" opens something; "that's a cliché" closes it.
- Match the weight of what they brought; a small thing deserves a small answer.

THE ONE PROPOSAL — when, and only when, they clearly ask for a version (not when they ask what you think), and only if PROPOSALS ALLOWED below says yes: append at the very end, after your reply, exactly ONE proposal wrapped like this:
<proposed_edit>
the text
</proposed_edit>
Rules for the proposal:
- At most a paragraph. Never the whole section, never several passages.
- If they selected a passage, the proposal is the replacement for that passage only — nothing around it.
- If nothing is selected, the proposal is a passage that could stand where their caret is; it is not a rewrite of what is already there.
- If anchor lines are listed, they are precious; weave, never drop, never alter.
- Their register, their voice, a continuation of what is already on the page — not a fresh take.
- Nothing is inserted by you. The proposal appears as a card; they apply it or discard it.
- Never propose on the first exchange about a section; earn it.`

// ── loading ────────────────────────────────────────────────────────────────

async function loadDraft(auth: AuthedContext, draftId: string): Promise<Draft> {
  if (!isUuid(draftId)) throw notFound()
  const { data, error } = await auth.supabase.from('studio_drafts').select('*').eq('id', draftId).maybeSingle()
  if (error) throw fromDbError(error)
  if (!data) throw notFound()
  return data as Draft
}

async function loadMessages(auth: AuthedContext, draftId: string, limit: number): Promise<DraftMessage[]> {
  const { data, error } = await auth.supabase
    .from('studio_draft_messages')
    .select('id, draft_id, role, text, created_at')
    .eq('draft_id', draftId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw fromDbError(error)
  return (((data as DraftMessage[] | null) ?? []) as DraftMessage[]).reverse()
}

function parseBody(raw: Record<string, unknown>): DraftChatRequest {
  if (!isString(raw.message) || !raw.message.trim()) throw badRequest('message must be text')
  const section_id = raw.section_id === null || raw.section_id === undefined ? null : raw.section_id
  if (section_id !== null && !isUuid(section_id)) throw badRequest('section_id must be a uuid or null')
  const selected_text = raw.selected_text === null || raw.selected_text === undefined ? null : raw.selected_text
  if (selected_text !== null && !isString(selected_text)) throw badRequest('selected_text must be text or null')
  const history: DraftChatRequest['history'] = []
  if (raw.history !== undefined) {
    if (!Array.isArray(raw.history)) throw badRequest('history must be an array')
    for (const h of raw.history.slice(-MAX_HISTORY)) {
      if (!isRecord(h) || (h.role !== 'person' && h.role !== 'companion') || !isString(h.text)) throw badRequest('bad history entry')
      history.push({ role: h.role, text: h.text })
    }
  }
  return {
    message: raw.message.trim().slice(0, MAX_MESSAGE),
    section_id,
    selected_text: selected_text ? selected_text.trim().slice(0, MAX_SELECTED) || null : null,
    history,
  }
}

const stripProposals = (text: string): string => text.replace(ANY_PROPOSAL_RE, '').trimEnd()

// ── GET: the thread so far ─────────────────────────────────────────────────

export async function GET(_req: NextRequest, { params }: Params) {
  const { draftId } = await params
  return withAuth(async (auth) => {
    const draft = await loadDraft(auth, draftId)
    const messages = await loadMessages(auth, draft.id, 40)
    return NextResponse.json({ messages })
  })
}

// ── POST: one reply, one stream ────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  const { draftId } = await params
  return withAuth(async (auth) => {
    const body = parseBody(await readJson<Record<string, unknown>>(req))
    const draft = await loadDraft(auth, draftId)

    // posture is the server's truth (9.4)
    if (draft.posture === 'locked') throw conflict('this draft is locked for the companion')

    const [sectionsRes, anchorsRes, history] = await Promise.all([
      auth.supabase
        .from('studio_draft_sections')
        .select('*')
        .eq('draft_id', draft.id)
        .order('position', { ascending: true }),
      auth.supabase
        .from('studio_blocks')
        .select('content')
        .eq('project_id', draft.project_id)
        .eq('type', 'anchor')
        .is('deleted_at', null)
        .is('struck_at', null)
        .order('created_at', { ascending: true }),
      loadMessages(auth, draft.id, HISTORY_LIMIT),
    ])
    if (sectionsRes.error) throw fromDbError(sectionsRes.error)
    if (anchorsRes.error) throw fromDbError(anchorsRes.error)
    const sections = (sectionsRes.data as DraftSection[] | null) ?? []
    const anchors = ((anchorsRes.data as Array<{ content: unknown }> | null) ?? [])
      .map((r) => (isRecord(r.content) && isString(r.content.text) ? r.content.text.trim() : ''))
      .filter(Boolean)

    const focused = body.section_id ? sections.find((s) => s.id === body.section_id) ?? null : null
    const canPropose = draft.posture === 'suggest' && !!focused && !focused.is_locked

    // the person's message is saved before the model speaks, so a dropped stream never loses it
    const { error: pErr } = await auth.supabase
      .from('studio_draft_messages')
      .insert({ user_id: auth.user.id, draft_id: draft.id, role: 'person', text: body.message })
    if (pErr) throw fromDbError(pErr)

    // ── context (9.4): title/kind, the focused section, preceding labels+text only when needed, selection, anchors ──
    const anchorBlock =
      anchors.length > 0
        ? `ANCHOR LINES (the project hangs on these; precious to them — weave, never drop, never alter):\n${anchors.map((a) => `- "${a}"`).join('\n')}`
        : 'No anchor lines yet.'

    const stableBlock = `${COMPANION_TONE}

${draft.posture === 'ask' ? DRAFT_ASK_ROLE : DRAFT_SUGGEST_ROLE}

THE DRAFT: "${draft.title}" — a ${draft.kind}.

${anchorBlock}

RESPONSE DISCIPLINE:
- Match length to what was asked. A small thing deserves a small answer.
- Never count anything about the writing, never rate it, never praise it. Nothing is sent anywhere; nothing here is a task.
- Address them as "you".`

    let sectionBlock: string
    if (focused) {
      const idx = sections.findIndex((s) => s.id === focused.id)
      const preceding = sections.slice(0, Math.max(0, idx)).filter((s) => htmlToPlainText(s.content))
      const precedingBlock =
        preceding.length > 0
          ? `WHAT COMES BEFORE THE FOCUSED SECTION (read it for continuity; do not restate it):\n${preceding
              .map((s, i) => `[${s.label || `section ${i + 1}`}]\n${htmlToPlainText(s.content).slice(0, 4000)}`)
              .join('\n\n')}`
          : idx === 0
            ? 'The focused section is the opening; nothing comes before it.'
            : 'Nothing has been written before the focused section yet.'
      sectionBlock = `${precedingBlock}

THE SECTION THEY ARE FOCUSED ON:
Label: ${focused.label || `section ${idx + 1}`}
Locked: ${focused.is_locked ? 'yes — you may talk about it but must not propose any text for it' : 'no'}
Current text:
"""
${htmlToPlainText(focused.content) || '(empty)'}
"""${
        body.selected_text
          ? `

SELECTED PASSAGE (they highlighted this; it is the focus of the conversation, and the exact scope of any proposal — you already have it in full here, never ask them to paste it):
"""
${body.selected_text}
"""`
          : ''
      }`
    } else {
      sectionBlock = 'They are not focused on a section right now — keep it about the draft as a whole, and propose nothing.'
    }

    const volatileBlock = `${sectionBlock}

PROPOSALS ALLOWED: ${canPropose ? 'yes — one, at most a paragraph, only when they clearly ask for a version' : 'no — write no <proposed_edit> under any circumstances'}`

    // conversation: the stored thread is the truth; the client's history fills a first, unstored turn
    const prior: MessageParam[] =
      history.length > 0
        ? history.map((m) => ({ role: m.role === 'person' ? ('user' as const) : ('assistant' as const), content: m.text }))
        : body.history.map((m) => ({ role: m.role === 'person' ? ('user' as const) : ('assistant' as const), content: m.text }))
    // the person's message was inserted above; drop it from the prior turns if it came back with them
    const trimmed = prior.length > 0 && prior[prior.length - 1].role === 'user' && prior[prior.length - 1].content === body.message
      ? prior.slice(0, -1)
      : prior
    const messages: MessageParam[] = [...cacheLastMessage(trimmed.filter((m) => typeof m.content === 'string' && m.content.trim())), { role: 'user', content: body.message }]

    return streamClaudeText(
      ROUTE,
      {
        model: MODELS.deep,
        max_tokens: 4096,
        system: [
          { type: 'text', text: withLanguage(stableBlock), cache_control: { type: 'ephemeral', ttl: '1h' } },
          { type: 'text', text: volatileBlock },
        ],
        messages,
      },
      async (fullText) => {
        let proposed: string | null = null
        if (canPropose) {
          const m = fullText.match(PROPOSAL_RE)
          if (m && m[1].trim()) proposed = m[1].trim()
        }
        const spoken = stripProposals(fullText).trim()
        if (spoken) {
          const { error } = await auth.supabase
            .from('studio_draft_messages')
            .insert({ user_id: auth.user.id, draft_id: draft.id, role: 'companion', text: spoken })
          if (error) console.error('[studio] draft message insert failed:', error.message)
        }
        return { proposed_edit: proposed, section_id: proposed ? focused?.id ?? null : null, selected_text: proposed ? body.selected_text : null }
      }
    )
  })
}
