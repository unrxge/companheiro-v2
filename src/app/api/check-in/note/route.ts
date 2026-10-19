// POST /api/check-in/note — { project_id, text, kind } → { item, title }
//
// The person said yes to a note understood from their check-in: it goes on
// that project's canvas as a note standing on its own, connected to no piece,
// where they will find it the next time they open the project (it can be
// moved, connected to a piece, edited or taken off there). Nothing about the
// check-in itself is stored with it.

import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, fromDbError, isRecord, isUuid, readJson, requireProject, withAuth } from '@/lib/studio/db'
import { assertFeature, assertWorkable } from '@/lib/studio/plan-access'
import { cleanContent, ITEM_COLS, normaliseItem } from '@/lib/studio/board-items-db'

export async function POST(req: NextRequest) {
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')
    if (!isUuid(body.project_id)) throw badRequest('Choose a project for it.')
    const content = cleanContent('note', {
      text: body.text,
      note: body.kind === 'reminder' ? 'reminder' : 'thought',
      from_check_in: true,
    })
    if (!content.text) throw badRequest('There is nothing to keep.')

    // Direction's (and the trial's): on Focus the card is shown greyed and never sends.
    await assertFeature(auth, 'checkInNotes')
    const project = await requireProject(auth, body.project_id)
    await assertWorkable(auth, project)

    const { data, error } = await auth.supabase
      .from('studio_board_items')
      .insert({ user_id: auth.user.id, project_id: project.id, kind: 'note', asset_id: null, node_ids: [], content })
      .select(ITEM_COLS)
      .single()
    if (error || !data) {
      // The database has not been told notes exist yet (migration 036).
      if (error?.code === '23514') {
        console.error('check-in/note: migration 036 not applied')
        return NextResponse.json({ error: 'Notes can’t be kept just yet. Try again later.', code: 'not_ready' }, { status: 503 })
      }
      throw fromDbError(error)
    }
    return NextResponse.json({ item: normaliseItem(data), title: project.title }, { status: 201 })
  })
}
