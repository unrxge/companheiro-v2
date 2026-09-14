// studio/src/lib/studio/node-types.ts — the nested work model.
//
// A node contains nodes. Nothing here knows about "layers": an essay is one
// level deep, an album three, a film series four, and the same shapes carry
// all of them. Threads cut across the tree, so a node belongs to its parent
// AND to any number of threads.

export type NodeStatus = 'open' | 'drafted' | 'done'
export type CheckOutcome = 'fixed' | 'amended' | 'meant_it' | 'dismissed'
export type ThreadHue = 'ember' | 'verdant' | 'violet' | 'ochre' | 'tide'

/** A rule with teeth. Retired rather than deleted, so history stays readable. */
export interface Rule {
  id: string
  text: string
  created_at: string
  retired_at?: string | null
}

export interface WorkNode {
  id: string
  user_id: string
  project_id: string
  parent_id: string | null
  position: number
  title: string
  /** What this part is for. */
  intent: string
  /** The beat it carries in the containing work. */
  beat: string
  /** Claims to be complete in itself (asked about arc, not only function). */
  stands_whole: boolean
  rules: Rule[]
  /** Tiptap HTML, when this node is a leaf. */
  body: string
  extent: number
  status: NodeStatus
  created_at: string
  updated_at: string
}

export interface Thread {
  id: string
  user_id: string
  project_id: string
  position: number
  name: string
  intent: string
  rules: Rule[]
  hue: ThreadHue
  created_at: string
  updated_at: string
}

/** A node's appearance in a thread, and what it does there. */
export interface ThreadTag {
  node_id: string
  thread_id: string
  note: string
}

export interface RuleCheck {
  id: string
  project_id: string
  node_id: string
  source_node_id: string | null
  source_thread_id: string | null
  rule_id: string
  rule_text: string
  question: string
  outcome: CheckOutcome | null
  outcome_note: string | null
  resolved_at: string | null
  created_at: string
}

export interface TreePayload {
  nodes: WorkNode[]
  threads: Thread[]
  tags: ThreadTag[]
  open_checks: RuleCheck[]
}

// ── requests ────────────────────────────────────────────────────────────────

export interface CreateNodeRequest {
  parent_id?: string | null
  title?: string
  intent?: string
  beat?: string
  stands_whole?: boolean
  /** Insert after this sibling; appended when absent. */
  after_id?: string | null
}

export interface PatchNodeRequest {
  title?: string
  intent?: string
  beat?: string
  stands_whole?: boolean
  body?: string
  status?: NodeStatus
  rules?: Rule[]
}

export interface ReorderRequest {
  /** Sibling ids in their new order. All must share one parent. */
  ids: string[]
}

export interface CreateThreadRequest {
  name?: string
  intent?: string
  hue?: ThreadHue
}

export interface PatchThreadRequest {
  name?: string
  intent?: string
  hue?: ThreadHue
  rules?: Rule[]
}

export interface TagRequest {
  note?: string
}

export interface ResolveCheckRequest {
  outcome: CheckOutcome
  note?: string
}

// ── the shape the views actually work with ──────────────────────────────────

/** A node with its children resolved, depth, and the threads it carries. */
export interface TreeNode extends WorkNode {
  children: TreeNode[]
  depth: number
  /** thread ids, in thread order */
  threads: string[]
}
