'use client'

// studio/src/components/canvas/blocks/text/since.tsx — "since you were here"
// (6.2, 8.8, D-026, D-032). Paperless, pinned under the concept by the engine,
// never selectable or editable (the registry says so; nothing here needs to
// enforce it). Up to three lines in `small` textSecondary from lane G's
// sinceSentence; the quoted last-said span in `words` at 15 px textPrimary; a
// 6 px tide dot before any line that has something waiting. First open reads
// `first time here`. The eyebrow row (`since you were here`) is registered as a
// function so the shell draws it like every other type word.

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { useSince } from '@/lib/studio/hooks'
import { sinceSentence } from '@/lib/studio/since'
import type { SincePayload } from '@/lib/studio/types'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'

export const SINCE_EYEBROW = 'since you were here'

/** 8.8's first-open rule, in one place. */
export function isFirstOpen(p: SincePayload): boolean {
  return !p.last_said && p.arrived_since === 0 && p.waiting === 0
}

/** Split a line into plain and “quoted” parts so the person's own words can be set in `words`. */
export function splitQuoted(text: string): Array<{ text: string; quoted: boolean }> {
  const out: Array<{ text: string; quoted: boolean }> = []
  const re = /“[^”]*”/g
  let last = 0
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at), quoted: false })
    out.push({ text: m[0], quoted: true })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), quoted: false })
  return out
}

/** The lines with their dots; shared by the block and the phone sheet. */
export function SinceLines({ lines, dots, gap = 4 }: { lines: string[]; dots: boolean[]; gap?: number }) {
  const { t } = useTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {lines.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          {dots[i] && <i aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.tide, flexShrink: 0, transform: 'translateY(-1px)' }} />}
          <span style={{ ...canvasType.small, color: t.textSecondary, minWidth: 0, wordBreak: 'break-word' }}>
            {splitQuoted(l).map((part, j) =>
              part.quoted ? (
                <span key={j} style={{ ...canvasType.words, fontSize: 15, color: t.textPrimary }}>
                  {part.text}
                </span>
              ) : (
                <span key={j}>{part.text}</span>
              )
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

export function useSinceLines(): { lines: string[]; dots: boolean[] } {
  const since = useSince()
  return sinceSentence(since, new Date(), isFirstOpen(since))
}

export function SinceBlock(_props: BlockRendererProps<'since'>) {
  const { lines, dots } = useSinceLines()
  return <SinceLines lines={lines} dots={dots} />
}
