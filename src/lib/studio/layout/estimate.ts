// src/lib/studio/layout/estimate.ts — height heuristic (7.1). Deterministic,
// shared by the create route, the talk route and the client; used only when a
// measured height is unknown. Pure; isomorphic; no DOM.
//
// inner = w − 32 for paper and media (16 px padding / caption inset each side), w for
// paperless. lines(text, fontPx, lh) = Σ over paragraphs of
// ceil(len · fontPx · 0.5 / inner) · fontPx · lh (Geist average advance ≈ 0.5 em).
// Every result is max(minH, ceil8(px)).

import { registry } from '@/lib/studio/registry'
import type { BlockType } from '@/lib/studio/types'
import { ceil8 } from '@/lib/studio/layout/constants'

const PAPER_PADDING = 16
const CAPTION_INSET = 16
/** eyebrow row (16) + gap (8) under the 16 px top padding: the 32 + 16 + 8 prefix of the table. */
const PAPER_HEAD = 32 + 16 + 8
const DEFAULT_IMAGE_ASPECT = 4 / 3

// ── content accessors (content is `unknown` at this boundary) ──────────────
function rec(content: unknown): Record<string, unknown> {
  return content && typeof content === 'object' ? (content as Record<string, unknown>) : {}
}
function str(content: unknown, key: string): string | null {
  const v = rec(content)[key]
  return typeof v === 'string' ? v : null
}
function num(content: unknown, key: string): number | null {
  const v = rec(content)[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}
function arr(content: unknown, key: string): unknown[] | null {
  const v = rec(content)[key]
  return Array.isArray(v) ? v : null
}

/** Usable text width inside a block of width w for this type. */
export function innerWidth(type: BlockType, w: number): number {
  const cls = registry[type].class
  const inset = cls === 'paperless' ? 0 : cls === 'media' ? CAPTION_INSET * 2 : PAPER_PADDING * 2
  return Math.max(1, w - inset)
}

/**
 * Text height in px. Paragraphs (\n) each take at least one line; empty text is one
 * line tall (an empty editor still shows a caret line). Monotone in text length.
 */
export function lines(text: string, fontPx: number, lh: number, inner: number): number {
  const width = Math.max(1, inner)
  const paragraphs = text.length === 0 ? [''] : text.split('\n')
  let n = 0
  for (const p of paragraphs) n += Math.max(1, Math.ceil((p.length * fontPx * 0.5) / width))
  return n * fontPx * lh
}

export function estimateH(
  type: BlockType,
  content: unknown,
  w: number,
  extra?: { sections?: number; rows?: number }
): number {
  const spec = registry[type]
  const inner = innerWidth(type, w)
  const px = raw(type, content, w, inner, extra)
  return Math.max(spec.minH, ceil8(px))
}

function raw(
  type: BlockType,
  content: unknown,
  w: number,
  inner: number,
  extra?: { sections?: number; rows?: number }
): number {
  const spec = registry[type]
  switch (type) {
    case 'concept': {
      // The concept's words live in studio_concept_revisions; callers that know them pass
      // { body, constraints } as content. Without a body there is nothing to measure.
      const body = str(content, 'body')
      if (body === null) return spec.defaultH
      const constraints = arr(content, 'constraints')?.length ?? 0
      return PAPER_HEAD + 26 + lines(body, 17, 1.45, inner) + 12 + constraints * 26
    }
    case 'since': {
      // 3 · 20 = 60 when there is something to say; default 40 when nothing.
      const rows = extra?.rows ?? arr(content, 'lines')?.length ?? 0
      return rows > 0 ? Math.max(rows, 3) * 20 : spec.defaultH
    }
    case 'update':
      return PAPER_HEAD + lines(str(content, 'text') ?? '', 16, 1.5, inner)
    case 'timeline': {
      const rows = extra?.rows
      if (rows === undefined) return spec.defaultH
      return PAPER_HEAD + Math.min(rows, 6) * 32 + (rows > 6 ? 20 : 0)
    }
    case 'draft': {
      const sections = extra?.sections ?? 1
      return PAPER_HEAD + 24 + 12 + Math.max(1, sections) * 22 + 12 + 20
    }
    case 'anchor':
      return 14 + lines(str(content, 'text') ?? '', 32, 1.1, inner)
    case 'note':
      return PAPER_HEAD + lines(str(content, 'text') ?? '', 15, 1.55, inner)
    case 'reference': {
      const title = str(content, 'title') ?? ''
      const note = str(content, 'note') ?? ''
      return PAPER_HEAD + 28 + 8 + (title ? 24 : 0) + lines(note, 15, 1.55, inner)
    }
    case 'commitment': {
      // The words live on the compass entry; callers that know them pass { text }.
      const text = str(content, 'text')
      if (text === null) return spec.defaultH
      return 32 + lines(text, 16, 1.5, inner) + 20
    }
    case 'compass': {
      const rows = extra?.rows ?? num(content, 'rows')
      if (rows === null || rows === undefined) return spec.defaultH
      return PAPER_HEAD + Math.max(1, rows) * 24 + 24
    }
    case 'heading': {
      const size = str(content, 'size') === 'lg' ? 24 : 18
      return lines(str(content, 'text') ?? '', size, 1.15, inner)
    }
    case 'divider':
      return 8
    case 'image': {
      const aspect = num(content, 'aspect')
      const a = aspect && aspect > 0 ? aspect : DEFAULT_IMAGE_ASPECT
      const caption = str(content, 'caption') ?? ''
      return w / a + (caption ? 16 + 20 + 16 : 0)
    }
    case 'gallery':
      return spec.defaultH // fixed-size: the stored h is the truth; this is the pre-measure default
    case 'frame': {
      const expanded = num(content, 'expanded_h')
      return expanded && expanded > 8 ? expanded : spec.defaultH
    }
    case 'recording': {
      const text = str(content, 'transcript') ?? str(content, 'note') ?? ''
      return 32 + 44 + 12 + 30 + 12 + 16 + lines(text, 13, 1.5, inner)
    }
    case 'palette': {
      const n = Math.max(1, arr(content, 'swatches')?.length ?? 1)
      const perRow = Math.max(1, Math.floor(inner / 48))
      return PAPER_HEAD + Math.ceil(n / perRow) * 62
    }
  }
}
