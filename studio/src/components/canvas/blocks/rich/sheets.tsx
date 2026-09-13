'use client'

// studio/src/components/canvas/blocks/rich/sheets.tsx — phone bottom sheets for
// the rich blocks (D-040; lane D): a draft opens the read-only studio; the
// compass opens the compass sheet with its verbs (that is not arrangement); a
// frame lists what it holds.

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { shallowEqual, useCanvasStore, useStore } from '@/lib/studio/hooks'
import type { BlockSheetProps } from '@/components/canvas/blocks/registry'
import { displayName } from '@/components/canvas/blocks/fallback-block'
import { CompassSheet } from '@/components/compass/compass-sheet'
import { DraftStudio } from '@/components/draft/draft-studio'

export function DraftSheet({ block }: BlockSheetProps<'draft'>) {
  return <DraftStudio draftId={block.content.draft_id} readOnly />
}

export function CompassBlockSheet(_props: BlockSheetProps<'compass'>) {
  return <CompassSheet />
}

export function FrameSheet({ block }: BlockSheetProps<'frame'>) {
  const { t } = useTheme()
  const store = useStore()
  const names = useCanvasStore((s) => store.descendants(block.id).map((b) => displayName(b, s)), shallowEqual)
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...canvasType.eyebrow, color: t.textMuted }}>frame</div>
      <div style={{ ...canvasType.title, color: t.textPrimary }}>{(block.name?.trim() || 'frame').toLowerCase()}</div>
      {names.length === 0 ? (
        <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>nothing inside yet</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {names.map((n, i) => (
            <li key={i} style={{ ...canvasType.small, color: t.textSecondary }}>
              {n}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
