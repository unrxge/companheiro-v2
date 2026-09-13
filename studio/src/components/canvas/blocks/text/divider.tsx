'use client'

// studio/src/components/canvas/blocks/text/divider.tsx — the divider block
// (6.2): a 1 px `line.onPaper` hairline across the width inside an 8 px hit
// height (D-012: fixed height 8, width only). Nothing to edit, nothing to say.

import { useTheme } from '@/components/theme/theme-provider'
import { line } from '@/lib/studio/canvas-tokens'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'

export const DIVIDER_HIT_H = 8

export function DividerBlock(_props: BlockRendererProps<'divider'>) {
  const { t } = useTheme()
  return (
    <div aria-hidden style={{ height: DIVIDER_HIT_H, display: 'flex', alignItems: 'center', width: '100%' }}>
      <div style={{ width: '100%', height: 1, backgroundColor: line.onPaper(t) }} />
    </div>
  )
}
