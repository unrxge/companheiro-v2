// Turns an authored example (types.ts) into the rows the real pages read: the
// project, its tree, the canvas's task lists and palettes, every task, the
// fragments, what the vision room keeps and one past conversation in it.
//
// Pure and deterministic for a given `now`, so the same example always comes
// out the same way and can be tested without a server. Every id it makes
// starts with the project's id, `example-<key>`, which is how a request is
// recognised as being about an example (see serve.ts and next.config.ts).

import type { Rule, Thread, ThreadTag, TreePayload, WorkNode } from '@/lib/studio/node-types'
import type { Project, ProjectSettings } from '@/lib/studio/types'
import type { BoardItem } from '@/lib/studio/board-items'
import type { TaskRow } from '@/lib/studio/tasks-db'
import type { VisionConversation, VisionMessage, VisionState } from '@/lib/studio/vision/types'
import { WRITING } from '@/lib/studio/task-groups'
import type { ExamplePart, ExamplePiece, ExampleSource } from './types'

export const EXAMPLE_PREFIX = 'example-'

export const exampleProjectId = (key: string) => `${EXAMPLE_PREFIX}${key}`

/** True for any id an example hands out: its project, pieces, parts, threads, items, tasks. */
export const isExampleId = (id: string | null | undefined): boolean => typeof id === 'string' && id.startsWith(EXAMPLE_PREFIX)

/** What an example carries in its project settings, for the banner and the board. */
export interface ExampleMark { key: string; who: string }

export interface BuiltExample {
  project: Project
  tree: TreePayload
  items: BoardItem[]
  tasks: TaskRow[]
  /** Fragments, by the node they were kept for. */
  lines: Array<{ id: string; node_id: string; text: string }>
  conversation: VisionConversation & { list: VisionMessage[] }
}

const DAY = 86_400_000

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Plain text to the editor's HTML: a blank line is a new paragraph, a single break stays a break. */
export function toHtml(text: string | undefined): string {
  const t = (text ?? '').trim()
  if (!t) return ''
  return t.split(/\n{2,}/).map((p) => `<p>${p.split('\n').map(escape).join('<br>')}</p>`).join('')
}

const words = (text: string | undefined) => (text ?? '').split(/\s+/).filter(Boolean).length

