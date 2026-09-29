// Document history for a piece (supabase/migrations/027_add_piece_revisions.sql).
//
// A revision is the piece as it stood just before something changed it: the
// first save of an editing stretch (at most one per EDIT_WINDOW), or anything
// that rewrites it wholesale (shaping into sections, removing a section, a
// restore). Snapshotting is best-effort everywhere — if the table isn't there
// yet or the insert fails, the save it guards goes ahead regardless.

import type { AuthedContext } from '../supabase/route'
import { bodyPatch, resyncNodeBody } from './write-nodes'
import { wordCount } from './tree'

export type RevisionReason = 'edit' | 'restructure' | 'remove' | 'restore'

export interface RevisionPart {
  id: string
  parent_id: string | null
  position: number
  title: string
  beat: string
  body: string
  is_leaf: boolean
}

const EDIT_WINDOW_MS = 10 * 60 * 1000
const KEEP = 300

interface Row {
  id: string
  project_id: string
  parent_id: string | null
  position: number
  title: string | null
  beat: string | null
  body: string | null
}

/** The piece (root node, parent_id null) a node belongs to. */
export async function pieceOf(auth: AuthedContext, nodeId: string): Promise<string | null> {
  let current: string | null = nodeId
  for (let hops = 0; current && hops < 10; hops++) {
    const res = await auth.supabase
      .from('studio_nodes')
      .select('id, parent_id')
      .eq('id', current)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    const data = res.data as { id: string; parent_id: string | null } | null
    if (!data) return null
    if (!data.parent_id) return data.id
    current = data.parent_id
  }
  return null
}

/** The piece and everything under it, in reading order. */
export async function readPiece(auth: AuthedContext, pieceId: string): Promise<{ projectId: string; parts: RevisionPart[] } | null> {
  const { data: root } = await auth.supabase
    .from('studio_nodes')
    .select('id, project_id')
    .eq('id', pieceId)
    .eq('user_id', auth.user.id)
    .maybeSingle()
  if (!root) return null
  const { data } = await auth.supabase
    .from('studio_nodes')
    .select('id, project_id, parent_id, position, title, beat, body')
    .eq('project_id', root.project_id)
    .eq('user_id', auth.user.id)
  const rows = (data as Row[] | null) ?? []
  const kids = new Map<string, Row[]>()
  for (const r of rows) {
    if (!r.parent_id) continue
    const list = kids.get(r.parent_id) ?? []
    list.push(r)
    kids.set(r.parent_id, list)
  }
  const parts: RevisionPart[] = []
  const walk = (r: Row, depth: number) => {
    const children = (kids.get(r.id) ?? []).sort((a, b) => a.position - b.position)
    const isLeaf = children.length === 0
    parts.push({
      id: r.id,
      parent_id: r.parent_id,
      position: r.position,
      title: r.title ?? '',
      beat: r.beat ?? '',
      body: isLeaf ? r.body ?? '' : '',
      is_leaf: isLeaf,
    })
    if (depth < 8) for (const c of children) walk(c, depth + 1)
  }
  const top = rows.find((r) => r.id === pieceId)
  if (!top) return null
  walk(top, 0)
  return { projectId: root.project_id, parts }
}

/**
 * Records the piece as it is right now. With `force` off, only when the last
 * revision is older than the edit window — so a stretch of typing becomes one
 * entry: the state before it began.
 */
