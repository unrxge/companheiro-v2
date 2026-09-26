// Server-side helpers for Write mode's five modes (Gather/Shape/Write/Test/
// Reimagine) once repointed onto the node/thread model (Phase 3 of the
// Project Board -> Studio migration). A "piece" here is always a root
// studio_node (parent_id null); its Write-mode "sections" are that node's
// children, ordered by position — the same rows Studio's own canvas UI
// (components/studio/work/studio.tsx) renders as "parts".
//
// This module intentionally talks to studio_nodes directly with plain
// supabase calls, the same way the pre-Phase-3 /api/write/* routes talked
// directly to pieces/piece_sections, rather than going through
// lib/studio/nodes-db.ts's requireNode/NODE_COLS helpers — those are shared
// with Studio's own canvas API and this module has no reason to couple to
// them beyond the column names, which are the same either way.

import type { AuthedContext } from '../supabase/route'
import { htmlToPlainText } from '../rich-text'
import { wordCount } from './tree'

/** body + extent together, so every write to a child node's prose keeps the
 *  storyline axis (Studio's own canvas view of the same rows) honest — the
 *  same pairing lib/studio/nodes-db.ts's generic node PATCH route maintains,
 *  reproduced here since Write mode's routes write studio_nodes directly. */
export function bodyPatch(html: string): { body: string; extent: number } {
  return { body: html, extent: wordCount(html) }
}

/** A child node as Write mode's five modes see it — the same shape
 *  piece_sections used to have, sourced from studio_nodes instead. */
export interface WriteSection {
  id: string
  position: number
  label: string | null // studio_nodes.title
  intended_emotion: string | null // studio_nodes.beat
  content: string // studio_nodes.body (Tiptap HTML)
  is_locked: boolean
}

const SECTION_SELECT = 'id, position, title, beat, body, is_locked'

interface SectionRow {
  id: string
  position: number
  title: string | null
  beat: string | null
  body: string | null
  is_locked: boolean
}

function toSection(row: SectionRow): WriteSection {
  return {
    id: row.id,
    position: row.position,
    label: row.title || null,
    intended_emotion: row.beat || null,
    content: row.body || '',
    is_locked: row.is_locked,
  }
}

export async function loadWriteSections(
  { supabase, user }: AuthedContext,
  nodeId: string
): Promise<WriteSection[]> {
  const { data } = await supabase
    .from('studio_nodes')
    .select(SECTION_SELECT)
    .eq('parent_id', nodeId)
    .eq('user_id', user.id)
    .order('position', { ascending: true })
  return ((data as SectionRow[] | null) || []).map(toSection)
}

// Recomputes the root node's `body` as the ordered concatenation of its
// children's bodies, joined by blank lines — the studio_nodes equivalent of
// lib/write-sections.ts's resyncPieceDraft, kept so every downstream
// consumer (translate, reimagine, chat context, word count, Test) keeps
// reading the root's body and stays child-node-unaware. Same HTML-in,
// plain-text-out shape: children store Tiptap HTML, the flattened cache does
// not (it never did, as pieces.substack_draft).
//
// Only meaningful once the root has children — a root with none is itself
// the leaf being written (pre-Gather/ingest), and its own body is real
// Tiptap HTML, not a flattened cache; callers only invoke this after a child
// mutation, so that distinction is never at risk here.
export async function resyncNodeBody(auth: AuthedContext, rootNodeId: string): Promise<void> {
  const { supabase, user } = auth
  const { data } = await supabase
    .from('studio_nodes')
    .select('body, position')
    .eq('parent_id', rootNodeId)
    .eq('user_id', user.id)
    .order('position', { ascending: true })

  const flattened = ((data as Array<{ body: string | null }> | null) || [])
    .map((s) => htmlToPlainText(s.body || ''))
    .filter((c) => c.length > 0)
    .join('\n\n')

  await supabase
    .from('studio_nodes')
    .update({ body: flattened })
    .eq('id', rootNodeId)
    .eq('user_id', user.id)
}

/** After a change under `parentId`, refreshes that node's flattened body and every ancestor's, so Test, Reimagine and Translate read the words as they now are. */
export async function resyncFrom(auth: AuthedContext, parentId: string | null): Promise<void> {
  let current = parentId
  for (let hops = 0; current && hops < 8; hops++) {
    await resyncNodeBody(auth, current)
    const { data } = await auth.supabase
      .from('studio_nodes')
      .select('parent_id')
      .eq('id', current)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    current = (data as { parent_id: string | null } | null)?.parent_id ?? null
  }
}
