'use client'

// Shown across an example project (lib/examples), where a project of one's
// own shows the plan's banner: says whose work it stands in for, where to
// look, that nothing in it can be changed, and the way to a project of one's own.

import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { QuietButton } from '@/components/ui/buttons'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'

export function ExampleBanner({ who, where }: {
  /** "a songwriter halfway through an album" */
  who: string
  /** The canvas says where to look on the canvas; a piece, where to look in a piece. */
  where: 'canvas' | 'piece'
}) {
  const { t } = useTheme()
  const router = useRouter()
  return (
    <div
      role="status"
      style={{
        border: `1px solid ${alpha(t.tide, 0.45)}`, background: alpha(t.tide, 0.08), borderRadius: radius.widget,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      <p style={{ ...canvasType.body, color: t.textPrimary, margin: 0 }}>
        An example: {who}.
      </p>
      <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>
        {where === 'canvas'
          ? 'Open a piece to see its core concept, its tasks and the lines kept for it. “Talk about the vision” shows the whole project on one page, with a conversation about it. It is here to look at: nothing in it can be changed.'
          : 'The rail on the right holds this piece’s core concept, its tasks and the lines kept for it. It is here to look at: nothing in it can be changed.'}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <QuietButton size="sm" onClick={() => router.push('/idea-lab')}>Start a project of your own</QuietButton>
      </div>
    </div>
  )
}
