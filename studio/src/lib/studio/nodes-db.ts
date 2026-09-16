// studio/src/lib/studio/nodes-db.ts — server-side helpers for the node tree.

import type { AuthedContext } from '@/lib/supabase/route'
import { badRequest, fromDbError, isRecord, isString, notFound } from '@/lib/studio/db'
import type { Rule, Thread, TreePayload, WorkNode } from '@/lib/studio/node-types'
import { wordCount } from '@/lib/studio/tree'

export const NODE_COLS =
  'id, user_id, project_id, parent_id, position, title, intent, beat, stands_whole, rules, body, extent, status, board_x, board_y, created_at, updated_at'
export const THREAD_COLS =
  'id, user_id, project_id, position, name, intent, rules, hue, board_x, board_y, created_at, updated_at'

const LIMITS = { title: 200, intent: 4000, beat: 500, body: 200_000, rule: 300, rules: 40 } as const

export function normaliseRules(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) return []
  const out: Rule[] = []
  for (const item of raw) {
    if (!isRecord(item) || !isString(item.id) || !isString(item.text)) continue
    const text = item.text.trim().slice(0, LIMITS.rule)
    if (!text) continue
    out.push({
      id: item.id,
      text,
      created_at: isString(item.created_at) ? item.created_at : new Date().toISOString(),
      retired_at: isString(item.retired_at) ? item.retired_at : null,
    })
    if (out.length >= LIMITS.rules) break
  }
  return out
}

export function normaliseNode(row: unknown): WorkNode {
  const r = row as WorkNode & { rules: unknown }
  return { ...r, rules: normaliseRules(r.rules) }
}

export function normaliseThread(row: unknown): Thread {
  const r = row as Thread & { rules: unknown }
  return { ...r, rules: normaliseRules(r.rules) }
}

export function clampText(v: unknown, field: keyof typeof LIMITS, label: string): string {
  if (!isString(v)) throw badRequest(`${label} must be text`)
  return v.slice(0, LIMITS[field])
}

/** The node, or 404. RLS already scopes to the person; the explicit user_id
 *  filter keeps a mistyped id from leaking a row count. */
export async function requireNode(auth: AuthedContext, nodeId: string): Promise<WorkNode> {
  const { data, error } = await auth.supabase
    .from('studio_nodes')
    .select(NODE_COLS)
    .eq('id', nodeId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) throw fromDbError(error)
  if (!data) throw notFound()
  return normaliseNode(data)
}

export async function requireThread(auth: AuthedContext, threadId: string): Promise<Thread> {
  const { data, error } = await auth.supabase
    .from('studio_threads')
    .select(THREAD_COLS)
    .eq('id', threadId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) throw fromDbError(error)
  if (!data) throw notFound()
  return normaliseThread(data)
}

export async function loadTree(auth: AuthedContext, projectId: string): Promise<TreePayload> {
  const { data, error } = await auth.supabase.rpc('studio_tree', { p_project_id: projectId })
  if (error) throw fromDbError(error)
  const payload = (data ?? {}) as Partial<TreePayload>
  return {
    nodes: (payload.nodes ?? []).map(normaliseNode),
    threads: (payload.threads ?? []).map(normaliseThread),
    tags: payload.tags ?? [],
    open_checks: payload.open_checks ?? [],
  }
}

export async function nextPosition(
  auth: AuthedContext,
  projectId: string,
  parentId: string | null,
): Promise<number> {
  const { data, error } = await auth.supabase.rpc('studio_next_node_position', {
    p_project_id: projectId,
    p_parent_id: parentId,
  })
  if (error) throw fromDbError(error)
  return typeof data === 'number' ? data : 0
}

export const extentFor = (html: string) => wordCount(html)
export { LIMITS as NODE_LIMITS }
