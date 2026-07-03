import { formatDateAsRelative } from './dates'
import type { AuthedContext } from './supabase/route'

const STOPWORDS = new Set([
  'the', 'and', 'that', 'this', 'with', 'from', 'have', 'about', 'what',
  'when', 'where', 'which', 'would', 'could', 'should', 'there', 'their',
  'been', 'being', 'because', 'into', 'like', 'just', 'really', 'very',
  'more', 'some', 'them', 'then', 'than', 'over', 'only', 'also', 'your',
  'dont', "don't", 'want', 'need', 'feel', 'feels', 'feeling', 'think',
  'know', 'going', 'thing', 'things', 'today', 'right', 'still', 'much',
])

// Pull the significant words out of free text and build a Postgres
// to_tsquery OR-expression ("word1 | word2 | ..."). OR-matching keeps
// recall useful for long conversational queries where AND would match nothing.
function toSearchQuery(text: string, maxTerms = 8): string | null {
  const words = Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w))
    )
  ).slice(0, maxTerms)

  if (words.length === 0) return null
  return words.join(' | ')
}

interface Echo {
  kind: 'capture' | 'piece' | 'reflection'
  text: string
  when: string
}

// Full-text-search recall across the user's creative archive. Returns a
// formatted block for a system prompt, or '' when nothing resonates.
// Requires the fts columns from migration 009; degrades silently without them.
export async function recallEchoes(
  { supabase, user }: AuthedContext,
  queryText: string,
  limit = 4
): Promise<string> {
  const query = toSearchQuery(queryText)
  if (!query) return ''

  try {
    const [captures, pieces, reflections] = await Promise.all([
      supabase
        .from('captures')
        .select('unpacked, created_at')
        .eq('user_id', user.id)
        .textSearch('fts', query)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('pieces')
        .select('title, core_truth, created_at')
        .eq('user_id', user.id)
        .eq('stage', 'posted')
        .textSearch('fts', query)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase
        .from('post_publication_logs')
        .select('thread, what_it_opened, created_at')
        .eq('user_id', user.id)
        .textSearch('fts', query)
        .order('created_at', { ascending: false })
        .limit(limit),
    ])

    const echoes: Echo[] = []

    for (const c of captures.data || []) {
      if (c.unpacked) {
        echoes.push({ kind: 'capture', text: c.unpacked, when: c.created_at })
      }
    }
    for (const p of pieces.data || []) {
      echoes.push({
        kind: 'piece',
        text: `"${p.title}"${p.core_truth ? ` — core truth: ${p.core_truth}` : ''}`,
        when: p.created_at,
      })
    }
    for (const r of reflections.data || []) {
      const bits = [r.thread, r.what_it_opened].filter(Boolean).join(' — ')
      if (bits) echoes.push({ kind: 'reflection', text: bits, when: r.created_at })
    }

    if (echoes.length === 0) return ''

    const lines = echoes
      .slice(0, limit)
      .map((e) => `- [${e.kind}, ${formatDateAsRelative(e.when)}] ${e.text}`)

    return `ECHOES FROM THEIR ARCHIVE (older material that may resonate with what's being discussed — surface an echo only when it genuinely connects, e.g. "this echoes something you captured..."):\n${lines.join('\n')}`
  } catch (error) {
    // fts columns may not exist yet, or the query may be malformed — recall
    // is enrichment, never a dependency.
    console.error('recall error:', error)
    return ''
  }
}
