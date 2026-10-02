// POST /api/studio/projects/:id/carried — { action: 'accept' | 'decline', id, name?, piece_ids? }
//
// The answer to a card left on the project from a check-in. Accepting adds it
// to the project for good, as a thread: their words become what the thread
// holds, under the name they gave it (or none yet), running through the
// pieces they chose. A thread only shows on the board once it touches a piece,
// so at least one is required; a project of one piece uses that piece.
// Declining only removes the card.

import { NextResponse, type NextRequest } from 'next/server'
import {
  badRequest, fromDbError, isRecord, isString, readJson, requireProject, withAuth,
} from '@/lib/studio/db'
import { assertWorkable, entitlementsOf } from '@/lib/studio/plan-access'
import type { ThreadHue } from '@/lib/studio/node-types'
import type { CarriedThought } from '@/lib/studio/types'

type Params = { params: Promise<{ id: string }> }
const HUES: ThreadHue[] = ['ember', 'verdant', 'violet', 'ochre', 'tide']

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')
    const action = body.action === 'accept' ? 'accept' : body.action === 'decline' ? 'decline' : null
    if (!action) throw badRequest('action must be accept or decline')

    const project = await requireProject(auth, id)
    const settings = (project.settings ?? {}) as unknown as Record<string, unknown> & { carried?: CarriedThought[] }
    const waiting = Array.isArray(settings.carried) ? settings.carried : []
    const card = waiting.find((c) => c.id === body.id)
    if (!card) throw badRequest('that card is gone')

    let threadId: string | null = null
    let fragment = false
    // Without threads (Practice), their words are kept as a fragment instead:
    // the same thing a line saved from the writing page is.
    if (action === 'accept' && !(await entitlementsOf(auth)).threads) {
      await assertWorkable(auth, project)
      const { error } = await auth.supabase
        .from('studio_anchor_lines')
        .insert({ user_id: auth.user.id, project_id: project.id, node_id: null, text: card.text.slice(0, 4000) })
      if (error) throw fromDbError(error)
      fragment = true
    } else if (action === 'accept') {
      await assertWorkable(auth, project)
      const [{ count }, { data: roots }] = await Promise.all([
        auth.supabase.from('studio_threads').select('id', { count: 'exact', head: true }).eq('project_id', project.id).eq('user_id', auth.user.id),
        auth.supabase.from('studio_nodes').select('id').eq('project_id', project.id).eq('user_id', auth.user.id).is('parent_id', null),
      ])
      const all = (roots ?? []).map((r) => r.id as string)
      const chosen = all.length === 1
        ? all
        : Array.isArray(body.piece_ids) ? [...new Set(body.piece_ids.filter((x): x is string => isString(x) && all.includes(x)))] : []
      if (chosen.length === 0) throw badRequest('choose at least one piece it runs through')
      const position = count ?? 0
      const { data: thread, error } = await auth.supabase
        .from('studio_threads')
        .insert({
          user_id: auth.user.id,
          project_id: project.id,
          position,
          name: isString(body.name) ? body.name.replace(/\s+/g, ' ').trim().slice(0, 120) : '',
          intent: card.text.slice(0, 4000),
          hue: HUES[position % HUES.length],
        })
        .select('id')
        .single()
      if (error || !thread) throw fromDbError(error)
      threadId = thread.id as string
      const { error: tagErr } = await auth.supabase
        .from('studio_node_threads')
        .insert(chosen.map((nodeId) => ({ node_id: nodeId, thread_id: threadId, user_id: auth.user.id, note: '' })))
      if (tagErr) throw fromDbError(tagErr)
    }

    const { error: saveErr } = await auth.supabase
      .from('studio_projects')
      .update({ settings: { ...settings, carried: waiting.filter((c) => c.id !== card.id) } })
      .eq('id', project.id)
      .eq('user_id', auth.user.id)
    if (saveErr) throw fromDbError(saveErr)
    return NextResponse.json({ thread_id: threadId, fragment })
  })
}
