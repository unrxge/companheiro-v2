'use client'

// studio/src/components/compass/compass-drawer.tsx — STUB (lane A, 11.1). Lane D
// replaces the body with the full compass (proposals with confirm · correct ·
// reject, active entries with forget, dormant with restore, commitments with
// done / let go, catches with right / wrong). The exported signature stays:
// `CompassDrawer()`. DrawerHost renders the header (eyebrow COMPASS, title compass).

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { useCompass } from '@/lib/studio/hooks'

export function CompassDrawer() {
  const { t } = useTheme()
  const compass = useCompass()
  const pending = compass.filter((e) => e.status === 'pending').length
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {pending > 0 && (
        <div style={{ ...canvasType.meta, color: t.tide }}>{pending} waiting</div>
      )}
      <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>
        {compass.length === 0 ? 'nothing here yet — it fills from what you say in talk' : 'the compass opens here once it is wired.'}
      </p>
    </div>
  )
}
