// PATCH /api/studio/items/:itemId — move it, resize it, connect it to other
// pieces, or change what it holds (a caption, a name, its own tasks).
// DELETE — take it off the canvas; an image or recording's file goes with it.

import { NextResponse, type NextRequest } from 'next/server'
import { badRequest, fromDbError, isRecord, MEDIA_BUCKET, noContent, readJson, requireProject, withAuth } from '@/lib/studio/db'
import { assertWorkable } from '@/lib/studio/plan-access'
import { cleanContent, cleanCoord, cleanWidth, ITEM_COLS, normaliseItem, ownRoots, requireItem } from '@/lib/studio/board-items-db'

type Params = { params: Promise<{ itemId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { itemId } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')
    const item = await requireItem(auth, itemId)
    await assertWorkable(auth, await requireProject(auth, item.project_id))

    const patch: Record<string, unknown> = {}
    if (body.board_x !== undefined) patch.board_x = cleanCoord(body.board_x, 'board_x')
    if (body.board_y !== undefined) patch.board_y = cleanCoord(body.board_y, 'board_y')
    if (body.w !== undefined) patch.w = cleanWidth(item.kind, body.w)
    if (body.node_ids !== undefined) patch.node_ids = await ownRoots(auth, item.project_id, body.node_ids)
    // Merged, so a caption edit never drops anything else the item holds.
    if (body.content !== undefined) patch.content = { ...item.content, ...cleanContent(item.kind, body.content) }
    if (Object.keys(patch).length === 0) throw badRequest('nothing to change')

    const { data, error } = await auth.supabase
      .from('studio_board_items')
      .update(patch)
      .eq('id', item.id)
      .eq('user_id', auth.user.id)
      .select(ITEM_COLS)
      .single()
    if (error || !data) throw fromDbError(error)
    return NextResponse.json({ item: normaliseItem(data) })
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { itemId } = await params
  return withAuth(async (auth) => {
    const item = await requireItem(auth, itemId)
    await assertWorkable(auth, await requireProject(auth, item.project_id))

    const { error } = await auth.supabase.from('studio_board_items').delete().eq('id', item.id).eq('user_id', auth.user.id)
    if (error) throw fromDbError(error)

    // The file is only ever shown through this item, so it leaves with it.
    // Best effort: a file left behind is storage to tidy, not a failed delete.
    if (item.asset_id) {
      const { count } = await auth.supabase
        .from('studio_board_items')
        .select('id', { count: 'exact', head: true })
        .eq('asset_id', item.asset_id)
        .eq('user_id', auth.user.id)
      if (!count) {
        const { data: asset } = await auth.supabase
          .from('studio_assets')
          .select('storage_path, thumb_path')
          .eq('id', item.asset_id)
          .eq('user_id', auth.user.id)
          .maybeSingle()
        const paths = [asset?.storage_path, asset?.thumb_path].filter((p): p is string => typeof p === 'string' && !!p)
        if (paths.length) {
          const removed = await auth.supabase.storage.from(MEDIA_BUCKET).remove(paths)
          if (removed.error) console.error('[studio] item file not removed:', removed.error.message)
        }
        const gone = await auth.supabase.from('studio_assets').delete().eq('id', item.asset_id).eq('user_id', auth.user.id)
        if (gone.error) console.error('[studio] item asset row not removed:', gone.error.message)
      }
    }
    return noContent()
  })
}
