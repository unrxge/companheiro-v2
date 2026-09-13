// studio/src/lib/studio/types.ts — the one contract client and server share.
// World units are canvas px at zoom 1. Grid unit U = 8 (D-001).

export const U = 8 as const

// ── primitives ─────────────────────────────────────────────────────────────
export interface Point { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Viewport { tx: number; ty: number; k: number }        // screen = world·k + t (D-002)
export type Hue = 'ember' | 'verdant' | 'violet' | 'ochre' | 'tide'

// ── project ────────────────────────────────────────────────────────────────
export type ProjectStatus = 'active' | 'resting' | 'finished' | 'kept' | 'abandoned'
export interface ProjectSettings { snap: boolean; grid: boolean; sizes: boolean }

export interface Project {
  id: string
  user_id: string
  title: string
  status: ProjectStatus
  resting_until: string | null
  completed_at: string | null
  completion_note: string | null
  viewport: Viewport
  settings: ProjectSettings
  auto_layout: boolean
  composed_at: string | null
  canvas_version: number
  last_opened_at: string
  opened_before_at: string
  created_at: string
  updated_at: string
}

export interface ConceptRevision {
  id: string
  project_id: string
  body: string
  constraints: string[]
  origin: 'creation' | 'edit'
  created_at: string
}

// ── blocks ─────────────────────────────────────────────────────────────────
export type BlockType =
  | 'concept' | 'since' | 'update' | 'timeline' | 'draft' | 'anchor' | 'note' | 'reference'
  | 'commitment' | 'compass' | 'frame' | 'heading' | 'divider' | 'image' | 'gallery'
  | 'recording' | 'palette'

export const BLOCK_TYPES: readonly BlockType[] = [
  'concept', 'since', 'update', 'timeline', 'draft', 'anchor', 'note', 'reference',
  'commitment', 'compass', 'frame', 'heading', 'divider', 'image', 'gallery', 'recording', 'palette',
] as const

/** Types the person can add from the library (concept, since, compass are permanent; timeline is made by tidy). */
export const LIBRARY_TYPES: readonly BlockType[] = [
  'update', 'draft', 'anchor', 'note', 'reference', 'commitment', 'frame', 'heading', 'divider',
  'image', 'gallery', 'recording', 'palette',
] as const

// Per-type jsonb content. Blocks that are views onto typed rows hold only ids (no mirrors).
export type ConceptContent = Record<string, never>                      // text lives in studio_concept_revisions
export type SinceContent = Record<string, never>                        // derived at open; never persisted
export interface UpdateContent {
  text: string                    // VERBATIM span of the person's words (server-verified) or typed directly
  said_at: string                 // ISO
  entry_id: string | null         // studio_talk_entries.id when it came from talk
  origin: 'talk' | 'posted'
}
export interface TimelineContent { title: string | null }              // children: blocks with stacked_in = this.id
export interface DraftContent { draft_id: string }                     // studio_drafts row; summary in the bundle
export interface AnchorContent { text: string; source_block_id: string | null } // made by hand, or from an update
export interface NoteContent { text: string }                          // plain text, \n kept
export interface ReferenceContent { url: string; title: string; note: string }  // title typed by the person; page never fetched
export interface CommitmentContent { entry_id: string }                // studio_compass_entries (kind commitment)
export type CompassContent = Record<string, never>                     // renders the project's compass rows
export interface FrameContent { expanded_h: number; tint: 'none' | Hue }
export interface HeadingContent { text: string; size: 'lg' | 'md' }
export type DividerContent = Record<string, never>
export interface ImageContent { asset_id: string; caption: string; fit: 'cover' | 'contain'; aspect: number }
export interface GalleryItem { asset_id: string; caption: string; aspect: number }
export interface GalleryContent { items: GalleryItem[]; columns: 2 | 3 }
export interface RecordingContent { asset_id: string; title: string; note: string } // own_voice/transcript/envelope on the asset
export interface PaletteContent { swatches: Array<{ hex: string; name: string | null }> } // 1–12

export type BlockContentMap = {
  concept: ConceptContent; since: SinceContent; update: UpdateContent; timeline: TimelineContent
  draft: DraftContent; anchor: AnchorContent; note: NoteContent; reference: ReferenceContent
  commitment: CommitmentContent; compass: CompassContent; frame: FrameContent; heading: HeadingContent
  divider: DividerContent; image: ImageContent; gallery: GalleryContent; recording: RecordingContent
  palette: PaletteContent
}

export type PlacedBy = 'auto' | 'person'
export type ArrivalState = 'placed' | 'unplaced'

export interface Block<T extends BlockType = BlockType> {
  id: string
  user_id: string
  project_id: string
  type: T
  x: number; y: number; w: number; h: number; z: number
  parent_id: string | null
  stacked_in: string | null
  name: string | null
  locked: boolean
  hidden: boolean
  collapsed: boolean
  placed_by: PlacedBy
  arrival_state: ArrivalState
  arrived_from: string | null
  struck_at: string | null
  struck_by: string | null
  content: BlockContentMap[T]
  created_at: string
  updated_at: string
  deleted_at: string | null
}
export type AnyBlock = { [K in BlockType]: Block<K> }[BlockType]

export interface Link {
  id: string
  user_id: string
  project_id: string
  from_block_id: string
  to_block_id: string
  word: string | null
  created_at: string
}

// ── talk ───────────────────────────────────────────────────────────────────
export type TalkKind = 'talk' | 'direction'
export interface TalkEntry {
  id: string
  project_id: string
  kind: TalkKind
  role: 'person' | 'companion'
  input: 'typed' | 'voice' | null
  text: string
  reply_to: string | null
  catch_id: string | null
  sorted_at: string | null
  truncated: boolean
  created_at: string
}

// ── compass ────────────────────────────────────────────────────────────────
export type CompassKind = 'refusal' | 'non_negotiable' | 'commitment' | 'drift'
export type CompassStatus = 'pending' | 'active' | 'rejected' | 'dormant'
export interface CompassEvidence { entry_id: string; quote: string; at: string }
export interface CompassEntry {
  id: string
  project_id: string
  kind: CompassKind
  statement: string
  proposed_statement: string
  status: CompassStatus
  reinforcement_count: number
  last_reinforced_at: string
  evidence: CompassEvidence[]
  source_entry_id: string | null
  decided_at: string | null
  rejection_note: string | null
  forgotten_at: string | null
  // commitments only
  block_id: string | null
  asked_at: string | null
  ask_count: number
  resolution: 'done' | 'let_go' | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}
/** A commitment is a CompassEntry with kind 'commitment'; this alias is for readability. */
export type Commitment = CompassEntry & { kind: 'commitment' }

export interface Catch {
  id: string
  project_id: string
  refusal_entry_id: string
  person_entry_id: string
  decision_text: string
  sentence: string
  spoken_entry_id: string | null
  mark: 'right' | 'wrong' | null
  marked_at: string | null
  created_at: string
}

// ── drafts ─────────────────────────────────────────────────────────────────
export type DraftKind = 'essay' | 'brief' | 'copy' | 'lyrics' | 'other'
export type Posture = 'suggest' | 'ask' | 'locked'
export interface Draft {
  id: string
  project_id: string
  block_id: string | null
  title: string
  kind: DraftKind
  posture: Posture
  created_at: string
  updated_at: string
}
export interface DraftSection {
  id: string
  draft_id: string
  position: number
  label: string | null
  content: string                 // Tiptap HTML
  is_locked: boolean
  created_at: string
  updated_at: string
}
/** What the draft CARD needs, computed by the bundle from studio_drafts + sections (no mirror in content). */
export interface DraftSummary {
  id: string
  title: string
  kind: DraftKind
  posture: Posture
  sections: Array<{ id: string; label: string | null; is_locked: boolean; has_text: boolean }>
  updated_at: string
}
export interface DraftMessage { id: string; draft_id: string; role: 'person' | 'companion'; text: string; created_at: string }

// ── assets ─────────────────────────────────────────────────────────────────
export interface Asset {
  id: string
  project_id: string
  kind: 'image' | 'audio'
  storage_path: string
  thumb_path: string | null
  mime: string
  bytes: number
  width: number | null
  height: number | null
  duration_s: number | null
  envelope: number[] | null
  own_voice: boolean
  transcript: string | null
  created_at: string
}
/** Asset as delivered to the client: signed urls (60 min), never storage paths. */
export interface AssetView extends Omit<Asset, 'storage_path' | 'thumb_path'> {
  url: string
  thumb_url: string | null
}

// ── since you were here ────────────────────────────────────────────────────
export interface SincePayload {
  cutoff: string
  last_opened_at: string
  canvas_version: number
  last_said: { text: string; at: string; kind: TalkKind } | null
  arrived_since: number
  waiting: number
  compass_pending: number
  catches_unmarked: number
  commitments_open: number
}

// ── the bundle one GET returns ─────────────────────────────────────────────
export interface ProjectBundle {
  project: Project
  concept: ConceptRevision
  blocks: AnyBlock[]                // live rows (deleted_at null), including stacked children
  links: Link[]
  compass: CompassEntry[]           // pending + active + dormant (rejected excluded)
  catches: Catch[]                  // unmarked + last 10 marked
  drafts: DraftSummary[]
  assets: AssetView[]
  since: SincePayload
}

export interface ShelfProject extends Project {
  concept_body: string              // first 200 chars of the latest revision body
  since: SincePayload
}

// ── API payloads ───────────────────────────────────────────────────────────
export interface CreateProjectRequest {
  title: string
  concept: { body: string; constraints: string[] }
  anchors: string[]                                          // ticked verbatim phrases
  references: Array<{ url: string; title: string; note: string }>
  compass_seed: Array<{ kind: 'refusal' | 'non_negotiable'; statement: string; quote: string }>
}
export interface PatchProjectRequest {
  title?: string
  status?: ProjectStatus
  completion_note?: string
  viewport?: Viewport
  settings?: Partial<ProjectSettings>
  auto_layout?: boolean
  composed_at?: string
}
export interface BlocksBatchRequest {
  upserts: AnyBlock[]               // FULL rows (D-030)
  deletes: string[]                 // soft-deleted ids
  restores?: string[]               // undo of a delete: deleted_at ← null
}
export interface BlocksBatchResponse { canvas_version: number; applied: number }
export interface ArrivalActionRequest { action: 'place' | 'dismiss'; x?: number; y?: number; placed_by?: PlacedBy }
export interface StrikeRequest { sentence: string }
export interface CreateLinkRequest { id: string; from_block_id: string; to_block_id: string; word: string | null }
export interface CompassDecideRequest {
  action: 'confirm' | 'correct' | 'reject' | 'forget' | 'restore' | 'resolve'
  statement?: string                // correct
  note?: string                     // reject
  resolution?: 'done' | 'let_go'    // resolve (commitments)
}
export interface CatchMarkRequest { mark: 'right' | 'wrong' }
export interface TalkRequest { text: string; input: 'typed' | 'voice'; kind: TalkKind }
export interface TalkMeta {
  person_entry_id: string
  companion_entry_id: string
  applied: TalkApplied
  blocks: AnyBlock[]                // the arrival rows inserted (full rows, so the client needs no refetch)
  compass: CompassEntry[]           // the compass rows inserted or reinforced
  catch: Catch | null
  truncated: boolean
}
export interface TalkApplied {
  block_ids: string[]               // arrivals inserted (updates + commitment blocks)
  compass_pending_ids: string[]
  reinforced_ids: string[]
  suggest_done_ids: string[]        // commitments the person said were done → "tick it?"
}
export interface DraftChatRequest {
  message: string
  section_id: string | null
  selected_text: string | null
  history: Array<{ role: 'person' | 'companion'; text: string }>
}
export interface SignUploadRequest { project_id: string; kind: 'image' | 'audio'; mime: string; bytes: number; ext: string; thumb?: boolean }
export interface SignUploadResponse { asset_id: string; path: string; token: string; thumb_path: string | null; thumb_token: string | null }
export interface CommitAssetRequest {
  asset_id: string; width?: number; height?: number; duration_s?: number
  envelope?: number[]; own_voice?: boolean; transcript?: string | null
}
export interface DraftConceptRequest {
  mode: 'brief' | 'questions'
  brief?: string
  answers?: [string, string, string, string]
}
export interface DraftConceptResponse {
  title: string
  body: string
  constraints: string[]
  anchor_candidates: string[]        // verbatim, validated, ≤ 3
  references: Array<{ url: string; title: string; note: string }>
  compass_seed: Array<{ kind: 'refusal' | 'non_negotiable'; statement: string; quote: string }>
}

// ── the sort (MODELS.fast) and what the prompt builder may read ────────────
export interface TalkSort {
  update: { text: string } | null
  commitments: Array<{ text: string }>
  compass: Array<{ kind: 'refusal' | 'non_negotiable' | 'drift'; statement: string; quote: string; reinforce_id: string | null }>
  decisions: Array<{ text: string; collides_with: string | null }>
  done_commitment_ids: string[]
}

/** The ONLY shape the prompt context builder accepts from a block (D-059). No url, asset id, path or swatch can exist here. */
export type CompanionReadable =
  | { type: 'concept'; body: string; constraints: string[] }
  | { type: 'update'; text: string; at: string; struck: string | null }
  | { type: 'anchor'; text: string; struck: string | null }
  | { type: 'note'; text: string; struck: string | null }
  | { type: 'reference'; title: string; note: string; struck: string | null }
  | { type: 'commitment'; text: string; at: string }
  | { type: 'heading'; text: string }
  | { type: 'image'; captions: string[] }
  | { type: 'recording'; title: string; note: string; own_transcript: string | null }

// ── engine-facing (shared so B, C–E and F agree) ──────────────────────────
export type ObjectClass = 'paper' | 'paperless' | 'media'
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
export interface TypeSpec {
  class: ObjectClass
  accent: Hue | null
  autoHeight: boolean
  aspectLocked: boolean
  defaultW: number; defaultH: number
  minW: number; maxW: number
  minH: number; maxH: number
  handles: readonly Handle[]
  selectable: boolean
  deletable: boolean
  duplicable: boolean
  editableInPlace: boolean
  opens: 'none' | 'draft' | 'compass' | 'lightbox' | 'timeline'
  region: 'top' | 'column' | 'wide' | 'grid' | 'media' | 'none'   // compose region (F)
  label: string                                                   // lowercase library name
  holds: string                                                   // one-line "what it holds"
}
export type Registry = Record<BlockType, TypeSpec>

export interface Placement { id: string; x: number; y: number; w: number; h: number }
export interface DirtyPatch {
  upserts: Map<string, AnyBlock>
  deletes: Set<string>
  restores: Set<string>
  links_add: Map<string, Link>
  links_delete: Set<string>
  project: Partial<PatchProjectRequest>
}

export const RELATIVE_DAYS_DECAY = 150 as const
export const DRIFT_DAYS_DECAY = 30 as const
export const PENDING_CAP = 8 as const
