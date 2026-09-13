'use client'

// studio/src/components/canvas/blocks/text/reference.tsx — the reference block
// (6.2, D-059): a link chip first (28 px, radius 10, 1 px line.onPaper, mono 11
// `host ↗` in tide — the host is derived client-side from the url string), then
// the title the person gave (`title`, optional), then their note in `body`
// textSecondary. The page is never fetched, previewed or read; only the note is
// the companion's. In place: the note (url and title live in the dock).

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType, line } from '@/lib/studio/canvas-tokens'
import { useStore } from '@/lib/studio/hooks'
import { useActions } from '@/components/canvas/actions'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'
import { finishEdit, InlineTextarea } from '@/components/canvas/blocks/text/note'

export const REFERENCE_NOTE_PLACEHOLDER = 'your words about it'
export const REFERENCE_NO_LINK = 'no link yet'

/** Host of an http(s) url without `www.`; null when the string is not a web url. Never fetches. */
export function hostOf(url: string): string | null {
  const s = url.trim()
  if (!s) return null
  try {
    const u = new URL(s)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.host.replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/** The safe href: only http(s), else nothing. */
export function safeHref(url: string): string | null {
  return hostOf(url) ? url.trim() : null
}

/** The link chip; a real anchor when the url is a web url, a muted chip otherwise. */
export function ReferenceChip({ url }: { url: string }) {
  const { t } = useTheme()
  const host = hostOf(url)
  const href = safeHref(url)
  const base = {
    ...canvasType.meta,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: 28,
    padding: '0 10px',
    borderRadius: 10,
    border: `1px solid ${line.onPaper(t)}`,
    maxWidth: '100%',
    boxSizing: 'border-box' as const,
    whiteSpace: 'nowrap' as const,
    overflow: 'hidden',
  }
  if (!href || !host) {
    return (
      <span style={{ ...base, color: t.textMuted }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{url.trim() || REFERENCE_NO_LINK}</span>
      </span>
    )
  }
  return (
    <a
      data-no-drag
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={href}
      onClick={(e) => e.stopPropagation()}
      style={{ ...base, color: t.tide, textDecoration: 'none' }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{host}</span>
      <span aria-hidden>↗</span>
    </a>
  )
}

export function ReferenceBlock({ block, editing }: BlockRendererProps<'reference'>) {
  const { t } = useTheme()
  const store = useStore()
  const actions = useActions()
  const { url, title, note } = block.content

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 }}>
      <ReferenceChip url={url} />
      {title.trim() && <div style={{ ...canvasType.title, color: t.textPrimary, wordBreak: 'break-word', alignSelf: 'stretch' }}>{title.trim()}</div>}
      {editing ? (
        <InlineTextarea
          initial={note}
          typeStyle={canvasType.body}
          color={t.textSecondary}
          placeholder={REFERENCE_NOTE_PLACEHOLDER}
          ariaLabel="your note about the reference"
          onCommit={(v) => finishEdit(store, actions, block, { ...block.content, note: v.replace(/\s+$/, '') })}
          style={{ alignSelf: 'stretch' }}
        />
      ) : (
        <p style={{ ...canvasType.body, color: note ? t.textSecondary : t.textMuted, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', alignSelf: 'stretch' }}>
          {note || REFERENCE_NOTE_PLACEHOLDER}
        </p>
      )}
    </div>
  )
}
