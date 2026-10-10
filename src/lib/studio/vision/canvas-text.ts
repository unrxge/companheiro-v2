// Everything written on one project's canvas, as plain text for the companion.
//
// The rule it keeps: every word the person put on the canvas is read, and
// nothing else is. That means what the project is for, its rules, each
// piece's purpose and core concept, the fragments kept for it, tasks, what
// runs across the pieces, and the words written ON an image, a recording or a
// palette (a caption, a name). It does not mean the image, the recording, or
// the writing inside a piece: a piece's own prose never passes through here,
// which is what keeps a conversation about the vision from turning into one
// that writes the work.
//
// Pure, so what the companion is handed can be tested without a database.

import type { BoardItem, ProjectTask } from '@/lib/studio/board-items'
import type { Rule, Thread, ThreadTag, TreeNode } from '@/lib/studio/node-types'
import { appearancesOf, extentOf, flatten } from '@/lib/studio/tree'

export interface CanvasSource {
  project: { title: string; intent: string; rules: unknown[]; arc: string | null; thematic_territory: string | null }
  roots: TreeNode[]
  threads: Thread[]
  tags: ThreadTag[]
  items: BoardItem[]
  /** Every piece's tasks (studio_tasks). */
  tasks: ProjectTask[]
  /** Lines kept for a piece or one of its parts (studio_anchor_lines). */
  fragments: Array<{ node_id: string | null; text: string }>
}

export interface CanvasRead {
  text: string
  /** What sits on the canvas and is deliberately not looked at. */
  unread: { images: number; recordings: number }
}

const live = (rules: unknown): Rule[] =>
  (Array.isArray(rules) ? (rules as Rule[]) : []).filter((r) => r && typeof r.text === 'string' && !r.retired_at)

const one = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
const named = (s: string | null | undefined, fallback: string) => one(s) || fallback

/** The words written on a canvas item, or nothing when it carries none. */
function itemWords(item: BoardItem): string[] {
  const c = item.content ?? {}
  if (item.kind === 'image') return one(c.caption) ? [`an image, captioned: “${one(c.caption)}”`] : []
  if (item.kind === 'recording') return one(c.title) ? [`a recording, named: “${one(c.title)}”`] : []
  if (item.kind === 'palette') {
    const names = (c.swatches ?? []).map((s) => one(s.name)).filter(Boolean)
    return names.length ? [`a palette, its colours named: ${names.join(', ')}`] : []
  }
  const own = (c.tasks ?? []).filter((t) => one(t.title))
  return own.length ? [`a task list:\n${own.map((t) => `      [${t.done ? 'x' : ' '}] ${one(t.title)}`).join('\n')}`] : []
}

function part(node: TreeNode, depth: number): string {
  const pad = '  '.repeat(depth + 2)
  const bits = [`${pad}- ${named(node.title, 'untitled')} · ${extentOf(node)} words · ${node.status}`]
  if (one(node.intent)) bits.push(`${pad}  for: ${one(node.intent)}`)
  if (one(node.beat)) bits.push(`${pad}  the beat it carries: ${one(node.beat)}`)
  for (const rule of live(node.rules)) bits.push(`${pad}  rule: ${one(rule.text)}`)
  for (const child of node.children) bits.push(part(child, depth + 1))
  return bits.join('\n')
}

