'use client'

// studio/src/components/talk/talk-bar.tsx — STUB (lane A, 11.1). Lane G replaces
// the body with the phone bottom bar (tap → talk sheet, hold → dictating). The
// exported signature stays: `TalkBar()`.

import { Mic } from 'lucide-react'
import { canvasType, geometry, glass, line, zIndex } from '@/lib/studio/canvas-tokens'

export function TalkBar() {
  return (
    <div
      data-talk-bar
      style={{
        position: 'fixed',
        left: 12,
        right: 12,
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        height: geometry.talkPillH,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 16px',
        backgroundColor: glass.bg,
        backdropFilter: glass.filter,
        WebkitBackdropFilter: glass.filter,
        border: `1px solid ${line.chrome}`,
        borderRadius: 999,
        color: glass.text,
        zIndex: zIndex.chrome,
      }}
    >
      <Mic size={16} strokeWidth={1.5} />
      <span style={{ ...canvasType.small, fontWeight: 500 }}>talk</span>
      <span style={{ ...canvasType.meta, color: glass.muted, marginLeft: 'auto' }}>soon</span>
    </div>
  )
}
