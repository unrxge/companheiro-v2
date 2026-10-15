// GET/POST /api/studio/projects/:id/vision — the room where one project's
// vision is talked through. Part of Direction (entitlements: visionTalk).
//
// It is handed every word written on this project's canvas
// (lib/studio/vision/canvas-text.ts) and nothing from any other project. It
// is never handed the writing inside a piece, an image or a recording; the
// conversation inside a piece (../companion, with a node_id) is the one that
// may see prose, and it is a different conversation.
//
// It can look things up: a web search runs on Anthropic's side when the
// present state of a field would change the answer, and the pages it cites
// come back with the reply and are kept with it.
//
// While it answers, two quieter readings of what the person just said run
// beside it and only ever make offers: a rule they set (rule-proposals.ts)
// and a decision or an open question (vision/hear.ts).
//
// The conversation is the one studio_vision_messages always held for the
// whole project (node_id null), so what was said before the room existed is
// still here.

import { after, NextResponse, type NextRequest } from 'next/server'
import type { Message, MessageParam, TextBlockParam } from '@anthropic-ai/sdk/resources/messages'
import { aiGate, pickModel } from '@/lib/billing/fair-use'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { withLanguage } from '@/lib/language'
import { MODELS } from '@/lib/models'
import { cacheLastMessage } from '@/lib/prompt-cache'
import { streamClaudeText } from '@/lib/streaming'
import { badRequest, fromDbError, isRecord, isString, isUuid, readJson, requireProject, withAuth } from '@/lib/studio/db'
import type { Rule } from '@/lib/studio/node-types'
import { assertFeature, assertProjectIdWorkable } from '@/lib/studio/plan-access'
import { proposeRules, type RuleProposal } from '@/lib/studio/rule-proposals'
import { conversationsReady, findConversation, latestConversation, maybeTitle, startConversation, touchConversation } from '@/lib/studio/vision/conversations'
import { hearVision, type Heard } from '@/lib/studio/vision/hear'
import { LENS_NOTE, VISION_ROLE } from '@/lib/studio/vision/prompts'
import { keptText, loadCanvas, visionOf } from '@/lib/studio/vision/store'
import {
  cleanSources, isLens, splitSources, withSources,
  type VisionMessage, type VisionPayload,
} from '@/lib/studio/vision/types'

// Thinking, and up to three searches, before the first word: longer than a
// plain reply ever takes.
export const maxDuration = 120

type Params = { params: Promise<{ id: string }> }

