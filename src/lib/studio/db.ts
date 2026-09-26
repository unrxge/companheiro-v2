// src/lib/studio/db.ts — route-side helpers (section 4 "helper
// conventions"). Every query goes through auth.supabase so RLS applies; the
// service role is never used. Storage paths never leave this module: assets
// reach the client as signed urls (D-059).

import { NextResponse } from 'next/server'
import { requireUser, type AuthedContext } from '@/lib/supabase/route'
import {
  BLOCK_TYPES,
  type Asset, type AssetView, type AnyBlock, type Catch, type CompassEntry, type ConceptRevision, type DraftSummary, type Link,
  type Project, type ProjectBundle, type ShelfProject, type SincePayload,
} from '@/lib/studio/types'

// ── errors ──────────────────────────────────────────────────────────────────

/** Thrown inside route bodies; `errorResponse` turns it into the JSON the spec lists. */
export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const notFound = () => new HttpError(404, 'not found')
export const badRequest = (message: string) => new HttpError(400, message)
export const conflict = (message: string) => new HttpError(409, message)

interface PgErrorLike { code?: string; message?: string; details?: string }

/** A Postgres error raised by a trigger (P0001) or a unique violation (23505) becomes a 409 with its message. */
export function fromDbError(err: PgErrorLike | null | undefined, fallback = 'internal'): HttpError {
  if (!err) return new HttpError(500, fallback)
  if (err.code === '23505') return new HttpError(409, 'already exists')
  if (err.code === 'P0001' && err.message) return new HttpError(409, err.message)
  if (err.code === '22P02' || err.code === '23514' || err.code === '23502' || err.code === '23503') {
    return new HttpError(400, err.message ?? 'bad input')
  }
  return new HttpError(500, fallback)
}

export function errorResponse(e: unknown): NextResponse {
  if (e instanceof HttpError) {
    if (e.status >= 500) console.error('[studio] internal:', e)
    return NextResponse.json({ error: e.status >= 500 ? 'internal' : e.message }, { status: e.status })
  }
  console.error('[studio] internal:', e)
  return NextResponse.json({ error: 'internal' }, { status: 500 })
}

export const unauthorized = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 })

/** Parses a JSON body from either application/json or text/plain (keepalive sends). Throws 400. */
export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  let raw = ''
  try {
    raw = await req.text()
  } catch {
    throw badRequest('unreadable body')
  }
  if (!raw.trim()) throw badRequest('empty body')
  try {
    return JSON.parse(raw) as T
  } catch {
    throw badRequest('invalid json')
  }
}

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
export const isString = (v: unknown): v is string => typeof v === 'string'
export const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every(isString)
export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => isString(v) && UUID_RE.test(v)

export const nowIso = () => new Date().toISOString()

/** Round to the 8 px grid (D-001). */
export const snap8 = (n: number) => Math.round(n / 8) * 8
export const ceil8 = (n: number) => Math.ceil(n / 8) * 8

// ── projects ────────────────────────────────────────────────────────────────

export async function getProject(auth: AuthedContext, projectId: string): Promise<Project | null> {
  if (!isUuid(projectId)) return null
  const { data, error } = await auth.supabase
    .from('studio_projects')
    .select('*')
    .eq('id', projectId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) throw fromDbError(error)
  return (data as Project | null) ?? null
}

/** Loads the project or throws 404. */
export async function requireProject(auth: AuthedContext, projectId: string): Promise<Project> {
  const p = await getProject(auth, projectId)
  if (!p) throw notFound()
  return p
}

/** Arrangement needs an active project (D-060). Talk and arrivals do not call this. */
export function assertProjectWritable(project: Project): void {
  if (project.status !== 'active') throw conflict(`project is ${project.status}`)
}

/**
 * One bump per write batch (D-031). PostgREST cannot express `canvas_version + 1`,
 * so this is an optimistic read-compare-write with three attempts; every attempt
 * that lands moves the version, which is all the poll compares.
 */
