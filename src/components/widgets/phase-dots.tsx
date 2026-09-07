'use client'

import { useTheme } from '@/components/theme/theme-provider'
import { fonts } from '@/lib/design-tokens'

/**
 * Progress through a fixed sequence of named phases (Conceptualise's five).
 * Done dots fill violet, the current one is an ember ring, the rest are hollow.
 */
export function PhaseDots({ phase, labels, showLabel = true, onShell = false }: { phase: number; labels: string[]; showLabel?: boolean; onShell?: boolean }) {
  const { t } = useTheme()
  const total = labels.length
  const line = onShell ? 'rgba(236,233,226,0.14)' : t.divider
  const hollow = onShell ? '#0d0c0b' : t.cardBg
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }} role="img" aria-label={`Phase ${phase} of ${total}: ${labels[phase - 1]}`}>
      <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
        {labels.map((label, i) => {
          const n = i + 1
          const done = n < phase
          const now = n === phase
          return (
            <div key={label} style={{ display: 'contents' }}>
              <span
                title={label}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  flexShrink: 0,
                  backgroundColor: done ? t.violet : hollow,
                  border: `2px solid ${done ? t.violet : now ? t.ember : line}`,
                  boxShadow: now ? `0 0 0 4px ${t.soft.ember}` : 'none',
                  transition: 'background-color 0.3s ease, border-color 0.3s ease',
                }}
              />
              {i < total - 1 && <span style={{ flex: 1, height: 2, backgroundColor: done ? t.violet : line, transition: 'background-color 0.3s ease' }} />}
            </div>
          )
        })}
      </div>
      {showLabel && (
        <span style={{ fontFamily: fonts.ui, fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: onShell ? '#8a857c' : t.textMuted }}>
          {phase} · {labels[phase - 1]}
        </span>
      )}
    </div>
  )
}
