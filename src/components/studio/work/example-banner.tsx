'use client'

// Shown on an example project's canvas (lib/examples), where a project of
// one's own shows the plan's banner: says whose work it stands in for, where
// to look, that nothing in it can be changed, and the way to a project of
// one's own. Only on the canvas: inside a piece or the vision room the page
// speaks for itself.

import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { QuietButton } from '@/components/ui/buttons'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'

export function ExampleBanner({ who, note, onPutBack }: {
  /** "a songwriter halfway through an album" */
  who: string
  /** Anything this example has to say about itself (a generated voice). */
  note?: string
  /** Everything moved goes back where the example put it. */
  onPutBack: () => void
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
        Open a piece to see its core concept, its tasks and the lines kept for it. “Talk about the vision” shows the whole project on one page, with a conversation about it. Move anything on the canvas where you like; nothing else in it can be changed.{note ? ` ${note}` : ''}
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <QuietButton size="sm" onClick={() => router.push('/idea-lab')}>Start a project of your own</QuietButton>
        <button
          type="button"
          onClick={onPutBack}
          style={{ ...canvasType.small, fontSize: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: t.textSecondary, textDecoration: 'underline', textUnderlineOffset: 3 }}
        >
          Put everything back
        </button>
      </div>
    </div>
  )
}
