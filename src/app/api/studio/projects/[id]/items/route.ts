// GET /api/studio/projects/:id/items — the images, recordings and task lists
// on a project's canvas, the files behind them (as signed urls) and every
// task of its pieces, in one round trip.
// POST — put one down, from a piece's "+".
//
// Kept apart from the tree: a database that has not had migration 028 yet
// answers `ready: false` here, and the canvas carries on with its pieces and
// threads exactly as before.

import { NextResponse, type NextRequest } from 'next/server'
import {
  badRequest, fromDbError, isRecord, isUuid, readJson, requireProject, signAssets, withAuth,
} from '@/lib/studio/db'
import { assertFeature, assertWorkable } from '@/lib/studio/plan-access'
import { cleanContent, ITEM_COLS, KINDS, normaliseItem, ownRoots } from '@/lib/studio/board-items-db'
import type { BoardItemKind, ItemsPayload, ProjectTask } from '@/lib/studio/board-items'
import type { Asset } from '@/lib/studio/types'
import { readTasks } from '@/lib/studio/tasks-db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const project = await requireProject(auth, id)
    const [itemsRes, tasksRes] = await Promise.all([
      auth.supabase.from('studio_board_items').select(ITEM_COLS).eq('project_id', project.id).eq('user_id', auth.user.id).order('created_at', { ascending: true }),
      readTasks(auth, { project_id: project.id }),
    ])
    const tasks: ProjectTask[] = tasksRes.tasks.filter((t) => !!t.node_id)
    if (itemsRes.error) {
      // The table is not there yet (migration 028). Not an error to show anyone.
      console.warn('[studio] board items unavailable:', itemsRes.error.message)
      return NextResponse.json({ ready: false, items: [], assets: [], tasks } satisfies ItemsPayload)
    }
    const items = (itemsRes.data ?? []).map(normaliseItem)
    const assetIds = [...new Set(items.map((i) => i.asset_id).filter((x): x is string => !!x))]
    let assets: Awaited<ReturnType<typeof signAssets>> = []
    if (assetIds.length > 0) {
      const { data, error } = await auth.supabase.from('studio_assets').select('*').in('id', assetIds).eq('user_id', auth.user.id)
      if (error) throw fromDbError(error)
      assets = await signAssets(auth, (data as Asset[] | null) ?? [])
    }
    return NextResponse.json({ ready: true, items, assets, tasks } satisfies ItemsPayload)
  })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withAuth(async (auth) => {
    const body = await readJson(req)
    if (!isRecord(body)) throw badRequest('body required')
    if (typeof body.kind !== 'string' || !KINDS.has(body.kind)) throw badRequest('kind must be image, recording or tasks')
    const kind = body.kind as BoardItemKind

    const project = await requireProject(auth, id)
    await assertWorkable(auth, project)

    let asset_id: string | null = null
    if (kind !== 'tasks') {
      await assertFeature(auth, 'media')
      if (!isUuid(body.asset_id)) throw badRequest('asset_id required')
      const { data: asset, error } = await auth.supabase
        .from('studio_assets')
        .select('id, kind, project_id')
        .eq('id', body.asset_id)
        .eq('user_id', auth.user.id)
        .maybeSingle()
      if (error) throw fromDbError(error)
      const a = asset as { id: string; kind: string; project_id: string } | null
      if (!a || a.project_id !== project.id) throw badRequest('that file is not part of this project')
      if (a.kind !== (kind === 'image' ? 'image' : 'audio')) throw badRequest('that file is the wrong kind')
      asset_id = a.id
    }

    const node_ids = body.node_id ? await ownRoots(auth, project.id, [body.node_id]) : []
    const { data, error } = await auth.supabase
      .from('studio_board_items')
      .insert({
        user_id: auth.user.id,
        project_id: project.id,
        kind,
        asset_id,
        node_ids,
        content: cleanContent(kind, body.content),
      })
      .select(ITEM_COLS)
      .single()
    if (error || !data) throw fromDbError(error)
    return NextResponse.json({ item: normaliseItem(data) }, { status: 201 })
  })
}
