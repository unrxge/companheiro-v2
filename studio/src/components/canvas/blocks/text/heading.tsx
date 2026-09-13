'use client'

// studio/src/components/canvas/blocks/text/heading.tsx — the heading block
// (6.2): paperless, `headingLg` or `headingMd` by content.size, E/W resize
// reflows. In place: a single-line textarea (Enter commits). The size lives in
// the dock (HeadingSettings).

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { useStore } from '@/lib/studio/hooks'
import type { HeadingContent } from '@/lib/studio/types'
import { useActions } from '@/components/canvas/actions'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'
import { finishEdit, InlineTextarea } from '@/components/canvas/blocks/text/note'

export const HEADING_PLACEHOLDER = 'heading'

export function headingStyle(size: HeadingContent['size']) {
  return size === 'md' ? canvasType.headingMd : canvasType.headingLg
}

export function HeadingText({ content, color, mutedColor }: { content: HeadingContent; color: string; mutedColor: string }) {
  const text = content.text
  return (
    <div style={{ ...headingStyle(content.size), color: text ? color : mutedColor, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {text || HEADING_PLACEHOLDER}
    </div>
  )
}

export function HeadingBlock({ block, editing }: BlockRendererProps<'heading'>) {
  const { t } = useTheme()
  const store = useStore()
  const actions = useActions()

  if (editing) {
    return (
      <InlineTextarea
        initial={block.content.text}
        typeStyle={headingStyle(block.content.size)}
        color={t.textPrimary}
        placeholder={HEADING_PLACEHOLDER}
        ariaLabel="heading"
        singleLine
        onCommit={(v) => finishEdit(store, actions, block, { ...block.content, text: v.replace(/\s+/g, ' ').trim() })}
      />
    )
  }
  return <HeadingText content={block.content} color={t.textPrimary} mutedColor={t.textMuted} />
}
