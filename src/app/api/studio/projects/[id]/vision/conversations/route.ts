// GET /api/studio/projects/:id/vision/conversations — the past conversations
// in this project's vision room, the one touched last first, each with the
// title and one-line summary written once it had some substance. Before
// migration 035: { ready: false, conversations: [] }.

import { NextResponse, type NextRequest } from 'next/server'
import { requireProject, withAuth } from '@/lib/studio/db'
import { assertFeature } from '@/lib/studio/plan-access'
import { conversationsReady, listConversations, maybeTitle } from '@/lib/studio/vision/conversations'

type Params = { params: Promise<{ id: string }> }

/** At most this many untitled conversations are named while the list waits. */
const NAME_WHILE_LISTING = 3

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const project = await requireProject(auth, id)
    await assertFeature(auth, 'visionTalk')
    if (!(await conversationsReady(auth))) return NextResponse.json({ ready: false, conversations: [] })
    let list = await listConversations(auth, project.id)
    // The conversation gathered from before past conversations existed, or
    // one whose naming failed, is named now rather than shown as untitled.
    const unnamed = list.filter((c) => !c.title && c.messages >= 4).slice(0, NAME_WHILE_LISTING)
    if (unnamed.length) {
      await Promise.all(unnamed.map((c) => maybeTitle(auth, c.id).catch(() => {})))
      list = await listConversations(auth, project.id)
    }
    return NextResponse.json({ ready: true, conversations: list })
  })
}