const ROUTE = 'studio/vision'
// The same moving window as the conversation inside a piece: the latest
// 10–17 exchanges, shifting sixteen messages at a time so the cached prefix
// survives eight exchanges instead of being rebuilt on every turn.
const HISTORY_KEEP = 20
const HISTORY_STEP = 16
const HISTORY_FETCH = HISTORY_KEEP + HISTORY_STEP - 1
const MAX_MESSAGE = 6000
const SIDE_TIMEOUT_MS = 10_000

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  // ?conversation=<id> opens that one, =new opens none; without it the room
  // opens where it was left, in the conversation touched last.
  const asked = req.nextUrl.searchParams.get('conversation')
  return withAuth(async (auth) => {
    const project = await requireProject(auth, id)
    const ready = await conversationsReady(auth)
    let conversationId: string | null = null
    if (ready && asked !== 'new') {
      conversationId = asked && isUuid(asked)
        ? (await findConversation(auth, project.id, asked))?.id ?? null
        : await latestConversation(auth, project.id)
    }

    let q = auth.supabase
      .from('studio_vision_messages')
      .select('id, role, text, created_at')
      .eq('project_id', project.id)
      .eq('user_id', auth.user.id)
      .is('node_id', null)
      .order('created_at', { ascending: false })
      .limit(200)
    if (ready) q = conversationId ? q.eq('conversation_id', conversationId) : q.eq('id', '00000000-0000-0000-0000-000000000000')
    const [canvas, history] = await Promise.all([loadCanvas(auth, project), q])
    if (history.error) throw fromDbError(history.error)
    const vision = visionOf(project.settings)
    const messages: VisionMessage[] = ((history.data as Array<{ id: string; role: string; text: string; created_at: string }> | null) ?? [])
      .slice()
      .reverse()
      .map((m) => {
        const { text, sources } = splitSources(m.text)
        return { id: m.id, role: m.role === 'companion' ? 'companion' : 'person', text, sources, created_at: m.created_at }
      })
    return NextResponse.json({
      messages,
      conversation_id: conversationId,
      conversations: ready,
      kept: vision.kept,
      changes: vision.changes,
      pending_changes: vision.pending_changes,
      reading: vision.reading,
      stale: !!vision.reading && vision.reading.signature !== canvas.signature,
      unread: canvas.unread,
    } satisfies VisionPayload)
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
    const lens = isLens(body.lens) ? body.lens : null
    const askedConversation = isUuid(body.conversation_id) ? body.conversation_id : null

    const project = await requireProject(auth, id)
    await assertProjectIdWorkable(auth, project.id)
    await assertFeature(auth, 'visionTalk')

    const canvas = await loadCanvas(auth, project)
    const vision = visionOf(project.settings)
    const pieceName = (nodeId: string) => canvas.roots.find((r) => r.id === nodeId)?.title || null

    // ── which conversation ─────────────────────────────────────────────────
    // A message with no conversation, or one that is not this project's,
    // starts a new one. Before migration 035 there is only ever the one.
    const ready = await conversationsReady(auth)
    let conversationId: string | null = null
    if (ready) {
      conversationId = askedConversation ? (await findConversation(auth, project.id, askedConversation))?.id ?? null : null
      if (!conversationId) conversationId = await startConversation(auth, project.id)
    }

    // ── history ────────────────────────────────────────────────────────────
    let hq = auth.supabase
      .from('studio_vision_messages')
      .select('role, text, created_at', { count: 'exact' })
      .eq('project_id', project.id)
      .eq('user_id', auth.user.id)
      .is('node_id', null)
      .order('created_at', { ascending: false })
      .limit(HISTORY_FETCH)
    if (conversationId) hq = hq.eq('conversation_id', conversationId)
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
        // The pages a reply cited are for the person; the words are enough here.
        content: splitSources(m.text).text,
      }))
      // The API wants turns to alternate; a reply that failed to save would
      // leave two of theirs in a row, so neighbouring turns are joined.
      .reduce<MessageParam[]>((acc, m) => {
        const last = acc[acc.length - 1]
        if (last && last.role === m.role) last.content = `${last.content as string}\n\n${m.content as string}`
        else acc.push({ ...m })
        return acc
      }, [])

    const { data: inserted, error: insErr } = await auth.supabase.from('studio_vision_messages').insert({
      user_id: auth.user.id, project_id: project.id, node_id: null, role: 'person', text: message,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }).select('id').single()
    if (insErr) throw fromDbError(insErr)
    if (conversationId) await touchConversation(auth, conversationId)

    // ── listening beside the reply ─────────────────────────────────────────
    const liveRules = ((project.rules ?? []) as Rule[]).filter((r) => r && !r.retired_at).map((r) => r.text)
    const quiet = <T,>(what: string, p: Promise<T>, empty: T): Promise<T> =>
      Promise.race([
        p.catch((e) => { console.error(`[studio] ${what} failed:`, e); return empty }),
        new Promise<T>((resolve) => setTimeout(() => resolve(empty), SIDE_TIMEOUT_MS)),
      ])
    const rulesHeard = proposeRules(auth, {
      projectId: project.id,
      nodeId: null,
      text: message,
      intent: project.intent || '',
      rulesInForce: liveRules,
      messageId: (inserted as { id: string } | null)?.id ?? null,
      source: 'talk',
    })
    const linesHeard: Promise<Heard> = hearVision(auth, {
      projectId: project.id,
      text: message,
      intent: project.intent || '',
      vision,
      pieces: canvas.roots.map((r) => ({
        id: r.id, title: r.title || 'untitled', core_truth: r.core_truth ?? '', intent: r.intent ?? '',
        emotional_journey: r.emotional_journey ?? '', open_threads: (r.open_threads ?? []).filter((x) => x && x.trim()),
      })),
    })

    // ── the request ────────────────────────────────────────────────────────
    const model = pickModel(auth, MODELS.vision)
    // Past the soft cap the fast model stands in, and it neither searches nor
    // takes an effort level.
    const full = model === MODELS.vision
    // What changes between turns goes last, so the canvas and everything said
    // before it stay cached: what they have kept, today's date, and the note
    // for a lens they pulled.
    const now: TextBlockParam[] = [
      { type: 'text', text: message },
      {
        type: 'text',
        text: [
          `[For this turn only. TODAY: ${new Date().toISOString().slice(0, 10)}.`,
          keptText(vision, pieceName),
          full ? '' : 'You cannot search the web in this turn. If the present state of the field matters to the answer, say that you could not look it up.',
          lens ? LENS_NOTE[lens] : '',
        ].filter(Boolean).join('\n\n') + ']',
      },
    ]
    const messages: MessageParam[] = [
      ...cacheLastMessage([
        { role: 'user', content: `THE CANVAS AS IT STANDS\n\n${canvas.text}` },
        { role: 'assistant', content: 'I have it.' },
        ...past,
      ]),
      { role: 'user', content: now },
    ]

    return streamClaudeText(
      auth.user.id,
      ROUTE,
      {
        model,
        // Thinking is always on with this model and counts here, so the cap
        // is far above the length a reply is asked to keep to.
        max_tokens: 8000,
        ...(full ? {
          output_config: { effort: 'medium' as const },
          // The plain search, not the newer filtered one: tried against both
          // on 2026-10-10, only this one returns the page each sentence was
          // drawn from, and showing where it looked is the point. It also
          // answered in half the time.
          tools: [{ type: 'web_search_20250305' as const, name: 'web_search' as const, max_uses: 3 }],
        } : {}),
        system: withLanguage(`${COMPANION_TONE}\n\n${VISION_ROLE}`),
        messages,
      },
      async (fullText, finalMessage) => {
        const sources = cleanSources(citedIn(finalMessage))
        const clean = fullText.trim()
        if (clean) {
          await auth.supabase.from('studio_vision_messages').insert({
            user_id: auth.user.id, project_id: project.id, node_id: null,
            role: 'companion', text: withSources(clean, sources),
            ...(conversationId ? { conversation_id: conversationId } : {}),
          })
          // Named once there is something to name, after the reply has gone.
          if (conversationId) {
            const named = conversationId
            const name = () => maybeTitle(auth, named).catch((e) => console.error('[studio] vision title failed:', e))
            // after() keeps the function alive past the response; where it
            // cannot be reached from inside the stream, the naming just runs.
            try { after(name) } catch { void name() }
          }
        }
        const [proposals, heard] = await Promise.all([
          quiet<RuleProposal[]>('rule proposals', rulesHeard, []),
          quiet<Heard>('vision lines', linesHeard, { lines: [], changes: [] }),
        ])
        return { sources, proposals, heard: heard.lines, changes: heard.changes, conversation_id: conversationId }
      },
      { lens: lens ?? 'none', canvas: canvas.text.length },
      // The newest model declines some subjects the one before it will
      // discuss; a project about one of them still gets its conversation.
      full ? { fallbackModel: MODELS.deep } : undefined,
    )
  })
}

/** Every page a sentence of the reply was drawn from, in the order cited. */
function citedIn(message: Message): Array<{ url: string; title: string | null }> {
  const out: Array<{ url: string; title: string | null }> = []
  for (const block of message.content) {
    if (block.type !== 'text') continue
    for (const c of block.citations ?? []) {
      if (c.type === 'web_search_result_location') out.push({ url: c.url, title: c.title })
    }
  }
  return out
}