export async function bumpCanvasVersion(auth: AuthedContext, projectId: string): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: cur, error: readErr } = await auth.supabase
      .from('studio_projects')
      .select('canvas_version')
      .eq('id', projectId)
      .maybeSingle()
    if (readErr) throw fromDbError(readErr)
    if (!cur) throw notFound()
    const current = Number((cur as { canvas_version: number }).canvas_version)
    const next = current + 1
    const { data: upd, error: writeErr } = await auth.supabase
      .from('studio_projects')
      .update({ canvas_version: next })
      .eq('id', projectId)
      .eq('canvas_version', current)
      .select('canvas_version')
    if (writeErr) throw fromDbError(writeErr)
    if (upd && upd.length > 0) return Number((upd[0] as { canvas_version: number }).canvas_version)
  }
  // three concurrent writers: read whatever landed
  const { data } = await auth.supabase.from('studio_projects').select('canvas_version').eq('id', projectId).maybeSingle()
  return Number((data as { canvas_version: number } | null)?.canvas_version ?? 0)
}

export async function nextZ(auth: AuthedContext, projectId: string): Promise<number> {
  const { data, error } = await auth.supabase.rpc('studio_next_z', { p_project_id: projectId })
  if (error) throw fromDbError(error)
  const n = Number(data)
  return Number.isFinite(n) && n > 0 ? n : 1
}

export async function sinceFor(auth: AuthedContext, projectId: string): Promise<SincePayload | null> {
  const { data, error } = await auth.supabase.rpc('studio_since', { p_project_id: projectId })
  if (error) throw fromDbError(error)
  return (data as SincePayload | null) ?? null
}

// ── assets ──────────────────────────────────────────────────────────────────

const SIGNED_URL_SECONDS = 60 * 60
export const MEDIA_BUCKET = 'studio-media'

/** 60-minute signed urls for path + thumb; storage paths are dropped (D-059). */
export async function signAssets(auth: AuthedContext, assets: Asset[]): Promise<AssetView[]> {
  if (assets.length === 0) return []
  const paths = new Set<string>()
  for (const a of assets) {
    paths.add(a.storage_path)
    if (a.thumb_path) paths.add(a.thumb_path)
  }
  const urlByPath = new Map<string, string>()
  const { data, error } = await auth.supabase.storage.from(MEDIA_BUCKET).createSignedUrls([...paths], SIGNED_URL_SECONDS)
  if (error) {
    console.error('[studio] signAssets:', error)
  } else {
    for (const row of data ?? []) {
      if (row.path && row.signedUrl && !row.error) urlByPath.set(row.path, row.signedUrl)
    }
  }
  return assets.map((a) => {
    const { storage_path, thumb_path, ...rest } = a
    return {
      ...rest,
      url: urlByPath.get(storage_path) ?? '',
      thumb_url: thumb_path ? urlByPath.get(thumb_path) ?? null : null,
    }
  })
}

// ── drafts ──────────────────────────────────────────────────────────────────

/** Tiptap HTML → does it carry any text? (never a count, only yes/no) */
export function htmlHasText(html: string | null | undefined): boolean {
  if (!html) return false
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .trim()
  return text.length > 0
}

interface DraftRow { id: string; title: string; kind: DraftSummary['kind']; posture: DraftSummary['posture']; updated_at: string }
interface SectionRowLite { id: string; draft_id: string; position: number; label: string | null; content: string; is_locked: boolean }

export async function draftSummaries(auth: AuthedContext, projectId: string): Promise<DraftSummary[]> {
  const { data: drafts, error } = await auth.supabase
    .from('studio_drafts')
    .select('id, title, kind, posture, updated_at')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
  if (error) throw fromDbError(error)
  const rows = (drafts as DraftRow[] | null) ?? []
  if (rows.length === 0) return []
  const { data: sections, error: sErr } = await auth.supabase
    .from('studio_draft_sections')
    .select('id, draft_id, position, label, content, is_locked')
    .in('draft_id', rows.map((d) => d.id))
    .order('position', { ascending: true })
  if (sErr) throw fromDbError(sErr)
  const byDraft = new Map<string, SectionRowLite[]>()
  for (const s of (sections as SectionRowLite[] | null) ?? []) {
    const arr = byDraft.get(s.draft_id) ?? []
    arr.push(s)
    byDraft.set(s.draft_id, arr)
  }
  return rows.map((d) => toDraftSummary(d, byDraft.get(d.id) ?? []))
}

export function toDraftSummary(
  d: DraftRow,
  sections: Array<Pick<SectionRowLite, 'id' | 'label' | 'is_locked' | 'content'>>
): DraftSummary {
  return {
    id: d.id,
    title: d.title,
    kind: d.kind,
    posture: d.posture,
    sections: sections.map((s) => ({ id: s.id, label: s.label, is_locked: s.is_locked, has_text: htmlHasText(s.content) })),
    updated_at: d.updated_at,
  }
}

