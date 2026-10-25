// What one project keeps about its vision, and how the canvas is gathered for
// the companion. Server only.
//
// The kept lines and the reading live in studio_projects.settings.vision, the
// same jsonb the cards sent from a check-in and the thread suggestions already
// use, so the room needed no new table. Every change re-reads the row first:
// several things write settings, and none of them may undo another.

import type { AuthedContext } from '@/lib/supabase/route'
import { fromDbError, notFound } from '@/lib/studio/db'
import { ITEM_COLS, normaliseItem } from '@/lib/studio/board-items-db'
import type { BoardItem, ProjectTask } from '@/lib/studio/board-items'
import { loadTree } from '@/lib/studio/nodes-db'
import { readTasks } from '@/lib/studio/tasks-db'
import { buildTree } from '@/lib/studio/tree'
import type { TreeNode } from '@/lib/studio/node-types'
import type { Project } from '@/lib/studio/types'
import { canvasSignature, canvasText, type CanvasRead } from './canvas-text'
import { visionOf } from './state'
import type { KeptLine, VisionState } from './types'

export { visionOf } from './state'

/** Changes the vision part of the settings against a fresh read of the row. */
export async function changeVision(
  auth: AuthedContext,
  projectId: string,
  change: (now: VisionState) => VisionState,
): Promise<VisionState> {
  const { data, error } = await auth.supabase
    .from('studio_projects')
    .select('settings')
    .eq('id', projectId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) throw fromDbError(error)
  if (!data) throw notFound()
  const settings = ((data as { settings: unknown }).settings ?? {}) as Record<string, unknown>
  const next = change(visionOf(settings))
  const { error: e } = await auth.supabase
    .from('studio_projects')
    .update({ settings: { ...settings, vision: next } })
    .eq('id', projectId)
    .eq('user_id', auth.user.id)
  if (e) throw fromDbError(e)
  return next
}

export interface Canvas extends CanvasRead {
  roots: TreeNode[]
  signature: string
}

/**
 * Every written thing on this project's canvas. Three reads, all of this one
 * project: the tree, the canvas items, the tasks. A table that
 * is not there yet (the canvas items before migration 028) reads as empty.
 */
export async function loadCanvas(auth: AuthedContext, project: Project): Promise<Canvas> {
  const [tree, itemsRes, tasksRes] = await Promise.all([
    loadTree(auth, project.id),
    auth.supabase.from('studio_board_items').select(ITEM_COLS).eq('project_id', project.id).eq('user_id', auth.user.id).order('created_at', { ascending: true }),
    readTasks(auth, { project_id: project.id }),
  ])
  const roots = buildTree(tree.nodes, tree.tags, tree.threads.map((x) => x.id))
  const items: BoardItem[] = itemsRes.error ? [] : ((itemsRes.data as unknown[] | null) ?? []).map(normaliseItem)
  const tasks = tasksRes.tasks.filter((t) => !!t.node_id) as unknown as ProjectTask[]
  const read = canvasText({
    project: { title: project.title, intent: project.intent ?? '', rules: project.rules ?? [], arc: project.arc, thematic_territory: project.thematic_territory },
    roots, threads: tree.threads, tags: tree.tags, items, tasks,
  })
  return { ...read, roots, signature: canvasSignature(read.text) }
}

/** What they have kept, as the companion is told it. */
export function keptText(vision: VisionState, pieceName: (id: string) => string | null = () => null): string {
  const kept = vision.kept.filter((k) => k.state === 'kept')
  const decided = kept.filter((k) => k.kind === 'decision')
  const open = kept.filter((k) => k.kind === 'open')
  const day = (iso: string) => iso.slice(0, 10)
  const about = (k: KeptLine) => (k.node_id && pieceName(k.node_id) ? ` [about “${pieceName(k.node_id)}”]` : '')
  const changed = vision.changes.slice(-12)
  return [
    decided.length ? `DECIDED, IN THEIR WORDS:\n${decided.map((k) => `- ${k.text}${k.why ? ` (because: ${k.why})` : ''}${about(k)} [${day(k.at)}]`).join('\n')}` : 'DECIDED: (nothing kept yet)',
    open.length ? `STILL OPEN FOR THE WHOLE PROJECT, IN THEIR WORDS:\n${open.map((k) => `- ${k.text} [${day(k.at)}]`).join('\n')}` : 'STILL OPEN FOR THE WHOLE PROJECT: (nothing kept yet; open questions about one piece are its open threads, on the canvas above)',
    changed.length
      ? `CHANGED IN A CORE CONCEPT SINCE IT WAS LOCKED (the canvas above already reads the new version):\n${changed.map((c) => `- ${pieceName(c.node_id) ?? 'a piece'}, ${c.field === 'open_threads' ? 'open threads' : c.field === 'intent' ? 'conviction' : c.field === 'core_truth' ? 'core truth' : 'emotional journey'}: ${c.from ? `“${c.from.slice(0, 160)}” became ` : ''}“${c.to.slice(0, 200)}” [${day(c.at)}]`).join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n')
}