export async function snapshotPiece(
  auth: AuthedContext,
  pieceId: string,
  reason: RevisionReason,
  { force = false }: { force?: boolean } = {}
): Promise<void> {
  try {
    const { supabase, user } = auth
    if (!force) {
      const { data: last, error } = await supabase
        .from('studio_piece_revisions')
        .select('created_at')
        .eq('piece_id', pieceId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) return
      if (last && Date.now() - new Date(last.created_at).getTime() < EDIT_WINDOW_MS) return
    }
    const piece = await readPiece(auth, pieceId)
    if (!piece) return
    const words = piece.parts.filter((p) => p.is_leaf).reduce((n, p) => n + wordCount(p.body), 0)
    if (words === 0 && reason === 'edit') return
    const { error: insertError } = await supabase.from('studio_piece_revisions').insert({
      user_id: user.id,
      piece_id: pieceId,
      reason,
      word_count: words,
      parts: piece.parts,
    })
    if (insertError) {
      console.error('snapshotPiece insert (non-fatal):', insertError.message)
      return
    }
    // Keep the newest KEEP; older ones go.
    const { data: old } = await supabase
      .from('studio_piece_revisions')
      .select('id')
      .eq('piece_id', pieceId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(KEEP, KEEP + 50)
    const ids = ((old as Array<{ id: string }> | null) ?? []).map((r) => r.id)
    if (ids.length) await supabase.from('studio_piece_revisions').delete().in('id', ids).eq('user_id', user.id)
  } catch (err) {
    console.error('snapshotPiece (non-fatal):', err)
  }
}

/** snapshotPiece for whichever piece a node belongs to. */
export async function snapshotFor(auth: AuthedContext, nodeId: string, reason: RevisionReason, opts?: { force?: boolean }): Promise<void> {
  try {
    const pieceId = await pieceOf(auth, nodeId)
    if (pieceId) await snapshotPiece(auth, pieceId, reason, opts)
  } catch (err) {
    console.error('snapshotFor (non-fatal):', err)
  }
}

/**
 * Puts the piece back the way a revision had it: every node in the revision
 * gets its words, title, beat and place back (recreated under its old id if
 * it was removed since), and nodes added since are removed. The current state
 * is recorded first, so a restore can itself be undone from the history.
 */
export async function restorePiece(auth: AuthedContext, pieceId: string, parts: RevisionPart[]): Promise<void> {
  const { supabase, user } = auth
  const current = await readPiece(auth, pieceId)
  if (!current) throw new Error('piece not found')
  await snapshotPiece(auth, pieceId, 'restore', { force: true })

  const now = new Set(current.parts.map((p) => p.id))
  const keep = new Set(parts.map((p) => p.id))

  // Parents before children, so a recreated part always has somewhere to go.
  const depth = new Map<string, number>()
  const byId = new Map(parts.map((p) => [p.id, p]))
  const depthOf = (p: RevisionPart): number => {
    if (depth.has(p.id)) return depth.get(p.id)!
    const parent = p.parent_id ? byId.get(p.parent_id) : undefined
    const d = parent ? depthOf(parent) + 1 : 0
    depth.set(p.id, d)
    return d
  }
  const ordered = [...parts].sort((a, b) => depthOf(a) - depthOf(b))

  const fieldsOf = (p: RevisionPart) => ({
    parent_id: p.parent_id, position: p.position, title: p.title, beat: p.beat,
    ...(p.is_leaf ? bodyPatch(p.body) : {}),
  })

  // 1 · parts removed since come back under their old ids. A revision's
  //     parent is always in the revision, so it exists or was just recreated.
  for (const p of ordered) {
    if (p.id === pieceId || now.has(p.id)) continue
    const { error } = await supabase.from('studio_nodes').insert({
      id: p.id, user_id: user.id, project_id: current.projectId, status: 'open', ...fieldsOf(p),
    })
    if (error) throw error
  }

  // 2 · parts still here get their words and their place back — which also
  //     lifts them out from under anything added since, before step 3.
  for (const p of ordered) {
    if (!now.has(p.id)) continue
    if (p.id === pieceId) {
      // The piece's own title is its name everywhere; only its words come back.
      if (p.is_leaf) {
        const { error } = await supabase.from('studio_nodes').update(bodyPatch(p.body)).eq('id', p.id).eq('user_id', user.id)
        if (error) throw error
      }
      continue
    }
    const { error } = await supabase.from('studio_nodes').update(fieldsOf(p)).eq('id', p.id).eq('user_id', user.id)
    if (error) throw error
  }

  // 3 · parts added since go. Nothing kept is under them any more.
  const gone = current.parts.filter((p) => !keep.has(p.id) && p.id !== pieceId).map((p) => p.id)
  if (gone.length) {
    const { error } = await supabase.from('studio_nodes').delete().in('id', gone).eq('user_id', user.id)
    if (error) throw error
  }

  // Every node with children keeps a flattened copy of the words under it; deepest first.
  const withKids = ordered.filter((p) => !p.is_leaf).reverse()
  for (const p of withKids) await resyncNodeBody(auth, p.id)
}
