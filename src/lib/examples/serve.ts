// Answers the requests the real canvas, writing page and vision room make,
// when the project they are looking at is an example. next.config.ts sends
// every API request whose path (or node_id) carries an example id to
// /api/examples/…, and that route hands it here.
//
// Reads answer in exactly the shape the real route would. Anything that would
// change something is refused with code `example`, and a request that would
// ask the companion something never gets that far: an example costs nothing
// to look at and nobody's words are ever sent anywhere from it.
//
// Pure: method, path and query in, status and body out.

import type { ProjectAccess } from '@/lib/studio/plan-access'
import type { VisionPayload } from '@/lib/studio/vision/types'
import { buildExample, type BuiltExample } from './build'
import { exampleOfId } from './index'

export const EXAMPLE_REFUSAL = 'This is an example, so nothing in it can be changed. Start a project of your own to work like this.'

export interface ExampleAnswer { status: number; body: unknown }

const ok = (body: unknown): ExampleAnswer => ({ status: 200, body })
const missing: ExampleAnswer = { status: 404, body: { error: 'That is not part of this example.' } }
const refused: ExampleAnswer = { status: 403, body: { error: EXAMPLE_REFUSAL, code: 'example' } }

/** Read, never worked on: the page shows every tool it would show on a project of Direction's, none of them live. */
export const EXAMPLE_ACCESS: ProjectAccess = {
  plan: 'unknown', workable: false, reason: 'example', active: [], limit: null, resting_until: null,
  threads: true, media: true, visionTalk: true, companion: true,
}

/** The piece a node sits in, and every node under that piece. */
function pieceOf(built: BuiltExample, nodeId: string): Set<string> | null {
  const byId = new Map(built.tree.nodes.map((n) => [n.id, n]))
  let at = byId.get(nodeId)
  if (!at) return null
  while (at.parent_id) at = byId.get(at.parent_id)!
  const inside = new Set([at.id])
  let grew = true
  while (grew) {
    grew = false
    for (const n of built.tree.nodes) if (n.parent_id && inside.has(n.parent_id) && !inside.has(n.id)) { inside.add(n.id); grew = true }
  }
  return inside
}

/**
 * `segments` is the path after /api/examples: ['projects', id, …],
 * ['nodes', id, …], ['items', id], ['threads', id, …] or ['write', route].
 */
export function answerExample(method: string, segments: string[], query: URLSearchParams, now: number = Date.now()): ExampleAnswer {
  const [kind, ...rest] = segments
  const subjectId = kind === 'write' ? query.get('node_id') ?? '' : rest[0] ?? ''
  const src = exampleOfId(subjectId)
  if (!src) return missing
  const verb = method.toUpperCase()

  // Opening a project is recorded for the board's order. An example has no row to record it on.
  if (kind === 'projects' && rest[1] === 'open') return ok({ success: true })
  if (verb !== 'GET' && verb !== 'HEAD') return refused

  const built = buildExample(src, now)
  const nodeExists = (id: string) => built.tree.nodes.some((n) => n.id === id)

  if (kind === 'projects') {
    if (subjectId !== built.project.id) return missing
    const [, what, more] = rest
    if (!what) return ok({ project: built.project })
    if (what === 'tree') return ok({ project: built.project, tree: built.tree, access: EXAMPLE_ACCESS })
    if (what === 'items') return ok({ ready: true, items: built.items, assets: [], tasks: built.tasks })
    if (what === 'tasks') return ok({ success: true, tasks: built.tasks })
    if (what === 'proposals') return ok({ proposals: [] })
    if (what === 'companion') return ok({ messages: [] })
    if (what === 'vision' && more === 'conversations') {
      const { list: _messages, ...conversation } = built.conversation
      return ok({ ready: true, conversations: [conversation] })
    }
    if (what === 'vision' && !more) {
      // The room opens on a new conversation for a project of one's own. An
      // example has nothing new to say, so it opens on the one it keeps.
      const asked = query.get('conversation')
      const theOne = !asked || asked === 'new' || asked === built.conversation.id
      const vision = (built.project.settings as unknown as { vision: { kept: VisionPayload['kept']; changes: VisionPayload['changes']; reading: VisionPayload['reading'] } }).vision
      const payload: VisionPayload = {
        messages: theOne ? built.conversation.list : [],
        conversation_id: theOne ? built.conversation.id : null,
        conversations: true,
        kept: vision.kept,
        changes: vision.changes,
        pending_changes: [],
        reading: vision.reading,
        stale: false,
        unread: { images: 0, recordings: 0 },
      }
      return ok(payload)
    }
    return missing
  }

  if (kind === 'nodes') {
    if (!nodeExists(subjectId)) return missing
    const [, what] = rest
    if (what === 'tasks') return ok({ success: true, tasks: built.tasks.filter((t) => t.node_id === subjectId) })
    return missing
  }

  if (kind === 'write') {
    const [route] = rest
    const piece = pieceOf(built, subjectId)
    if (!piece) return missing
    if (route === 'anchor-lines') {
      return ok({ anchorLines: built.lines.filter((l) => piece.has(l.node_id)).map((l) => ({ id: l.id, section_id: l.node_id, text: l.text })) })
    }
    if (route === 'history') return ok({ piece_id: subjectId, revisions: [], current: [] })
    return missing
  }

  return missing
}
