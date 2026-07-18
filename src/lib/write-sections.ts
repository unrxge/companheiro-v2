import type { AuthedContext } from './supabase/route'

export interface PieceSection {
  id: string
  position: number
  label: string | null
  intended_emotion: string | null
  content: string
  is_locked: boolean
}

// Recomputes pieces.substack_draft as the ordered concatenation of a piece's
// sections, joined by blank lines. Called after any section mutation so every
// downstream consumer (translate, chat context, word count, Test, project
// board) keeps reading substack_draft and stays section-unaware.
export async function resyncPieceDraft(
  { supabase, user }: AuthedContext,
  pieceId: string
): Promise<void> {
  const { data: sections } = await supabase
    .from('piece_sections')
    .select('content, position')
    .eq('piece_id', pieceId)
    .eq('user_id', user.id)
    .order('position', { ascending: true })

  const flattened = (sections || [])
    .map((s) => (s.content || '').trim())
    .filter((c) => c.length > 0)
    .join('\n\n')

  await supabase
    .from('pieces')
    .update({ substack_draft: flattened })
    .eq('id', pieceId)
    .eq('user_id', user.id)
}
