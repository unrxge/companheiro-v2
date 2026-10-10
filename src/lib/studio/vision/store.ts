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
import { EMPTY_VISION, type Gap, type KeptLine, type Reading, type VisionState } from './types'

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const strs = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(-max) : [])

function cleanKept(raw: unknown): KeptLine[] {
  if (!Array.isArray(raw)) return []
  const out: KeptLine[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const k = r as Record<string, unknown>
    if (!str(k.id) || !str(k.text)) continue
    out.push({
      id: str(k.id),
      kind: k.kind === 'open' ? 'open' : 'decision',
      text: str(k.text),
      why: str(k.why),
      quote: str(k.quote),
      at: str(k.at),
      state: k.state === 'kept' ? 'kept' : 'pending',
    })
  }
  return out
}

function cleanReading(raw: unknown): Reading | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (!str(r.at)) return null
  const gaps: Gap[] = (Array.isArray(r.gaps) ? r.gaps : [])
    .filter((g): g is Record<string, unknown> => !!g && typeof g === 'object')
    .map((g) => ({ id: str(g.id), text: str(g.text), where: strs(g.where, 6) }))
    .filter((g) => g.id && g.text)
  return { at: str(r.at), statement: str(r.statement), gaps, signature: str(r.signature) }
}

/** The vision part of a project's settings, whatever state the row is in. */
export function visionOf(settings: unknown): VisionState {
  const v = settings && typeof settings === 'object' ? (settings as { vision?: unknown }).vision : null
  if (!v || typeof v !== 'object') return { ...EMPTY_VISION }
  const s = v as Record<string, unknown>
  return {
    kept: cleanKept(s.kept),
    declined: strs(s.declined, 60),
    reading: cleanReading(s.reading),
    gaps_dismissed: strs(s.gaps_dismissed, 60),
  }
}

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
 * Every written thing on this project's canvas. Four reads, all of this one
 * project: the tree, the canvas items, the tasks, the fragments. A table that
 * is not there yet (the canvas items before migration 028) reads as empty.
 */
export async function loadCanvas(auth: AuthedContext, project: Project): Promise<Canvas> {
  const [tree, itemsRes, tasksRes, fragmentsRes] = await Promise.all([
    loadTree(auth, project.id),
    auth.supabase.from('studio_board_items').select(ITEM_COLS).eq('project_id', project.id).eq('user_id', auth.user.id).order('created_at', { ascending: true }),
    readTasks(auth, { project_id: project.id }),
    auth.supabase.from('studio_anchor_lines').select('node_id, text').eq('project_id', project.id).eq('user_id', auth.user.id).order('created_at', { ascending: true }),
  ])
  const roots = buildTree(tree.nodes, tree.tags, tree.threads.map((x) => x.id))
  const items: BoardItem[] = itemsRes.error ? [] : ((itemsRes.data as unknown[] | null) ?? []).map(normaliseItem)
  const tasks = tasksRes.tasks.filter((t) => !!t.node_id) as unknown as ProjectTask[]
  const fragments = fragmentsRes.error ? [] : ((fragmentsRes.data as Array<{ node_id: string | null; text: string }> | null) ?? [])
  const read = canvasText({
    project: { title: project.title, intent: project.intent ?? '', rules: project.rules ?? [], arc: project.arc, thematic_territory: project.thematic_territory },
    roots, threads: tree.threads, tags: tree.tags, items, tasks, fragments,
  })
  return { ...read, roots, signature: canvasSignature(read.text) }
}

/** What they have kept, as the companion is told it. */
export function keptText(vision: VisionState): string {
  const kept = vision.kept.filter((k) => k.state === 'kept')
  const decided = kept.filter((k) => k.kind === 'decision')
  const open = kept.filter((k) => k.kind === 'open')
  const day = (iso: string) => iso.slice(0, 10)
  return [
    decided.length ? `DECIDED, IN THEIR WORDS:\n${decided.map((k) => `- ${k.text}${k.why ? ` (because: ${k.why})` : ''} [${day(k.at)}]`).join('\n')}` : 'DECIDED: (nothing kept yet)',
    open.length ? `STILL OPEN, IN THEIR WORDS:\n${open.map((k) => `- ${k.text} [${day(k.at)}]`).join('\n')}` : 'STILL OPEN: (nothing kept yet)',
  ].join('\n\n')
}
