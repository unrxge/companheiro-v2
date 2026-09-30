// POST /api/studio/projects/:id/thread-suggestions
//   { action: 'read' }                 → { suggestions }
//   { action: 'accept', id }           → { thread_id }
//   { action: 'decline', id }          → { ok }
//
// Something that runs across several pieces of one project, offered as a
// thread: a name, what it holds, the pieces it touches, and why, pointing at
// the person's own words. Never across projects, never through every piece
// (that is a project rule, not a thread), never made without their tap.
//
// Read only re-reads the pieces when they have changed since the last
// reading; the suggestions and the names already declined live in the
// project's settings, so no schema change was needed.

import { NextResponse, type NextRequest } from 'next/server'
import { anthropic } from '@/lib/anthropic'
import { aiGate } from '@/lib/billing/fair-use'
import { MODELS } from '@/lib/models'
import { htmlToPlainText } from '@/lib/rich-text'
import { logUsage } from '@/lib/usage-log'
import {
  assertProjectWritable, badRequest, fromDbError, isRecord, isString, readJson, requireProject, withAuth,
} from '@/lib/studio/db'
import type { ThreadHue } from '@/lib/studio/node-types'
import { firstText, parseJsonObject } from '@/lib/studio/talk/sort'
import { normalise } from '@/lib/studio/talk/verbatim'
import type { ThreadSuggestion } from '@/lib/studio/thread-suggestion'

type Params = { params: Promise<{ id: string }> }


interface SuggestionState {
  thread_suggestions?: ThreadSuggestion[]
  thread_signature?: string
  threads_declined?: string[]
}

const HUES: ThreadHue[] = ['ember', 'verdant', 'violet', 'ochre', 'tide']
const MIN_PIECES = 3
const EXCERPT_WORDS = 220

