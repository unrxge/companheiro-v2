'use client'

// studio/src/components/canvas/blocks/fallback-block.tsx — what an unregistered
// type renders (lane A): the type word and the first line of its content. Also
// home to the small read helpers every chrome panel shares (first line, type word,
// short lowercase dates) so they are defined once.

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { registry } from '@/lib/studio/registry'
import type { CanvasState } from '@/lib/studio/store'
import type { AnyBlock, BlockType } from '@/lib/studio/types'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** `12 sep` — lowercase day + month (D-065). Adds the year only when it differs from now. */
export function shortDate(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`
}

/** `09:14` */
export function shortTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Lowercase relative words for the chrome: `just now`, `3 h ago`, `yesterday`, `12 sep`. */
export function relativeWords(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const s = Math.max(0, (now.getTime() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`
  if (s < 172800) return 'yesterday'
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`
  return shortDate(iso, now)
}

/** The type word as it reads in sentences (lowercase, plain). */
export function typeWord(type: BlockType): string {
  return registry[type].label
}

/** The type word as the eyebrow shows it (uppercase is applied by CSS; timeline reads `updates`). */
export function eyebrowWord(type: BlockType): string {
  if (type === 'timeline') return 'updates'
  return registry[type].label
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, '')
  } catch {
    return url
  }
}

function firstNonEmptyLine(text: string): string {
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (t) return t
  }
  return ''
}

/**
 * The first line of a block's content, for the chip, the layers list and the
 * fallback renderer. Blocks that are views onto typed rows read them from state.
 */
export function firstLineOf(block: AnyBlock, state?: Pick<CanvasState, 'concept' | 'project' | 'drafts' | 'compass'>): string {
  switch (block.type) {
    case 'concept':
      return state?.project.title || firstNonEmptyLine(state?.concept.body ?? '') || 'concept'
    case 'since':
      return 'since you were here'
    case 'update':
      return firstNonEmptyLine(block.content.text) || 'update'
    case 'timeline':
      return block.content.title || 'updates'
    case 'draft': {
      const d = state?.drafts.find((x) => x.id === block.content.draft_id)
      return d?.title || 'draft'
    }
    case 'anchor':
      return firstNonEmptyLine(block.content.text) || 'anchor line'
    case 'note':
      return firstNonEmptyLine(block.content.text) || 'note'
    case 'reference':
      return block.content.title || (block.content.url ? hostOf(block.content.url) : '') || firstNonEmptyLine(block.content.note) || 'reference'
    case 'commitment': {
      const e = state?.compass.find((x) => x.id === block.content.entry_id)
      return e?.statement || 'commitment'
    }
    case 'compass':
      return 'compass'
    case 'frame':
      return block.name || 'frame'
    case 'heading':
      return firstNonEmptyLine(block.content.text) || 'heading'
    case 'divider':
      return 'divider'
    case 'image':
      return firstNonEmptyLine(block.content.caption) || 'image'
    case 'gallery':
      return block.content.items.find((i) => i.caption.trim())?.caption.trim() || 'gallery'
    case 'recording':
      return block.content.title || firstNonEmptyLine(block.content.note) || 'recording'
    case 'palette':
      return block.content.swatches.map((s) => s.name || s.hex).filter(Boolean).join(' · ') || 'palette'
    default:
      return ''
  }
}

/** The name the layers list shows: the given name, else the first line. */
export function displayName(block: AnyBlock, state?: Pick<CanvasState, 'concept' | 'project' | 'drafts' | 'compass'>): string {
  return block.name?.trim() || firstLineOf(block, state)
}

/** Renders for any type without a registered renderer: the type word and the first line. */
export function FallbackBlock({ block }: BlockRendererProps) {
  const { t } = useTheme()
  const line = firstLineOf(block)
  const paperless = registry[block.type].class === 'paperless'
  return (
    <div style={{ minHeight: paperless ? 24 : undefined }}>
      {paperless && (
        <div style={{ ...canvasType.eyebrow, color: t.textMuted, marginBottom: 8 }}>{eyebrowWord(block.type)}</div>
      )}
      <div style={{ ...canvasType.body, color: line === typeWord(block.type) ? t.textMuted : t.textPrimary, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
        {line}
      </div>
    </div>
  )
}
