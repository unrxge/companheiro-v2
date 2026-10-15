// The core concept, changed after it was locked. Server only.
//
// A piece's core concept lives on its root node (core_truth, intent as the
// conviction, emotional_journey, open_threads) and nowhere else. The vision
// room and the concept on the writing page are two views of those same
// fields, and both change them through here, so whatever is changed in one is
// already in the other. Each change is kept with its date in
// settings.vision.changes, which is how either side can say "changed on 14
// Oct", and how the companion knows what moved since the concept was locked.

import type { AuthedContext } from '@/lib/supabase/route'
import { badRequest, fromDbError, notFound, nowIso } from '@/lib/studio/db'
import { changeVision } from './store'
import type { ConceptChange, ConceptField, VisionState } from './types'

const LIMIT: Record<ConceptField | 'open_thread', number> = {
  core_truth: 1200, intent: 4000, emotional_journey: 4000, open_thread: 400,
}
const CHANGES_KEPT = 80

interface PieceConcept {
  id: string
  project_id: string
  parent_id: string | null
  core_truth: string | null
  intent: string | null
  emotional_journey: string | null
  open_threads: string[] | null
}

/** The piece, checked to be a whole piece (not a part) of this project and this person's. */
export async function requirePiece(auth: AuthedContext, projectId: string, nodeId: string): Promise<PieceConcept> {
  const { data, error } = await auth.supabase
    .from('studio_nodes')
    .select('id, project_id, parent_id, core_truth, intent, emotional_journey, open_threads')
    .eq('id', nodeId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (error) throw fromDbError(error)
  const piece = data as PieceConcept | null
  if (!piece || piece.project_id !== projectId) throw notFound()
  if (piece.parent_id) throw badRequest('a core concept belongs to a whole piece')
  return piece
}

const clean = (text: string, max: number, multiline: boolean) =>
  (multiline ? text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n') : text.replace(/\s+/g, ' ')).trim().slice(0, max)

const threadsOf = (p: PieceConcept) => (p.open_threads ?? []).map((x) => x.trim()).filter(Boolean)
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

function logged(now: VisionState, change: Omit<ConceptChange, 'id' | 'at'>): VisionState {
  return { ...now, changes: [...now.changes, { ...change, id: crypto.randomUUID(), at: nowIso() }].slice(-CHANGES_KEPT) }
}

/** Rewrites one part of a piece's core concept. Returns the field as it now reads. */
export async function editConcept(
  auth: AuthedContext,
  projectId: string,
  args: { nodeId: string; field: ConceptField; text: string; source: ConceptChange['source']; also?: (now: VisionState) => VisionState },
): Promise<string> {
  const piece = await requirePiece(auth, projectId, args.nodeId)
  const next = clean(args.text, LIMIT[args.field], args.field === 'emotional_journey')
  if (!next) throw badRequest('a core concept cannot be left empty there')
  const was = (piece[args.field] ?? '').trim()
  if (was !== next) {
    const { error } = await auth.supabase.from('studio_nodes').update({ [args.field]: next }).eq('id', piece.id).eq('user_id', auth.user.id)
    if (error) throw fromDbError(error)
    if (args.field === 'intent') await followConviction(auth, projectId, was, next)
  }
  await changeVision(auth, projectId, (now) => {
    const after = args.also ? args.also(now) : now
    return was === next ? after : logged(after, { node_id: piece.id, field: args.field, from: was, to: next, source: args.source })
  })
  return next
}

/**
 * A project of one piece was born from one idea: what the whole thing is for
 * and that piece's conviction are the same sentence (the core concept's save
 * writes it to both). When the conviction moves, so does the project's, unless
 * someone has since written the project's own words there.
 */
async function followConviction(auth: AuthedContext, projectId: string, was: string, next: string): Promise<void> {
  const [{ count }, { data: project }] = await Promise.all([
    auth.supabase.from('studio_nodes').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('user_id', auth.user.id).is('parent_id', null),
    auth.supabase.from('studio_projects').select('intent').eq('id', projectId).eq('user_id', auth.user.id).maybeSingle(),
  ])
  if (count !== 1 || !project) return
  const theirs = ((project as { intent: string | null }).intent ?? '').trim()
  if (theirs && theirs !== was) return
  const { error } = await auth.supabase.from('studio_projects').update({ intent: next }).eq('id', projectId).eq('user_id', auth.user.id)
  if (error) throw fromDbError(error)
}

/** Replaces a piece's open threads as a whole: one per line. Returns them as they now read. */
export async function setOpenThreads(
  auth: AuthedContext,
  projectId: string,
  args: { nodeId: string; text: string; source: ConceptChange['source']; also?: (now: VisionState) => VisionState },
): Promise<string[]> {
  const piece = await requirePiece(auth, projectId, args.nodeId)
  const next = args.text.split('\n').map((l) => clean(l.replace(/^[\-\*•—]\s*/, ''), LIMIT.open_thread, false)).filter(Boolean)
    .filter((l, i, all) => all.findIndex((x) => same(x, l)) === i).slice(0, 20)
  const was = threadsOf(piece)
  const moved = was.join('\n') !== next.join('\n')
  if (moved) {
    const { error } = await auth.supabase.from('studio_nodes').update({ open_threads: next }).eq('id', piece.id).eq('user_id', auth.user.id)
    if (error) throw fromDbError(error)
  }
  await changeVision(auth, projectId, (now) => {
    const after = args.also ? args.also(now) : now
    return moved ? logged(after, { node_id: piece.id, field: 'open_threads', from: was.join('\n'), to: next.join('\n'), source: args.source }) : after
  })
  return next
}

/** Adds an open thread to a piece's core concept, unless it is already there. */
export async function addOpenThread(
  auth: AuthedContext,
  projectId: string,
  args: { nodeId: string; text: string; source: ConceptChange['source']; also?: (now: VisionState) => VisionState },
): Promise<string[]> {
  const piece = await requirePiece(auth, projectId, args.nodeId)
  const line = clean(args.text, LIMIT.open_thread, false)
  if (!line) throw badRequest('the question needs words')
  const threads = threadsOf(piece)
  const fresh = !threads.some((x) => same(x, line))
  const next = fresh ? [...threads, line] : threads
  if (fresh) {
    const { error } = await auth.supabase.from('studio_nodes').update({ open_threads: next }).eq('id', piece.id).eq('user_id', auth.user.id)
    if (error) throw fromDbError(error)
  }
  await changeVision(auth, projectId, (now) => {
    const after = args.also ? args.also(now) : now
    return fresh ? logged(after, { node_id: piece.id, field: 'open_threads', from: '', to: line, source: args.source }) : after
  })
  return next
}

/** Takes an open thread out of a piece's core concept: answered, or no longer a question. */
export async function removeOpenThread(
  auth: AuthedContext,
  projectId: string,
  args: { nodeId: string; text: string; source: ConceptChange['source']; answer?: string; also?: (now: VisionState) => VisionState },
): Promise<string[]> {
  const piece = await requirePiece(auth, projectId, args.nodeId)
  const threads = threadsOf(piece)
  const next = threads.filter((x) => !same(x, args.text))
  if (next.length === threads.length) throw notFound()
  const { error } = await auth.supabase.from('studio_nodes').update({ open_threads: next }).eq('id', piece.id).eq('user_id', auth.user.id)
  if (error) throw fromDbError(error)
  await changeVision(auth, projectId, (now) => {
    const after = args.also ? args.also(now) : now
    return logged(after, { node_id: piece.id, field: 'open_threads', from: args.text.trim(), to: args.answer?.trim() ? `answered: ${args.answer.trim()}` : '', source: args.source })
  })
  return next
}
