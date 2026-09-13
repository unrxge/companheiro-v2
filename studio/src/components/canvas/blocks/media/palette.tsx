'use client'

// studio/src/components/canvas/blocks/media/palette.tsx — the palette block (lane E,
// 6.2): 40 × 40 swatches at radius 6 with a hairline, the hex in mono 10 under
// each, an optional name in `small`. Clicking a swatch copies its hex. Empty →
// `add a colour`. The shell draws the eyebrow. Swatches are for the eyes: they
// never reach a model (D-059, CompanionReadable has no swatch).

import { useEffect, useRef, useState } from 'react'
import { Check } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType, line, motionSpec, radii } from '@/lib/studio/canvas-tokens'
import { useInteractive, useStore } from '@/lib/studio/hooks'
import { commitBlockContent } from '@/lib/studio/media/upload'
import { useActions } from '@/components/canvas/actions'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'
import { ChipButton, MediaStatus } from '@/components/canvas/blocks/media/image'

export const PALETTE_MAX = 12
/** The first swatch a hand-made palette gets: a neutral, so nothing is suggested. */
export const DEFAULT_HEX = '#8a857c'

/** `abc` · `#ABC` · `#aabbcc` → `#aabbcc`; anything else → null. */
export function normaliseHex(input: string): string | null {
  const s = input.trim().replace(/^#/, '').toLowerCase()
  if (/^[0-9a-f]{3}$/.test(s)) return `#${s.split('').map((c) => c + c).join('')}`
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`
  return null
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through
  }
  return false
}

export function Swatch({
  hex,
  name,
  size = 40,
  copied = false,
  onCopy,
}: {
  hex: string
  name: string | null
  size?: number
  copied?: boolean
  onCopy?: (hex: string) => void
}) {
  const { t } = useTheme()
  const label = name?.trim() ?? ''
  return (
    <button
      type="button"
      data-no-drag
      aria-label={`copy ${hex}`}
      onClick={(e) => {
        e.stopPropagation()
        onCopy?.(hex)
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: 6,
        width: Math.max(size, 56),
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: onCopy ? 'pointer' : 'default',
        color: t.textMuted,
        textAlign: 'left',
      }}
    >
      <span
        style={{
          position: 'relative',
          display: 'block',
          width: size,
          height: size,
          borderRadius: radii.swatch,
          backgroundColor: hex,
          boxShadow: `inset 0 0 0 1px ${line.onPaper(t)}`,
        }}
      >
        {copied && (
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radii.swatch,
              backgroundColor: t.containerBg,
              color: t.textPrimary,
            }}
          >
            <Check size={14} strokeWidth={1.5} />
          </span>
        )}
      </span>
      <span style={{ ...canvasType.chip, color: copied ? t.textPrimary : t.textMuted, transition: `color ${motionSpec.hoverMs}ms ease` }}>
        {copied ? 'copied' : hex}
      </span>
      {label && <span style={{ ...canvasType.small, color: t.textSecondary, lineHeight: 1.3, wordBreak: 'break-word' }}>{label}</span>}
    </button>
  )
}

const COPIED_MS = 1200

/** Copy feedback shared by the block and the sheet: which hex was just copied. */
export function useCopiedHex(): { copied: string | null; copy: (hex: string) => void } {
  const [copied, setCopied] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )
  const copy = (hex: string) => {
    void copyText(hex).then((ok) => {
      if (!ok) return
      setCopied(hex)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(null), COPIED_MS)
    })
  }
  return { copied, copy }
}

export function PaletteBlock({ block, phone }: BlockRendererProps<'palette'>) {
  const store = useStore()
  const actions = useActions()
  const interactive = useInteractive()
  const { copied, copy } = useCopiedHex()
  const swatches = block.content.swatches

  if (swatches.length === 0) {
    if (!interactive || phone) return <MediaStatus>no colours yet</MediaStatus>
    return (
      <div style={{ display: 'flex', alignItems: 'center', minHeight: 40 }}>
        <ChipButton
          onClick={() => {
            commitBlockContent(store, block, { swatches: [{ hex: DEFAULT_HEX, name: null }] })
            actions?.select([block.id])
            store.set((s) => {
              s.dock = { ...s.dock, right: 'selection' }
            })
          }}
        >
          add a colour
        </ChipButton>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 12px', alignItems: 'flex-start' }}>
      {swatches.slice(0, PALETTE_MAX).map((s, i) => (
        <Swatch key={`${s.hex}-${i}`} hex={s.hex} name={s.name} copied={copied === s.hex} onCopy={copy} />
      ))}
    </div>
  )
}
