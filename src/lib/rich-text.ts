// Helpers for the Writing Studio's move from plain-text sections to a rich
// (Tiptap/ProseMirror) editor. Section content is stored as HTML from here
// on, but every section written before this change is still plain text in
// the database — these keep both shapes working without a migration.

const LOOKS_LIKE_HTML = /<[a-z][\s\S]*>/i

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Plain prose (paragraphs separated by a blank line) -> paragraph HTML. */
export function plainTextToHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  if (paragraphs.length === 0) return '<p></p>'
  return paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('')
}

/** A legacy plain-text section (or a fresh one from an AI-generation route
 *  that still returns plain prose) becomes HTML; anything already HTML-shaped
 *  passes through untouched. */
export function ensureHtml(content: string): string {
  if (!content) return content
  return LOOKS_LIKE_HTML.test(content) ? content : plainTextToHtml(content)
}

export function ensureSectionsHtml<T extends { content: string }>(sections: T[]): T[] {
  return sections.map((s) => ({ ...s, content: ensureHtml(s.content) }))
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

/** HTML -> readable plain text (block boundaries become blank lines), for
 *  word counts and for what the model sees as "current text". Regex-based
 *  rather than DOM-based on purpose: this needs to run identically in the
 *  browser and on the server (resyncPieceDraft flattens sections into
 *  pieces.substack_draft on every save), and the tag vocabulary here is
 *  entirely our own editor's output, not arbitrary HTML — a full parser
 *  buys nothing a browser-only DOM approach wouldn't have to fake server-side. */
export function htmlToPlainText(html: string): string {
  if (!html) return ''
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|li)>/gi, '\n\n')
  const stripped = withBreaks.replace(/<[^>]+>/g, '')
  return decodeEntities(stripped).replace(/\n{3,}/g, '\n\n').trim()
}
