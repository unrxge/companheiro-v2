'use client'

import { Divider } from '@/components/shell/page-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { type as typeRoles } from '@/lib/design-tokens'

/** A list of short lines, one per row, each led by a dash. Leading bullets in the text are dropped. */
export function DashedList({ text }: { text: string }) {
  const { t } = useTheme()
  const lines = text.split('\n').map((l) => l.replace(/^[\-\*•]\s*/, '').trim()).filter(Boolean)
  if (lines.length === 0) return null
  return (
    <div>
      {lines.map((line, i) => (
        <div key={i}>
          <div style={{ display: 'flex', gap: 10, ...typeRoles.ui, fontSize: 14, color: t.textPrimary, padding: '10px 0' }}>
            <span style={{ color: t.ember, flexShrink: 0 }}>—</span>
            <span>{line}</span>
          </div>
          {i < lines.length - 1 && <Divider />}
        </div>
      ))}
    </div>
  )
}
