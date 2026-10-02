// studio_tasks reads and inserts that work before and after migration 029
// (the `category` column): each tries the new shape and, if the column is not
// there yet, repeats without it.

import type { AuthedContext } from '../supabase/route'
import { WRITING } from './task-groups'

const BASE = 'id, node_id, title, type, status, is_writing_related'
const WITH_CATEGORY = `${BASE}, category`

export interface TaskRow {
  id: string
  node_id: string
  title: string
  type: 'creation' | 'execution'
  status: 'pending' | 'complete'
  is_writing_related: boolean | null
  category: string | null
}

type DbError = { code?: string; message?: string } | null
const missingCategory = (e: DbError) => !!e && (e.code === '42703' || e.code === 'PGRST204' || /category/i.test(e.message ?? ''))

export async function readTasks(auth: AuthedContext, by: { node_id: string } | { project_id: string }): Promise<{ tasks: TaskRow[]; error: DbError }> {
  const run = (cols: string) => {
    const q = auth.supabase.from('studio_tasks').select(cols).eq('user_id', auth.user.id)
    return ('node_id' in by ? q.eq('node_id', by.node_id) : q.eq('project_id', by.project_id)).order('order', { ascending: true })
  }
  let res = await run(WITH_CATEGORY)
  if (missingCategory(res.error)) res = await run(BASE)
  const rows = ((res.data as unknown as Array<Omit<TaskRow, 'category'> & { category?: string | null }> | null) ?? [])
  return { tasks: rows.map((r) => ({ ...r, category: r.category ?? null })), error: res.error }
}

export interface NewTask {
  project_id: string
  node_id: string
  title: string
  category: string
  order: number
}

/** A task is the writing when it sits under Writing; that is also what the older flag says. */
export async function insertTasks(auth: Pick<AuthedContext, 'supabase'> & { user: { id: string } }, rows: NewTask[]): Promise<{ tasks: TaskRow[]; error: DbError }> {
  if (rows.length === 0) return { tasks: [], error: null }
  const shaped = rows.map((r) => ({
    user_id: auth.user.id,
    project_id: r.project_id,
    node_id: r.node_id,
    title: r.title,
    type: 'creation' as const,
    is_writing_related: r.category === WRITING,
    order: r.order,
    status: 'pending' as const,
    category: r.category,
  }))
  let res = await auth.supabase.from('studio_tasks').insert(shaped).select(WITH_CATEGORY)
  if (missingCategory(res.error)) {
    res = await auth.supabase.from('studio_tasks').insert(shaped.map(({ category: _c, ...rest }) => rest)).select(BASE)
  }
  const out = ((res.data as unknown as Array<Omit<TaskRow, 'category'> & { category?: string | null }> | null) ?? [])
  return { tasks: out.map((r) => ({ ...r, category: r.category ?? null })), error: res.error }
}
