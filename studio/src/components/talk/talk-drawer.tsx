'use client'

// studio/src/components/talk/talk-drawer.tsx — STUB (lane A, 11.1). Lane G
// replaces the body with 8.1 (segmented talk | direction talk, Thread, Composer
// with dictation, streaming, meta handling). The exported signature stays:
// `TalkDrawer({ dictate?: boolean })`. It is mounted chromeless by DrawerHost, so
// it owns its header through DrawerHeader + useDrawerChrome().

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { DrawerHeader } from '@/components/canvas/drawers/drawer'

export function TalkDrawer({ dictate = false }: { dictate?: boolean }) {
  const { t } = useTheme()
  return (
    <>
      <DrawerHeader eyebrow="talk" title="talk" />
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, ...canvasType.label, color: t.textMuted }}>
          <span style={{ color: t.textPrimary }}>talk</span>
          <span>direction talk</span>
        </div>
        <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>
          {dictate ? 'listening starts here once talk is wired.' : 'the conversation opens here once talk is wired.'}
        </p>
      </div>
    </>
  )
}
