// Server-side helpers for the write routes (seed, divide, ingest, anchor
// lines, and the flattened draft that Test, Reimagine and Translate read).
// A "piece" is a root studio_node (parent_id null); what the Write page called
// its sections are that node's children, ordered by position, the same rows
// the writing page renders as parts.

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