const SYSTEM = `You look at the pieces of one creative project, side by side, and notice what already runs across some of them: a motif, an image, a question, a person, an argument being built. You return JSON only: no prose, no code fence.

Only name something that is really there in what they wrote about the pieces: the same image in two excerpts, the same question in two intents. Never invent a theme, never judge the work, never suggest what to write.

A thread touches at least two pieces and never every piece: something in every piece is the whole project's rule, not a thread. Skip anything already covered by an existing thread, and anything under DECLINED.

For each: "name" is two to five words, plain, preferably their own words. "intent" is one sentence on what it holds across the work. "piece_ids" are the ids it runs through. "why" is one short sentence pointing at their words in two of those pieces, quoted briefly.

Most projects have zero or one. At most two. Output exactly:
{"threads": [{"name": "…", "intent": "…", "piece_ids": ["…"], "why": "…"}]}`

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')
    const action = body.action === 'accept' || body.action === 'decline' ? body.action : 'read'
    const project = await requireProject(auth, id)
    const settings = (project.settings ?? {}) as unknown as Record<string, unknown> & SuggestionState
    const stored = Array.isArray(settings.thread_suggestions) ? settings.thread_suggestions : []
    const declined = Array.isArray(settings.threads_declined) ? settings.threads_declined : []

    const save = async (patch: SuggestionState) => {
      const { error } = await auth.supabase
        .from('studio_projects')
        .update({ settings: { ...settings, ...patch } })
        .eq('id', project.id)
        .eq('user_id', auth.user.id)
      if (error) throw fromDbError(error)
    }

    // ── an answer ──────────────────────────────────────────────────────────
    if (action !== 'read') {
      const target = stored.find((s) => s.id === body.id)
      if (!isString(body.id) || !target) throw badRequest('that suggestion is gone')
      const rest = stored.filter((s) => s.id !== target.id)
      if (action === 'decline') {
        await save({ thread_suggestions: rest, threads_declined: [...declined, target.name].slice(-40) })
        return NextResponse.json({ ok: true })
      }

      assertProjectWritable(project)
      const { count } = await auth.supabase
        .from('studio_threads')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .eq('user_id', auth.user.id)
      const position = count ?? 0
      const { data: thread, error } = await auth.supabase
        .from('studio_threads')
        .insert({
          user_id: auth.user.id,
          project_id: project.id,
          position,
          name: target.name.slice(0, 120),
          intent: target.intent.slice(0, 4000),
          hue: HUES[position % HUES.length],
        })
        .select('id')
        .single()
      if (error || !thread) throw fromDbError(error)
      const { data: live } = await auth.supabase
        .from('studio_nodes')
        .select('id')
        .eq('project_id', project.id)
        .eq('user_id', auth.user.id)
        .in('id', target.piece_ids)
      const tags = (live ?? []).map((n) => ({ node_id: n.id as string, thread_id: thread.id as string, user_id: auth.user.id, note: '' }))
      if (tags.length) {
        const { error: tagErr } = await auth.supabase.from('studio_node_threads').insert(tags)
        if (tagErr) throw fromDbError(tagErr)
      }
      await save({ thread_suggestions: rest })
      return NextResponse.json({ thread_id: thread.id })
    }

    // ── a reading ──────────────────────────────────────────────────────────
    const [{ data: roots, error: rootErr }, { data: threads }, { data: tags }] = await Promise.all([
      auth.supabase
        .from('studio_nodes')
        .select('id, title, intent, core_truth, body, updated_at')
        .eq('project_id', project.id)
        .eq('user_id', auth.user.id)
        .is('parent_id', null)
        .order('position'),
      auth.supabase.from('studio_threads').select('id, name, intent').eq('project_id', project.id).eq('user_id', auth.user.id),
      auth.supabase.from('studio_node_threads').select('node_id, thread_id').eq('user_id', auth.user.id),
    ])
    if (rootErr) throw fromDbError(rootErr)
    const pieces = roots ?? []
    const pieceIds = new Set(pieces.map((p) => p.id as string))
    // Still valid: every piece it names is still here, and it is not now every piece.
    const valid = (s: ThreadSuggestion) =>
      s.piece_ids.length >= 2 && s.piece_ids.length < pieceIds.size && s.piece_ids.every((x) => pieceIds.has(x))

    if (pieces.length < MIN_PIECES) return NextResponse.json({ suggestions: [] })

    const signature = pieces.map((p) => `${p.id}:${p.updated_at}`).join('|') + `#${(threads ?? []).length}`
    if (settings.thread_signature === signature) {
      return NextResponse.json({ suggestions: stored.filter(valid) })
    }

    const gated = await aiGate(auth)
    if (gated) return NextResponse.json({ suggestions: stored.filter(valid) })

    const excerpt = (html: string) => {
      const words = htmlToPlainText(html || '').split(/\s+/).filter(Boolean)
      return words.length ? words.slice(0, EXCERPT_WORDS).join(' ') + (words.length > EXCERPT_WORDS ? '…' : '') : ''
    }
    const pieceBlock = pieces.map((p) => [
      `PIECE id ${p.id}: "${p.title || 'untitled'}"`,
      p.intent ? `  for: ${p.intent}` : '',
      p.core_truth ? `  core truth: ${p.core_truth}` : '',
      excerpt(p.body as string) ? `  opening words: ${excerpt(p.body as string)}` : '',
    ].filter(Boolean).join('\n')).join('\n\n')
    const members = new Map<string, string[]>()
    for (const t of tags ?? []) {
      if (!pieceIds.has(t.node_id as string)) continue
      members.set(t.thread_id as string, [...(members.get(t.thread_id as string) ?? []), t.node_id as string])
    }
    const threadBlock = (threads ?? []).length
      ? (threads ?? []).map((t) => `- "${t.name || 'unnamed'}"${t.intent ? `: ${t.intent}` : ''} (through ${(members.get(t.id as string) ?? []).length} pieces)`).join('\n')
      : '(none)'

    const res = await anthropic.messages.create({
      model: MODELS.fast,
      max_tokens: 600,
      temperature: 0,
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: `WHAT THE PROJECT IS FOR: ${project.intent || '(not written)'}\n\nEXISTING THREADS:\n${threadBlock}\n\nDECLINED:\n${declined.length ? declined.map((d) => `- ${d}`).join('\n') : '(none)'}\n\n${pieceBlock}`,
      }],
    })
    logUsage(auth.user.id, 'studio/thread-suggestions', res.model, res.usage, { pieces: pieces.length })

    const raw = parseJsonObject(firstText(res.content as Array<{ type: string; text?: string }>)) as { threads?: unknown } | null
    const seen = new Set([...declined, ...(threads ?? []).map((t) => t.name as string)].map(normalise))
    const fresh: ThreadSuggestion[] = []
    for (const item of Array.isArray(raw?.threads) ? raw.threads.slice(0, 2) : []) {
      if (!isRecord(item)) continue
      const name = isString(item.name) ? item.name.trim().slice(0, 80) : ''
      const intent = isString(item.intent) ? item.intent.trim().slice(0, 400) : ''
      const why = isString(item.why) ? item.why.trim().slice(0, 300) : ''
      const ids = Array.isArray(item.piece_ids) ? [...new Set(item.piece_ids.filter((x): x is string => isString(x) && pieceIds.has(x)))] : []
      const suggestion = { id: crypto.randomUUID(), name, intent, piece_ids: ids, why }
      if (!name || seen.has(normalise(name)) || !valid(suggestion)) continue
      seen.add(normalise(name))
      fresh.push(suggestion)
    }

    await save({ thread_suggestions: fresh, thread_signature: signature })
    return NextResponse.json({ suggestions: fresh })
  })
}