// ── the bundle ──────────────────────────────────────────────────────────────

export async function latestConcept(auth: AuthedContext, project: Project): Promise<ConceptRevision> {
  const { data, error } = await auth.supabase
    .from('studio_concept_revisions')
    .select('id, project_id, body, constraints, origin, created_at')
    .eq('project_id', project.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw fromDbError(error)
  const row = data as ConceptRevision | null
  if (row) return { ...row, constraints: Array.isArray(row.constraints) ? row.constraints : [] }
  // a project always has a creation revision; this only guards a half-created row
  return { id: '', project_id: project.id, body: '', constraints: [], origin: 'creation', created_at: project.created_at }
}

export async function loadBundle(auth: AuthedContext, projectId: string): Promise<ProjectBundle | null> {
  const project = await getProject(auth, projectId)
  if (!project) return null

  const sb = auth.supabase
  const [concept, blocksRes, linksRes, compassRes, unmarkedRes, markedRes, drafts, assetsRes, since] = await Promise.all([
    latestConcept(auth, project),
    sb.from('studio_blocks').select('*').eq('project_id', project.id).is('deleted_at', null).order('z', { ascending: true }),
    sb.from('studio_links').select('*').eq('project_id', project.id).order('created_at', { ascending: true }),
    sb.from('studio_compass_entries').select('*').eq('project_id', project.id).in('status', ['pending', 'active', 'dormant']).order('created_at', { ascending: true }),
    sb.from('studio_catches').select('*').eq('project_id', project.id).is('mark', null).order('created_at', { ascending: false }),
    sb.from('studio_catches').select('*').eq('project_id', project.id).not('mark', 'is', null).order('marked_at', { ascending: false }).limit(10),
    draftSummaries(auth, project.id),
    sb.from('studio_assets').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
    sinceFor(auth, project.id),
  ])

  for (const r of [blocksRes, linksRes, compassRes, unmarkedRes, markedRes, assetsRes]) {
    if (r.error) throw fromDbError(r.error)
  }

  const assets = await signAssets(auth, (assetsRes.data as Asset[] | null) ?? [])

  return {
    project,
    concept,
    blocks: (blocksRes.data as AnyBlock[] | null) ?? [],
    links: (linksRes.data as Link[] | null) ?? [],
    compass: ((compassRes.data as CompassEntry[] | null) ?? []).map(normaliseCompass),
    catches: [
      ...((unmarkedRes.data as Catch[] | null) ?? []),
      ...((markedRes.data as Catch[] | null) ?? []),
    ],
    drafts,
    assets,
    since: since ?? emptySince(project),
  }
}

export function normaliseCompass(e: CompassEntry): CompassEntry {
  return { ...e, evidence: Array.isArray(e.evidence) ? e.evidence : [] }
}

export function emptySince(project: Project): SincePayload {
  return {
    cutoff: project.opened_before_at,
    last_opened_at: project.last_opened_at,
    canvas_version: project.canvas_version,
    last_said: null,
    arrived_since: 0,
    waiting: 0,
    compass_pending: 0,
    catches_unmarked: 0,
    commitments_open: 0,
  }
}

// ── the shelf ───────────────────────────────────────────────────────────────

const statusRank = (s: Project['status']) => (s === 'active' ? 0 : s === 'resting' ? 1 : 2)

export async function shelfProjects(auth: AuthedContext): Promise<ShelfProject[]> {
  const { data, error } = await auth.supabase
    .from('studio_projects')
    .select('*')
    .eq('user_id', auth.user.id)
    .order('updated_at', { ascending: false })
  if (error) throw fromDbError(error)
  const projects = (data as Project[] | null) ?? []
  if (projects.length === 0) return []

  const rows = await Promise.all(
    projects.map(async (p) => {
      const [concept, since] = await Promise.all([latestConcept(auth, p), sinceFor(auth, p.id)])
      return {
        ...p,
        concept_body: concept.body.slice(0, 200),
        since: since ?? emptySince(p),
      } satisfies ShelfProject
    })
  )

  return rows.sort((a, b) => {
    const r = statusRank(a.status) - statusRank(b.status)
    return r !== 0 ? r : b.updated_at.localeCompare(a.updated_at)
  })
}

// ── route wrapper ───────────────────────────────────────────────────────────

/** requireUser() first, then the body; HttpError → its status, anything else → 500 { error: 'internal' }. */
export async function withAuth<R extends Response = NextResponse>(
  fn: (auth: AuthedContext) => Promise<R>,
): Promise<R | NextResponse> {
  try {
    const auth = await requireUser()
    if (!auth) return unauthorized()
    return await fn(auth)
  } catch (e) {
    return errorResponse(e)
  }
}

export const noContent = () => new NextResponse(null, { status: 204 })

// ── block rows ──────────────────────────────────────────────────────────────

const PLACED_BY: ReadonlySet<string> = new Set(['auto', 'person'])
const ARRIVAL_STATE: ReadonlySet<string> = new Set(['placed', 'unplaced'])

const optUuid = (v: unknown, field: string): string | null => {
  if (v === undefined || v === null || v === '') return null
  if (!isUuid(v)) throw badRequest(`${field} must be a uuid`)
  return v
}
const optIso = (v: unknown, field: string): string | null => {
  if (v === undefined || v === null || v === '') return null
  if (!isString(v) || Number.isNaN(Date.parse(v))) throw badRequest(`${field} must be a timestamp`)
  return v
}
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback)
const int = (v: unknown, field: string): number => {
  if (!isFiniteNumber(v)) throw badRequest(`${field} must be a number`)
  return Math.round(v)
}

