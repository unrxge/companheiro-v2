'use client'

// studio/src/components/draft/posture-control.tsx — the assistant posture, in
// one place. Set per project and overridable per section; three states only:
// suggest (it offers), ask (it asks first), locked (it stays out). The draft
// block's settings panel and the draft studio's header both read from here so
// the words and the order never drift between them.

import { canvasType } from '@/lib/studio/canvas-tokens'
import { useTheme } from '@/components/theme/theme-provider'
import type { Posture } from '@/lib/studio/types'
import { PanelSection, SegmentControl } from '@/components/canvas/chrome/panel'

export const POSTURE_OPTIONS: Array<{ value: Posture; label: string }> = [
  { value: 'suggest', label: 'suggest' },
  { value: 'ask', label: 'ask' },
  { value: 'locked', label: 'locked' },
]

/** One line of plain language per posture, shown under the control. */
export const POSTURE_HINT: Record<Posture, string> = {
  suggest: 'it offers edits as you write. nothing lands without you.',
  ask: 'it asks before it touches anything.',
  locked: 'it stays out of this writing.',
}

export function PostureControl({
  value,
  onChange,
  disabled = false,
  label = 'the companion here',
}: {
  value: Posture
  onChange: (next: Posture) => void
  disabled?: boolean
  label?: string
}) {
  const { t } = useTheme()
  return (
    <PanelSection label={label}>
      <div style={{ opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
        <SegmentControl<Posture> options={POSTURE_OPTIONS} value={value} onChange={onChange} />
        <p style={{ ...canvasType.small, color: t.textSecondary, margin: '8px 0 0' }}>{POSTURE_HINT[value]}</p>
      </div>
    </PanelSection>
  )
}
