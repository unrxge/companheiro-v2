// POST /api/studio/projects/:id/vision/rethink — { conversation_id? }
// Brings a conversation into the core concept: reads it whole against each
// piece's concept and offers the concept as it now stands, one part at a time
// (lib/studio/vision/rethink.ts). Nothing changes until each part is accepted.
// Answers { pending_changes, nothing }: everything now waiting, and whether
// the conversation moved any concept at all.

import { NextResponse, type NextRequest } from 'next/server'
import { aiGate } from '@/lib/billing/fair-use'
import { fromDbError, isRecord, isUuid, readJson, requireProject, withAuth } from '@/lib/studio/db'
import { assertFeature, assertProjectIdWorkable } from '@/lib/studio/plan-access'
import { conversationsReady, findConversation } from '@/lib/studio/vision/conversations'
import { rethinkConcept } from '@/lib/studio/vision/rethink'
import { loadCanvas, visionOf } from '@/lib/studio/vision/store'
import { splitSources } from '@/lib/studio/vision/types'

export const maxDuration = 120

type Params = { params: Promise<{ id: string }> }

/** The latest of a long conversation is where it got to; this much is read. */
const READ_LAST = 80

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const gated = await aiGate(auth)
    if (gated) return gated
    const body = await readJson(req).catch(() => null)
    const project = await requireProject(auth, id)
    await assertProjectIdWorkable(auth, project.id)
    await assertFeature(auth, 'visionTalk')

    let q = auth.supabase
      .from('studio_vision_messages')
      .select('role, text, created_at')
      .eq('project_id', project.id)
      .eq('user_id', auth.user.id)
      .is('node_id', null)
      .order('created_at', { ascending: false })
      .limit(READ_LAST)
    const asked = isRecord(body) && isUuid(body.conversation_id) ? body.conversation_id : null
    if (asked && (await conversationsReady(auth)) && (await findConversation(auth, project.id, asked))) q = q.eq('conversation_id', asked)
    const [{ data, error }, canvas] = await Promise.all([q, loadCanvas(auth, project)])
    if (error) throw fromDbError(error)

    const conversation = ((data as Array<{ role: string; text: string }> | null) ?? [])
      .slice()
      .reverse()
      .map((m) => ({ role: m.role === 'companion' ? 'companion' as const : 'person' as const, text: splitSources(m.text).text }))
    const vision = visionOf(project.settings)
    const result = await rethinkConcept(auth, {
      projectId: project.id,
      intent: project.intent || '',
      conversation,
      vision,
      pieces: canvas.roots.map((r) => ({
        id: r.id, title: r.title || 'untitled', core_truth: r.core_truth ?? '', intent: r.intent ?? '',
        emotional_journey: r.emotional_journey ?? '', open_threads: (r.open_threads ?? []).filter((x) => x && x.trim()),
      })),
    })
    const after = visionOf((await requireProject(auth, project.id)).settings)
    return NextResponse.json({ pending_changes: after.pending_changes, nothing: result.nothing })
  })
}
