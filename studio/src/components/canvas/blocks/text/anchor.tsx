'use client'

// studio/src/components/canvas/blocks/text/anchor.tsx — the anchor line (6.2):
// paperless, a 24 × 2 px ochre rule top-left, a 12 px gap, then the phrase in
// `anchor` type (display 32/1.1, balanced). The meta line `anchor · from an
// update` shows only on hover or selection (never on the phone); its row keeps
// its height so hovering never re-measures the block. E/W resize reflows. In
// place: a single-line textarea (Enter commits; Shift+Enter breaks a line).
// Ochre here is the one accent the type is allowed (D-043).

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType, motionSpec } from '@/lib/studio/canvas-tokens'
import { useStore } from '@/lib/studio/hooks'
import type { AnchorContent } from '@/lib/studio/types'
import { useActions } from '@/components/canvas/actions'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'
import { finishEdit, InlineTextarea } from '@/components/canvas/blocks/text/note'

export const ANCHOR_PLACEHOLDER = 'a phrase the project hangs on'
export const ANCHOR_RULE = { w: 24, h: 2, gap: 12 } as const

/** `anchor · from an update` / `anchor · by hand` */
export function anchorMeta(content: AnchorContent): string {
  return content.source_block_id ? 'anchor · from an update' : 'anchor · by hand'
}

export function AnchorRule() {
  const { t } = useTheme()
  return <i aria-hidden style={{ display: 'block', width: ANCHOR_RULE.w, height: ANCHOR_RULE.h, backgroundColor: t.ochre, marginBottom: ANCHOR_RULE.gap }} />
}

export function AnchorText({ text, color, mutedColor, size = 32 }: { text: string; color: string; mutedColor: string; size?: number }) {
  return (
    <p style={{ ...canvasType.anchor, fontSize: size, color: text ? color : mutedColor, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {text || ANCHOR_PLACEHOLDER}
    </p>
  )
}

export function AnchorBlock({ block, editing, selected, phone }: BlockRendererProps<'anchor'>) {
  const { t } = useTheme()
  const store = useStore()
  const actions = useActions()
  const [hover, setHover] = useState(false)
  const showMeta = !phone && (hover || selected || editing)

  return (
    <div onPointerEnter={phone ? undefined : () => setHover(true)} onPointerLeave={phone ? undefined : () => setHover(false)}>
      <AnchorRule />
      {editing ? (
        <InlineTextarea
          initial={block.content.text}
          typeStyle={canvasType.anchor}
          color={t.textPrimary}
          placeholder={ANCHOR_PLACEHOLDER}
          ariaLabel="anchor line"
          singleLine
          onCommit={(v) => finishEdit(store, actions, block, { ...block.content, text: v.trim() })}
        />
      ) : (
        <AnchorText text={block.content.text} color={t.textPrimary} mutedColor={t.textMuted} />
      )}
      <div
        aria-hidden={!showMeta}
        style={{
          ...canvasType.meta,
          color: t.textMuted,
          marginTop: 8,
          height: 15,
          lineHeight: '15px',
          opacity: showMeta ? 1 : 0,
          transition: `opacity ${motionSpec.hoverMs}ms ease`,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {anchorMeta(block.content)}
      </div>
    </div>
  )
}
