'use client'

// studio/src/components/draft/draft-studio.tsx — STUB (lane A, 11.1). Lane D
// replaces the body with the minimal studio (9.2: sections, per-section lock,
// posture control, anchor rail, chat). The exported signature stays:
// `DraftStudio({ draftId, readOnly?: boolean })`. Mounted chromeless by
// DrawerHost (and full-page by D's route), so it owns its header.

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { useDraftSummary } from '@/lib/studio/hooks'
import { DrawerHeader } from '@/components/canvas/drawers/drawer'

export function DraftStudio({ draftId, readOnly = false }: { draftId: string; readOnly?: boolean }) {
  const { t } = useTheme()
  const draft = useDraftSummary(draftId)
  return (
    <>
      <DrawerHeader eyebrow={draft ? `draft · ${draft.kind}` : 'draft'} title={draft?.title ?? 'draft'} showWider={!readOnly} />
      <div style={{ padding: 20 }}>
        <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>
          {readOnly ? 'reading only on this screen.' : 'the writing studio opens here once it is wired.'}
        </p>
      </div>
    </>
  )
}
