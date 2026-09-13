'use client'

// studio/src/components/compass/compass-sheet.tsx — the compass on a phone
// (D-040, D-053; lane D): the same sections and the same four verbs, in a sheet
// (lane B's BlockSheet mounts it through the registry) or full-page at
// /p/:id/compass. Marking and deciding is not arrangement, so it works on a
// read-only project too.

import { X } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType, line } from '@/lib/studio/canvas-tokens'
import { DrawerIcon } from '@/components/canvas/drawers/drawer'
import { CompassSections, useCompassRefresh } from '@/components/compass/compass-drawer'

export function CompassSheet({ onClose }: { onClose?: () => void }) {
  const { t } = useTheme()
  useCompassRefresh()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', backgroundColor: t.containerBg }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
          padding: '18px 20px 14px',
          borderBottom: `1px solid ${line.onPaper(t)}`,
          flexShrink: 0,
        }}
      >
        <div>
          <div style={{ ...canvasType.eyebrow, color: t.textMuted, marginBottom: 4 }}>compass</div>
          <div style={{ ...canvasType.title, color: t.textPrimary }}>compass</div>
        </div>
        {onClose && <DrawerIcon ariaLabel="close" onClick={onClose} icon={<X size={16} strokeWidth={1.5} />} />}
      </div>
      <div style={{ padding: '16px 20px calc(32px + env(safe-area-inset-bottom, 0px))', overflowY: 'auto' }}>
        <CompassSections />
      </div>
    </div>
  )
}
