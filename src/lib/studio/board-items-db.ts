// Server-side helpers for the canvas's images, recordings and task lists.

import type { AuthedContext } from '@/lib/supabase/route'
import { badRequest, fromDbError, isFiniteNumber, isRecord, isString, isUuid, notFound } from '@/lib/studio/db'
import { itemWidth, type BoardItem, type BoardItemContent, type BoardItemKind, type OwnTask } from '@/lib/studio/board-items'

export const ITEM_COLS = 'id, user_id, project_id, kind, asset_id, node_ids, board_x, board_y, w, content, created_at, updated_at'
export const KINDS: ReadonlySet<string> = new Set(['image', 'recording', 'tasks'])

const MAX_OWN_TASKS = 100

export function normaliseItem(row: unknown): BoardItem {
  const r = row as BoardItem
  return {
    ...r,
    node_ids: Array.isArray(r.node_ids) ? r.node_ids : [],
    content: isRecord(r.content) ? (r.content as BoardItemContent) : {},
  }
}

/** Only what each kind keeps, trimmed and bounded. Unknown keys are dropped. */
export function cleanContent(kind: BoardItemKind, raw: unknown): BoardItemContent {
  if (!isRecord(raw)) return {}
  const out: BoardItemContent = {}
  if (kind === 'recording' && isString(raw.title)) out.title = raw.title.replace(/\s+/g, ' ').trim().slice(0, 120)
  if (kind === 'image' && isString(raw.caption)) out.caption = raw.caption.replace(/\s+/g, ' ').trim().slice(0, 300)
  if (kind === 'tasks') {
    if (typeof raw.writing_closed === 'boolean') out.writing_closed = raw.writing_closed
    if (Array.isArray(raw.tasks)) {
      const tasks: OwnTask[] = []
      for (const t of raw.tasks) {
        if (!isRecord(t) || !isString(t.id) || !isString(t.title)) continue
        const title = t.title.replace(/\s+/g, ' ').trim().slice(0, 200)
        if (!title) continue
        tasks.push({ id: t.id.slice(0, 64), title, done: t.done === true })
        if (tasks.length >= MAX_OWN_TASKS) break
      }
      out.tasks = tasks
    }
  }
  return out
}

export function cleanWidth(kind: BoardItemKind, raw: unknown): number | null {
  if (raw === null) return null
  if (!isFiniteNumber(raw)) throw badRequest('w must be a number or null')
  return itemWidth(kind, raw)
}

export function cleanCoord(raw: unknown, field: string): number | null {
  if (raw === null) return null
  if (!isFiniteNumber(raw)) throw badRequest(`${field} must be a number or null`)
  return Math.max(0, Math.round(raw))
}

/** The ids that really are top-level pieces of this project, in the order given. */
export async function ownRoots(auth: AuthedContext, projectId: string, raw: unknown): Promise<string[]> {
  if (!Array.isArray(raw)) throw badRequest('node_ids must be a list')
  const wanted = [...new Set(raw.filter(isUuid))].slice(0, 60)
  if (wanted.length === 0) return []
  const { data, error } = await auth.supabase
    .from('studio_nodes')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', auth.user.id)
    .is('parent_id', null)
    .in('id', wanted)
  if (error) throw fromDbError(error)
  const real = new Set(((data as Array<{ id: string }> | null) ?? []).map((r) => r.id))
  return wanted.filter((id) => real.has(id))
}

export async function requireItem(auth: AuthedContext, itemId: string): Promise<BoardItem> {
  if (!isUuid(itemId)) throw notFound()
  const { data, error } = await auth.supabase
    .from('studio_board_items')
    .select(ITEM_COLS)
    .eq('id', itemId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) throw fromDbError(error)
  if (!data) throw notFound()
  return normaliseItem(data)
}
