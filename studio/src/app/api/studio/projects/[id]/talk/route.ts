// POST /api/studio/projects/:id/talk — one request, one stream (8.2, D-054):
// the person's entry is inserted, the sort starts on MODELS.fast at once, the reply
// streams from MODELS.deep, and the meta frame (after the last token) carries the
// applied arrivals, compass rows and a catch if one was confirmed.
// GET — history for one kind, `before` paging, oldest → newest within the page.

import { NextResponse, type NextRequest } from 'next/server'
import { requireUser, type AuthedContext } from '@/lib/supabase/route'
import { COMPANION_TONE } from '@/lib/companion-tone'
import { withLanguage } from '@/lib/language'
import { MODELS } from '@/lib/models'
import { cacheLastMessage } from '@/lib/prompt-cache'
import { streamClaudeText } from '@/lib/streaming'
import {
  badRequest, errorResponse, fromDbError, isRecord, isString, isUuid, notFound, nowIso, readJson, requireProject, unauthorized, withAuth,
} from '@/lib/studio/db'
import type { Project, TalkEntry, TalkKind, TalkMeta, TalkRequest, TalkSort } from '@/lib/studio/types'
import { buildTalkContext, type TalkContext } from '@/lib/studio/talk/context'
import { ASK_BLOCK, DIRECTION_ROLE, TALK_ROLE } from '@/lib/studio/talk/prompts'
import { sortDirection, sortTalk } from '@/lib/studio/talk/sort'
import { applySort, EMPTY_APPLIED } from '@/lib/studio/talk/apply'
import { maybeCatch } from '@/lib/studio/talk/catch'

export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

const SORT_TIMEOUT_MS = 12_000
const HISTORY_DEFAULT = 40
const HISTORY_MAX = 100
const ENTRY_COLUMNS = 'id, project_id, kind, role, input, text, reply_to, catch_id, sorted_at, truncated, created_at'

const isKind = (v: unknown): v is TalkKind => v === 'talk' || v === 'direction'

function parseTalkRequest(body: unknown): TalkRequest {
  if (!isRecord(body)) throw badRequest('body required')
  const text = isString(body.text) ? body.text.trim() : ''
  if (!text) throw badRequest('text required')
  if (text.length > 20_000) throw badRequest('text too long')
  const input = body.input === 'voice' ? 'voice' : 'typed'
  const kind: TalkKind = isKind(body.kind) ? body.kind : 'talk'
  return { text, input, kind }
}

