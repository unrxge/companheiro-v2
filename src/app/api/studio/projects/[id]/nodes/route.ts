// POST /api/studio/projects/:id/nodes — makes a node. `parent_id` null puts it
// at the top of the project; anything else nests it. `after_id` inserts it
// straight after a sibling (the storyline's "add here"), otherwise it appends.

import { NextResponse, type NextRequest } from 'next/server'
import {
  badRequest, fromDbError, isRecord, isUuid, readJson,
  requireProject, withAuth,
} from '@/lib/studio/db'
import { assertWorkable } from '@/lib/studio/plan-access'
import { NODE_COLS, clampText, nextPosition, normaliseNode, requireNode } from '@/lib/studio/nodes-db'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')

    const project = await requireProject(auth, id)
    await assertWorkable(auth, project)

    let parentId: string | null = null
    if (body.parent_id !== undefined && body.parent_id !== null) {
      if (!isUuid(body.parent_id)) throw badRequest('parent_id must be an id')
      const parent = await requireNode(auth, body.parent_id)
      if (parent.project_id !== project.id) throw badRequest('a node never leaves its project')
      parentId = parent.id
    }

    // Position: after a named sibling, or at the end.
    let position = await nextPosition(auth, project.id, parentId)
    if (body.after_id !== undefined && body.after_id !== null) {
      if (!isUuid(body.after_id)) throw badRequest('after_id must be an id')
      const sibling = await requireNode(auth, body.after_id)
      if (sibling.parent_id !== parentId) throw badRequest('after_id must share the parent')
      position = sibling.position + 1
      // Shift everything at or past the slot down by one.
      const { data: later, error: laterErr } = await auth.supabase
        .from('studio_nodes')
        .select('id, position')
        .eq('project_id', project.id)
        .eq('user_id', auth.user.id)
        .gte('position', position)
      if (laterErr) throw fromDbError(laterErr)
      const shift = (later ?? []).filter((r: { id: string }) => r.id !== sibling.id)
      for (const row of shift as Array<{ id: string; position: number }>) {
        const { error } = await auth.supabase
          .from('studio_nodes')
          .update({ position: row.position + 1 })
          .eq('id', row.id)
          .eq('user_id', auth.user.id)
        if (error) throw fromDbError(error)
      }
    }

    // "Use the project's concept": the new piece starts with the concept the
    // project already has as its own. The project's own when it was worked out
    // as a project of several pieces; otherwise the first piece's, which for a
    // project made from one concept is the same thing.
    let concept: Record<string, unknown> = {}
    if (body.adopt_concept === true && parentId === null) {
      const own = project.settings?.concept
      if (own && own.core_truth) {
        concept = { intent: own.intent, core_truth: own.core_truth, emotional_journey: own.emotional_journey, open_threads: own.open_threads ?? [] }
      } else {
        const { data: first, error: firstErr } = await auth.supabase
          .from('studio_nodes')
          .select('intent, core_truth, emotional_journey, open_threads')
          .eq('project_id', project.id)
          .eq('user_id', auth.user.id)
          .is('parent_id', null)
          .not('core_truth', 'is', null)
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (firstErr) throw fromDbError(firstErr)
        if (first) concept = first as Record<string, unknown>
      }
      if (!concept.core_truth) throw badRequest('this project has no concept to take yet')
    }

    const { data, error } = await auth.supabase
      .from('studio_nodes')
      .insert({
        user_id: auth.user.id,
        project_id: project.id,
        parent_id: parentId,
        position,
        title: body.title === undefined ? '' : clampText(body.title, 'title', 'title'),
        intent: body.intent === undefined ? '' : clampText(body.intent, 'intent', 'intent'),
        beat: body.beat === undefined ? '' : clampText(body.beat, 'beat', 'beat'),
        stands_whole: body.stands_whole === true || !!concept.core_truth,
        ...(concept.core_truth ? {
          intent: String(concept.intent ?? ''),
          core_truth: String(concept.core_truth),
          emotional_journey: String(concept.emotional_journey ?? ''),
          open_threads: Array.isArray(concept.open_threads) ? concept.open_threads : [],
        } : {}),
      })
      .select(NODE_COLS)
      .single()
    if (error) throw fromDbError(error)
    return NextResponse.json({ node: normaliseNode(data) }, { status: 201 })
  })
}