export function canvasText(src: CanvasSource): CanvasRead {
  const { project, roots, threads, tags, items, tasks, fragments } = src
  const threadName = new Map(threads.map((t) => [t.id, named(t.name, 'an unnamed thread')]))
  // A fragment or a task may hang on a part; it is told under the piece that part sits in.
  const rootOf = new Map<string, string>()
  for (const root of roots) for (const n of flatten([root])) rootOf.set(n.id, root.id)

  const out: string[] = []
  out.push(`THE PROJECT: ${named(project.title, 'untitled')}`)
  out.push(`WHAT THE WHOLE THING IS FOR: ${one(project.intent) || '(not written yet)'}`)
  const frame = [one(project.thematic_territory) && `theme: ${one(project.thematic_territory)}`, one(project.arc) && `movement: ${one(project.arc)}`].filter(Boolean)
  if (frame.length) out.push(`WHERE IT BEGAN: ${frame.join(' · ')}`)
  const overAll = live(project.rules)
  out.push(overAll.length ? `RULES OVER EVERYTHING:\n${overAll.map((r) => `- ${one(r.text)}`).join('\n')}` : 'RULES OVER EVERYTHING: (none set)')

  const pieces = roots.map((root, i) => {
    const bits = [`${i + 1}. ${named(root.title, 'untitled')} · ${root.status} · ${extentOf(root)} words${root.stands_whole ? ' · stands whole' : ''}`]
    const line = (label: string, value: string | null | undefined) => { if (one(value)) bits.push(`   ${label}: ${one(value)}`) }
    line('for', root.intent)
    line('the truth under it', root.core_truth)
    if ((root.emotional_journey ?? '').trim()) {
      bits.push(`   the journey it takes the audience on:\n${(root.emotional_journey ?? '').split('\n').map((l) => one(l)).filter(Boolean).map((l) => `     - ${l}`).join('\n')}`)
    }
    line('how it should be made', root.writing_ethos)
    line('what the long form is for', root.substack_goals)
    line('what the short form is for', root.short_form_goals)
    const open = (root.open_threads ?? []).map(one).filter(Boolean)
    if (open.length) bits.push(`   left open in its concept: ${open.join(' | ')}`)
    for (const rule of live(root.rules)) bits.push(`   rule: ${one(rule.text)}`)
    const on = root.threads.map((id) => threadName.get(id)).filter(Boolean)
    if (on.length) bits.push(`   threads through it: ${on.join(', ')}`)

    if (root.children.length) bits.push(`   its parts, in order:\n${root.children.map((c) => part(c, 0)).join('\n')}`)

    const kept = fragments.filter((f) => f.node_id && rootOf.get(f.node_id) === root.id && one(f.text))
    if (kept.length) bits.push(`   fragments kept for it:\n${kept.map((f) => `     “${one(f.text)}”`).join('\n')}`)

    const mine = tasks.filter((t) => rootOf.get(t.node_id) === root.id && one(t.title))
    if (mine.length) bits.push(`   tasks:\n${mine.map((t) => `     [${t.status === 'complete' ? 'x' : ' '}] ${one(t.title)}${t.category ? ` (${one(t.category)})` : ''}`).join('\n')}`)

    const beside = items.filter((it) => it.node_ids.includes(root.id)).flatMap(itemWords)
    if (beside.length) bits.push(`   beside it on the canvas:\n${beside.map((w) => `     - ${w}`).join('\n')}`)
    return bits.join('\n')
  })
  out.push(pieces.length ? `THE PIECES, IN ORDER:\n${pieces.join('\n\n')}` : 'THE PIECES: (none yet)')

  if (threads.length) {
    const lines = threads.map((thread) => {
      const appearances = appearancesOf(roots, thread.id)
      const touched = new Set(appearances.map((a) => a.rootId))
      const quiet = roots.filter((r) => !touched.has(r.id)).map((r) => named(r.title, 'untitled'))
      const note = (nodeId: string) => one(tags.find((t) => t.node_id === nodeId && t.thread_id === thread.id)?.note)
      return [
        `- ${named(thread.name, 'an unnamed thread')}${one(thread.intent) ? `: ${one(thread.intent)}` : ''}`,
        ...live(thread.rules).map((r) => `    rule: ${one(r.text)}`),
        appearances.length
          ? `    appears in: ${appearances.map((a) => `${a.trail.join(' / ')}${note(a.node.id) ? ` (${note(a.node.id)})` : ''}`).join('; ')}`
          : '    appears nowhere yet',
        quiet.length ? `    absent from: ${quiet.join(', ')}` : '',
      ].filter(Boolean).join('\n')
    })
    out.push(`WHAT RUNS ACROSS THE PIECES:\n${lines.join('\n')}`)
  }

  const loose = fragments.filter((f) => !(f.node_id && rootOf.has(f.node_id)) && one(f.text))
  if (loose.length) out.push(`FRAGMENTS KEPT FOR THE PROJECT:\n${loose.map((f) => `“${one(f.text)}”`).join('\n')}`)

  const alone = items.filter((it) => !it.node_ids.some((id) => rootOf.has(id))).flatMap(itemWords)
  if (alone.length) out.push(`STANDING ON ITS OWN ON THE CANVAS:\n${alone.map((w) => `- ${w}`).join('\n')}`)

  const unread = {
    images: items.filter((it) => it.kind === 'image').length,
    recordings: items.filter((it) => it.kind === 'recording').length,
  }
  if (unread.images || unread.recordings) {
    const what = [unread.images && `${unread.images} image${unread.images === 1 ? '' : 's'}`, unread.recordings && `${unread.recordings} recording${unread.recordings === 1 ? '' : 's'}`].filter(Boolean).join(' and ')
    out.push(`NOT SHOWN TO YOU: ${what} on the canvas. They are for the person's eyes and ears only; you have the words written on them and nothing else.`)
  }

  return { text: out.join('\n\n'), unread }
}

/** A short fingerprint of what the canvas says, to tell when a reading has gone stale. */
export function canvasSignature(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0
  return `${text.length}:${(h >>> 0).toString(36)}`
}
