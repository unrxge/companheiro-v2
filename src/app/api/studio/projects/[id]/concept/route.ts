// POST /api/studio/projects/:id/concept — a piece's core concept, changed
// after it was locked. The vision room and the concept on the writing page
// both change it here, so the two always read the same.
//   { action: 'edit', node_id, field, text, from }           core_truth | intent (the conviction) | emotional_journey
//   { action: 'add_thread', node_id, text, from }            an open thread written in
//   { action: 'remove_thread', node_id, text, from }         no longer a question
//   { action: 'settle_thread', node_id, text, answer, why?, from }  answered: it leaves the open threads and is kept as decided
//   { action: 'apply', id, text? }                           a change heard in the vision room's talk, accepted (Direction)
//   { action: 'decline', id }                                not this; never offered again (Direction)
//   { action: 'apply_all' }                                  every change waiting, accepted as offered (Direction)
// `from` is 'room' or 'concept': which side it was made on, kept with the date.
//
// Editing a concept is open on every plan, like the writing page it sits on;
// the changes that come out of the vision room's talk are Direction's, as the
// room is.

import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, conflict, isRecord, isString, isUuid, nowIso, readJson, requireProject, withAuth } from '@/lib/studio/db'
import { assertFeature, assertProjectIdWorkable } from '@/lib/studio/plan-access'
import { normalise } from '@/lib/studio/talk/verbatim'
import { addOpenThread, editConcept, removeOpenThread, requirePiece, setOpenThreads } from '@/lib/studio/vision/concept'
import { changeVision, visionOf } from '@/lib/studio/vision/store'
import { isConceptField, type KeptLine, type VisionState } from '@/lib/studio/vision/types'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body) || !isString(body.action)) throw badRequest('action required')
    const project = await requireProject(auth, id)
    await assertProjectIdWorkable(auth, project.id)
    const source = body.from === 'room' ? 'room' as const : 'concept' as const
    const text = isString(body.text) ? body.text : ''
    let nodeId = isUuid(body.node_id) ? body.node_id : null

    switch (body.action) {
      case 'edit': {
        if (!nodeId) throw badRequest('node_id required')
        if (!isConceptField(body.field)) throw badRequest('field must be core_truth, intent or emotional_journey')
        await editConcept(auth, project.id, { nodeId, field: body.field, text, source })
        break
      }
      case 'add_thread':
        if (!nodeId) throw badRequest('node_id required')
        await addOpenThread(auth, project.id, { nodeId, text, source })
        break
      case 'remove_thread':
        if (!nodeId) throw badRequest('node_id required')
        await removeOpenThread(auth, project.id, { nodeId, text, source })
        break
      case 'settle_thread': {
        if (!nodeId) throw badRequest('node_id required')
        const answer = isString(body.answer) ? body.answer.replace(/\s+/g, ' ').trim().slice(0, 220) : ''
        if (!answer) throw badRequest('say what was decided')
        const why = isString(body.why) ? body.why.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
        const decided: KeptLine = { id: crypto.randomUUID(), kind: 'decision', node_id: nodeId, text: answer, why, quote: '', at: nowIso(), state: 'kept' }
        await removeOpenThread(auth, project.id, {
          nodeId, text, source, answer,
          also: (now) => ({ ...now, kept: [...now.kept, decided].slice(-80) }),
        })
        break
      }
      case 'apply':
      case 'apply_all': {
        await assertFeature(auth, 'visionTalk')
        const waiting = visionOf(project.settings).pending_changes
        const chosen = body.action === 'apply_all' ? waiting : waiting.filter((c) => c.id === body.id)
        if (chosen.length === 0) throw conflict('already answered')
        for (const pending of chosen) {
          nodeId = pending.node_id
          const words = body.action === 'apply' && text.trim() ? text : pending.to
          const done = (now: VisionState) => ({ ...now, pending_changes: now.pending_changes.filter((c) => c.id !== pending.id) })
          if (pending.field === 'open_threads') await setOpenThreads(auth, project.id, { nodeId, text: words, source: 'talk', also: done })
          else await editConcept(auth, project.id, { nodeId, field: pending.field, text: words, source: 'talk', also: done })
        }
        break
      }
      case 'decline': {
        await assertFeature(auth, 'visionTalk')
        await changeVision(auth, project.id, (now) => {
          const pending = now.pending_changes.find((c) => c.id === body.id)
          if (!pending) throw conflict('already answered')
          return {
            ...now,
            pending_changes: now.pending_changes.filter((c) => c.id !== pending.id),
            declined: [...now.declined, normalise(pending.to)].slice(-60),
          }
        })
        break
      }
      default:
        throw badRequest('unknown action')
    }

    const vision = visionOf((await requireProject(auth, project.id)).settings)
    const node = nodeId ? await requirePiece(auth, project.id, nodeId) : null
    return NextResponse.json({
      node: node && { id: node.id, core_truth: node.core_truth, intent: node.intent, emotional_journey: node.emotional_journey, open_threads: node.open_threads ?? [] },
      kept: vision.kept,
      changes: vision.changes,
      pending_changes: vision.pending_changes,
    })
  })
}