/** Resolves to the sort, or null when it has not answered in time (the entry then stays unsorted for the sweep). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms)
    p.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) }
    )
  })
}

async function insertPersonEntry(auth: AuthedContext, project: Project, req: TalkRequest): Promise<string> {
  const { data, error } = await auth.supabase
    .from('studio_talk_entries')
    .insert({
      user_id: auth.user.id,
      project_id: project.id,
      kind: req.kind,
      role: 'person',
      input: req.input,
      text: req.text,
    })
    .select('id')
    .single()
  if (error) throw fromDbError(error)
  return (data as { id: string }).id
}

async function insertCompanionEntry(auth: AuthedContext, project: Project, id: string, kind: TalkKind, text: string, replyTo: string): Promise<void> {
  const { error } = await auth.supabase.from('studio_talk_entries').insert({
    id,
    user_id: auth.user.id,
    project_id: project.id,
    kind,
    role: 'companion',
    text,
    reply_to: replyTo,
  })
  if (error) throw fromDbError(error)
}

async function markAsked(auth: AuthedContext, ctx: TalkContext): Promise<void> {
  const c = ctx.commitmentToAsk
  if (!c) return
  const { error } = await auth.supabase
    .from('studio_compass_entries')
    .update({ asked_at: nowIso(), ask_count: c.ask_count + 1 })
    .eq('id', c.id)
  if (error) throw fromDbError(error)
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    const auth = await requireUser()
    if (!auth) return unauthorized()
    const body = parseTalkRequest(await readJson(req))
    if (!isUuid(id)) throw notFound()
    const project = await requireProject(auth, id)

    const ctx = await buildTalkContext(auth, project, body.kind)
    const personId = await insertPersonEntry(auth, project, body)
    const companionId = crypto.randomUUID()

    const sortPromise: Promise<TalkSort> = body.kind === 'talk'
      ? sortTalk(auth, ctx, body.text, personId)
      : sortDirection(auth, ctx, body.text, personId)
    // the rejection is handled inside buildMeta; this only keeps it from surfacing as unhandled meanwhile
    sortPromise.catch(() => {})

    const ask = body.kind === 'talk' && ctx.commitmentToAsk ? ASK_BLOCK(ctx.commitmentToAsk) : ''
    const system = withLanguage(
      [COMPANION_TONE, body.kind === 'talk' ? TALK_ROLE : DIRECTION_ROLE, ctx.text, ask].filter((s) => s.length > 0).join('\n\n')
    )

    const emptyMeta = (): Omit<TalkMeta, 'truncated'> => ({
      person_entry_id: personId,
      companion_entry_id: companionId,
      applied: EMPTY_APPLIED,
      blocks: [],
      compass: [],
      catch: null,
    })

    return streamClaudeText(
      'studio/talk',
      {
        model: MODELS.deep,
        max_tokens: body.kind === 'direction' ? 2048 : 1024,
        system,
        messages: [...cacheLastMessage(ctx.priorTurns), { role: 'user', content: body.text }],
      },
      async (fullText) => {
        try {
          await insertCompanionEntry(auth, project, companionId, body.kind, fullText, personId)
          if (ask) await markAsked(auth, ctx)

          const sort = await withTimeout(sortPromise, SORT_TIMEOUT_MS)
          if (!sort) {
            console.error('[studio] sort timed out; entry left for the sweep:', personId)
            return emptyMeta()
          }
          const applied = await applySort(auth, project, personId, sort, ctx)
          const caught = await maybeCatch(auth, project, personId, sort, ctx)
          const meta: Omit<TalkMeta, 'truncated'> = {
            person_entry_id: personId,
            companion_entry_id: companionId,
            applied: {
              block_ids: applied.block_ids,
              compass_pending_ids: applied.compass_pending_ids,
              reinforced_ids: applied.reinforced_ids,
              suggest_done_ids: applied.suggest_done_ids,
            },
            blocks: applied.rows,
            compass: applied.compassRows,
            catch: caught,
          }
          return meta
        } catch (e) {
          // sorted_at stays null so the next open's sweep retries
          console.error('[studio] talk meta failed:', e)
          return emptyMeta()
        }
      }
    )
  } catch (e) {
    return errorResponse(e)
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    if (!isUuid(id)) throw notFound()
    await requireProject(auth, id)
    const url = new URL(req.url)
    const kindParam = url.searchParams.get('kind')
    const kind: TalkKind = isKind(kindParam) ? kindParam : 'talk'
    const limitParam = Number(url.searchParams.get('limit') ?? HISTORY_DEFAULT)
    const limit = Number.isFinite(limitParam) ? Math.min(HISTORY_MAX, Math.max(1, Math.floor(limitParam))) : HISTORY_DEFAULT
    const before = url.searchParams.get('before')
    if (before && Number.isNaN(Date.parse(before))) throw badRequest('before must be a timestamp')

    let q = auth.supabase
      .from('studio_talk_entries')
      .select(ENTRY_COLUMNS)
      .eq('project_id', id)
      .eq('kind', kind)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (before) q = q.lt('created_at', before)
    const { data, error } = await q
    if (error) throw fromDbError(error)
    const entries = (((data as unknown) as TalkEntry[] | null) ?? []).reverse()
    return NextResponse.json({ entries })
  })
}