/** The DB row a batch upsert / single create writes: every column the client owns, user_id + project_id forced. */
export type BlockRow = Omit<AnyBlock, 'updated_at'>

/** Validates one client block into a full row (D-030 full rows; D-001 integer geometry, w/h ≥ 8). */
export function sanitiseBlockRow(raw: unknown, ctx: { userId: string; projectId: string; allowMissingId?: boolean }): BlockRow {
  if (!isRecord(raw)) throw badRequest('block must be an object')
  const id = raw.id === undefined && ctx.allowMissingId ? crypto.randomUUID() : raw.id
  if (!isUuid(id)) throw badRequest('block id must be a uuid')
  if (!isString(raw.type) || !(BLOCK_TYPES as readonly string[]).includes(raw.type)) throw badRequest('unknown block type')
  const placed_by = raw.placed_by === undefined ? 'auto' : raw.placed_by
  if (!isString(placed_by) || !PLACED_BY.has(placed_by)) throw badRequest('placed_by must be auto or person')
  const arrival_state = raw.arrival_state === undefined ? 'placed' : raw.arrival_state
  if (!isString(arrival_state) || !ARRIVAL_STATE.has(arrival_state)) throw badRequest('arrival_state must be placed or unplaced')
  const name = raw.name === undefined || raw.name === null ? null : isString(raw.name) ? raw.name.slice(0, 120) : null
  const struck_by = raw.struck_by === undefined || raw.struck_by === null ? null : isString(raw.struck_by) ? raw.struck_by.slice(0, 280) : null
  const content = isRecord(raw.content) ? raw.content : {}
  const created_at = optIso(raw.created_at, 'created_at') ?? nowIso()

  return {
    id,
    user_id: ctx.userId,
    project_id: ctx.projectId,
    type: raw.type,
    x: int(raw.x ?? 0, 'x'),
    y: int(raw.y ?? 0, 'y'),
    w: Math.max(8, int(raw.w ?? 320, 'w')),
    h: Math.max(8, int(raw.h ?? 96, 'h')),
    z: int(raw.z ?? 0, 'z'),
    parent_id: optUuid(raw.parent_id, 'parent_id'),
    stacked_in: optUuid(raw.stacked_in, 'stacked_in'),
    name,
    locked: bool(raw.locked),
    hidden: bool(raw.hidden),
    collapsed: bool(raw.collapsed),
    placed_by: placed_by as AnyBlock['placed_by'],
    arrival_state: arrival_state as AnyBlock['arrival_state'],
    arrived_from: optUuid(raw.arrived_from, 'arrived_from'),
    struck_at: optIso(raw.struck_at, 'struck_at'),
    struck_by,
    content,
    created_at,
    deleted_at: optIso(raw.deleted_at, 'deleted_at'),
  } as BlockRow
}