export function buildExample(src: ExampleSource, now: number = Date.now()): BuiltExample {
  const pid = exampleProjectId(src.key)
  // A fixed hour of the day, so a reload a minute later shows the same dates.
  const today = Math.floor(now / DAY) * DAY + 10 * 3_600_000
  const ago = (days: number, minutes = 0) => new Date(today - days * DAY + minutes * 60_000).toISOString()
  const id = (key: string) => `${pid}--${key}`
  const started = ago(src.startedDaysAgo)
  const rule = (scope: string, text: string, i: number, days = src.startedDaysAgo): Rule => ({ id: id(`rule-${scope}-${i + 1}`), text, created_at: ago(days, i), retired_at: null })

  // Every piece and part, so threads, fragments and tasks can name either.
  const keyed = new Map<string, string>()
  const nodes: WorkNode[] = []
  src.pieces.forEach((piece, position) => {
    const pieceId = id(piece.key)
    keyed.set(piece.key, pieceId)
    const born = Math.max(1, src.startedDaysAgo - 2 - position * 4)
    const touched = Math.max(0, Math.min(born - 1, piece.status === 'done' ? born - 6 : position))
    const parts = piece.parts ?? []
    const partNodes: WorkNode[] = parts.map((part: ExamplePart, i) => {
      const partId = id(part.key)
      keyed.set(part.key, partId)
      return node({
        id: partId, parent_id: pieceId, position: i, title: part.title, intent: part.intent ?? '', beat: part.beat ?? '',
        stands_whole: false, body: toHtml(part.body), extent: words(part.body), status: part.status ?? (part.body?.trim() ? piece.status === 'done' ? 'done' : 'drafted' : 'open'),
        created_at: ago(born, 10 + i), updated_at: ago(touched, 30 + i),
      })
    })
    const body = parts.length ? partNodes.map((p) => p.body).join('') : toHtml(piece.body)
    nodes.push(node({
      id: pieceId, parent_id: null, position, title: piece.title, intent: piece.conviction, beat: '', stands_whole: true,
      rules: (piece.rules ?? []).map((r, i) => rule(piece.key, r, i, born)), body,
      extent: parts.length ? partNodes.reduce((n, p) => n + p.extent, 0) : words(piece.body),
      status: piece.status, writing_ethos: piece.ethos ?? null,
      emotional_journey: piece.journey?.join('\n') ?? null, core_truth: piece.truth ?? null, open_threads: piece.open ?? [],
      created_at: ago(born), updated_at: ago(touched, 45),
    }), ...partNodes)
  })
  const nodeId = (key: string) => {
    const found = keyed.get(key)
    if (!found) throw new Error(`example ${src.key}: nothing called "${key}"`)
    return found
  }

  const threads: Thread[] = src.threads.map((th, position) => ({
    id: id(`thread-${th.key}`), user_id: '', project_id: pid, position, name: th.name, intent: th.intent,
    rules: (th.rules ?? []).map((r, i) => rule(`thread-${th.key}`, r, i, src.startedDaysAgo - 10)), hue: th.hue, board_x: null, board_y: null,
    created_at: ago(src.startedDaysAgo - 8 - position), updated_at: ago(Math.max(0, 6 - position)),
  }))
  const tags: ThreadTag[] = src.threads.flatMap((th) => th.on.map((on) => ({ node_id: nodeId(on.at), thread_id: id(`thread-${th.key}`), note: on.note ?? '' })))

  let taskN = 0
  const tasks: TaskRow[] = src.pieces.flatMap((piece: ExamplePiece) => (piece.tasks ?? []).map((t) => ({
    id: id(`task-${++taskN}`), node_id: nodeId(piece.key), title: t.title, type: 'creation' as const,
    status: t.done ? 'complete' as const : 'pending' as const, is_writing_related: t.category === WRITING, category: t.category,
  })))

  let lineN = 0
  const lines = src.pieces.flatMap((piece) => (piece.fragments ?? []).map((f) => ({
    id: id(`line-${++lineN}`), node_id: nodeId(f.part ?? piece.key), text: f.text,
  })))

  const items: BoardItem[] = src.items.map((item, n) => ({
    id: id(`item-${n + 1}`), user_id: '', project_id: pid, kind: item.kind, asset_id: null,
    node_ids: item.pieces.map(nodeId), board_x: null, board_y: null, w: null,
    content: item.kind === 'palette'
      ? { swatches: (item.swatches ?? []).map((s, m) => ({ id: id(`swatch-${n + 1}-${m + 1}`), hex: s.hex, name: s.name })) }
      : { tasks: (item.tasks ?? []).map((t, m) => ({ id: id(`list-${n + 1}-${m + 1}`), title: t.title, done: !!t.done })) },
    created_at: ago(src.startedDaysAgo - 12 - n), updated_at: ago(Math.max(0, 4 - n)),
  }))

  const vision: VisionState = {
    kept: src.kept.map((k, n) => ({
      id: id(`kept-${n + 1}`), kind: k.kind, node_id: k.piece ? nodeId(k.piece) : null, text: k.text, why: k.why ?? '',
      quote: k.quote ?? '', at: ago(k.daysAgo, n), state: 'kept' as const,
    })),
    declined: [],
    reading: {
      at: ago(src.reading.daysAgo, 120),
      statement: src.reading.statement,
      gaps: src.reading.gaps.map((g, n) => ({ id: id(`gap-${n + 1}`), text: g.text, where: g.where })),
      signature: 'example',
    },
    gaps_dismissed: [],
    changes: src.changes.map((c, n) => ({
      id: id(`change-${n + 1}`), node_id: nodeId(c.piece), field: c.field, from: c.from, to: c.to, at: ago(c.daysAgo, 60 + n), source: c.source,
    })),
    pending_changes: [],
  }

  const settings = {
    snap: true, grid: false, sizes: true, board: true,
    example: { key: src.key, who: src.who } satisfies ExampleMark,
    vision,
  } as ProjectSettings

  const project: Project = {
    id: pid, user_id: '', title: src.title, intent: src.intent,
    rules: src.rules.map((r, i) => rule('project', r, i)), arc: src.arc, thematic_territory: null, status: 'active', shelf_stage: 'active',
    resting_until: null, completed_at: null, completion_note: null, viewport: { tx: 0, ty: 0, k: 1 },
    shelf_x: null, shelf_y: null, vision_x: null, vision_y: null, settings, auto_layout: true, composed_at: null,
    conceptualisation_log: src.log, canvas_version: 1,
    last_opened_at: ago(0), opened_before_at: ago(1), created_at: started, updated_at: ago(0),
  }

  const conv = src.conversation
  const list: VisionMessage[] = conv.messages.map((m, n) => ({
    id: id(`message-${n + 1}`), role: m.role, text: m.text, sources: [], created_at: ago(conv.daysAgo, n * 3),
  }))
  const conversation = {
    id: id('conversation'), title: conv.title, summary: conv.summary,
    created_at: list[0]?.created_at ?? ago(conv.daysAgo), updated_at: list[list.length - 1]?.created_at ?? ago(conv.daysAgo),
    messages: list.length, list,
  }

  return { project, tree: { nodes, threads, tags, open_checks: [] }, items, tasks, lines, conversation }
}

function node(n: Partial<WorkNode> & Pick<WorkNode, 'id' | 'parent_id' | 'position' | 'title' | 'created_at' | 'updated_at'>): WorkNode {
  return {
    user_id: '', project_id: n.id.split('--')[0], intent: '', beat: '', stands_whole: true, rules: [], body: '', extent: 0,
    status: 'open', board_x: null, board_y: null, writing_ethos: null, emotional_journey: null, core_truth: null,
    short_form_goals: null, open_threads: [], short_form_script: null, is_locked: false,
    ...n,
  }
}
