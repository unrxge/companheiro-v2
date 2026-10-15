// Past conversations in the vision room (migration 035). Server only.
//
// A project holds as many conversations as the person starts. Each gets a
// short title and a one-line summary once it has some substance, written by
// the fast model from the conversation itself and rewritten as it moves on,
// so the list of past ones says what each was about. Opening one carries on
// where it stopped.
//
// Before migration 035 there is one conversation per project, as there always
// was: `conversationsReady` says which, and every caller works either way.

import type { AuthedContext } from '@/lib/supabase/route'
import { anthropic } from '@/lib/anthropic'
import { MODELS } from '@/lib/models'
import { logUsage } from '@/lib/usage-log'
import { fromDbError, nowIso } from '@/lib/studio/db'
import { firstText, parseJsonObject } from '@/lib/studio/talk/sort'
import { splitSources, type VisionConversation } from './types'

type DbError = { code?: string; message?: string } | null

/** The table or the column from migration 035 is not there yet. */
export const missing035 = (e: DbError) =>
  !!e && (e.code === '42P01' || e.code === '42703' || e.code === 'PGRST205' || e.code === 'PGRST204' || /conversation/i.test(e.message ?? ''))

export async function conversationsReady(auth: AuthedContext): Promise<boolean> {
  const { error } = await auth.supabase.from('studio_vision_messages').select('conversation_id').limit(1)
  if (!error) return true
  if (missing035(error)) return false
  throw fromDbError(error)
}

/** The conversation, checked to be this project's and this person's; null when it is not. */
export async function findConversation(auth: AuthedContext, projectId: string, id: string): Promise<{ id: string } | null> {
  const { data, error } = await auth.supabase
    .from('studio_vision_conversations')
    .select('id, project_id')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) throw fromDbError(error)
  const row = data as { id: string; project_id: string } | null
  return row && row.project_id === projectId ? { id: row.id } : null
}

/** The one touched last, which is where the room opens. */
export async function latestConversation(auth: AuthedContext, projectId: string): Promise<string | null> {
  const { data, error } = await auth.supabase
    .from('studio_vision_conversations')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
  if (error) throw fromDbError(error)
  return (data as Array<{ id: string }> | null)?.[0]?.id ?? null
}

export async function startConversation(auth: AuthedContext, projectId: string): Promise<string> {
  const { data, error } = await auth.supabase
    .from('studio_vision_conversations')
    .insert({ user_id: auth.user.id, project_id: projectId })
    .select('id')
    .single()
  if (error) throw fromDbError(error)
  return (data as { id: string }).id
}

export async function touchConversation(auth: AuthedContext, id: string): Promise<void> {
  await auth.supabase.from('studio_vision_conversations').update({ updated_at: nowIso() }).eq('id', id).eq('user_id', auth.user.id)
}

export async function listConversations(auth: AuthedContext, projectId: string): Promise<VisionConversation[]> {
  const { data, error } = await auth.supabase
    .from('studio_vision_conversations')
    .select('id, title, summary, created_at, updated_at, studio_vision_messages(count)')
    .eq('project_id', projectId)
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) throw fromDbError(error)
  return ((data as Array<Record<string, unknown>> | null) ?? []).map((r) => ({
    id: String(r.id),
    title: String(r.title ?? ''),
    summary: String(r.summary ?? ''),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    messages: Array.isArray(r.studio_vision_messages) ? Number((r.studio_vision_messages[0] as { count?: number })?.count ?? 0) : 0,
  }))
    // A conversation opened and left without a word is not worth listing.
    .filter((c) => c.messages > 0)
}

/** A title is first written after two exchanges, and again every twelve messages after that. */
const FIRST_TITLE_AT = 4
const RETITLE_EVERY = 12

const TITLE_SYSTEM = `You name a conversation someone had about the vision of one of their creative projects, so they can find it again in a list. JSON only, no prose, no code fence.

"title": three to seven words saying what the conversation was actually about, in the language they spoke. Plain and specific: "Who the second film is for", "Cutting the song, keeping two pieces". Not the project's name, not a label like "Vision discussion", no quotation marks.
"summary": one sentence, under twenty-five words, saying where it got to: what was settled, or what was left open. Plain, in their language, never praise.

Output exactly: {"title": "…", "summary": "…"}`

/**
 * Writes or rewrites the title once there is enough to name. Runs after a
 * reply has been sent; a failure here only leaves the old title in place.
 */
export async function maybeTitle(auth: AuthedContext, conversationId: string): Promise<void> {
  const [{ data: conv }, { data: rows, count }] = await Promise.all([
    auth.supabase.from('studio_vision_conversations').select('title, titled_at').eq('id', conversationId).eq('user_id', auth.user.id).maybeSingle(),
    auth.supabase
      .from('studio_vision_messages')
      .select('role, text', { count: 'exact' })
      .eq('conversation_id', conversationId)
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: true })
      .limit(40),
  ])
  const c = conv as { title: string; titled_at: number } | null
  const total = count ?? 0
  if (!c || total < FIRST_TITLE_AT) return
  if (c.title && total - c.titled_at < RETITLE_EVERY) return

  const transcript = ((rows as Array<{ role: string; text: string }> | null) ?? [])
    .map((m) => `${m.role === 'companion' ? 'Companion' : 'Them'}: ${splitSources(m.text).text.slice(0, 900)}`)
    .join('\n\n')
  const res = await anthropic.messages.create({
    model: MODELS.fast,
    max_tokens: 200,
    temperature: 0,
    system: TITLE_SYSTEM,
    messages: [{ role: 'user', content: `THE CONVERSATION:\n\n${transcript}` }],
  })
  logUsage(auth.user.id, 'studio/vision-title', res.model, res.usage)
  const raw = parseJsonObject(firstText(res.content as Array<{ type: string; text?: string }>))
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const title = typeof rec.title === 'string' ? rec.title.replace(/["“”]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90) : ''
  const summary = typeof rec.summary === 'string' ? rec.summary.replace(/\s+/g, ' ').trim().slice(0, 280) : ''
  if (!title) return
  await auth.supabase
    .from('studio_vision_conversations')
    .update({ title, summary, titled_at: total })
    .eq('id', conversationId)
    .eq('user_id', auth.user.id)
}
