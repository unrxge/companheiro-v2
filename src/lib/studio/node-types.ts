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
  /** Where a root-level piece sits on the board. null = its reading-order lane. */
  board_x: number | null
  board_y: number | null
  // ── Write-mode-parity fields (migration 006/007) ──────────────────────────
  // Populated on the ROOT node of a piece (parent_id null) by Idea Lab's
  // core-concept save; read/written by /write's five modes. Unused (blank)
  // on non-root parts — a part's "what this is for" lives in `intent` above,
  // same as every other node.
  writing_ethos: string | null
  emotional_journey: string | null
  core_truth: string | null
  substack_goals: string | null
  short_form_goals: string | null
  open_threads: string[] | null
  short_form_script: string | null
  /** Per-part AI edit lock in Write mode's Studio (distinct from the
   *  project-level assistant write-lock in user_settings). */
  is_locked: boolean
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
  /** Where this thread's hub sits on the board. null = near the pieces it touches. */
  board_x: number | null
  board_y: number | null
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
  board_x?: number | null
  board_y?: number | null
  writing_ethos?: string | null
  emotional_journey?: string | null
  core_truth?: string | null
  substack_goals?: string | null
  short_form_goals?: string | null
  open_threads?: string[] | null
  short_form_script?: string | null
  is_locked?: boolean
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
  board_x?: number | null
  board_y?: number | null
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

/** One place a thread shows up, with the trail down to it. */
export interface Appearance {
  node: TreeNode
  /** Titles from the top-level piece down to this node. */
  trail: string[]
  /** The top-level piece this sits under. */
  rootId: string
  /** The thread is marked on this node itself, not inferred. */
  direct: boolean
}
