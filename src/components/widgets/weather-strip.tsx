'use client'

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { arcHue, fonts, type Arc } from '@/lib/design-tokens'

export type Energy = 'low' | 'medium' | 'high'

export interface WeatherDay {
  /** ISO date or any label used as key + tooltip. */
  date: string
  energy: Energy | null
  arc: Arc | null
  weather?: string | null
  /** Optional first line of the entry, shown in the tooltip. */
  entry?: string | null
}

const ENERGY_H: Record<Energy, number> = { low: 0.32, medium: 0.62, high: 0.92 }

/**
 * Check-in signals over time. Height is energy, hue is arc texture; an empty
 * day is a faint stub so gaps read as gaps, not as low energy. Hover reveals
 * the weather word. Everything here already exists in `check_ins`.
 */
export function WeatherStrip({ days, height = 56, onSelect }: { days: WeatherDay[]; height?: number; onSelect?: (d: WeatherDay) => void }) {
  const { t } = useTheme()
  const [hover, setHover] = useState<number | null>(null)
  const active = hover !== null ? days[hover] : null
  return (
    <div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height, width: '100%' }} role="img" aria-label={`${days.length} days of check-in weather`}>
        {days.map((d, i) => {
          const empty = !d.energy || !d.arc
          const h = empty ? 0.14 : ENERGY_H[d.energy as Energy]
          const color = empty ? t.divider : t[arcHue[d.arc as Arc]]
          const dim = hover !== null && hover !== i
          return (
            <button
              key={d.date + i}
              type="button"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => onSelect?.(d)}
              aria-label={empty ? `${d.date}: no check-in` : `${d.date}: ${d.energy} energy, ${d.arc}${d.weather ? `, ${d.weather}` : ''}`}
              style={{
                flex: 1,
                minWidth: 0,
                height: `${h * 100}%`,
                border: 'none',
                padding: 0,
                borderRadius: '3px 3px 0 0',
                backgroundColor: color,
                opacity: dim ? 0.45 : empty ? 0.8 : 0.95,
                cursor: onSelect && !empty ? 'pointer' : 'default',
                transition: 'opacity 0.15s ease, height 0.3s ease',
              }}
            />
          )
        })}
      </div>
      <div style={{ minHeight: 18, marginTop: 8, fontFamily: fonts.ui, fontSize: 12, color: t.textSecondary, display: 'flex', gap: 10, alignItems: 'baseline' }}>
        {active && active.energy && active.arc ? (
          <>
            <span style={{ color: t.textMuted }}>{active.date}</span>
            <span style={{ fontFamily: fonts.display, fontStyle: 'italic', fontSize: 14, color: t.textPrimary }}>{active.weather || active.arc}</span>
            <span style={{ color: t[arcHue[active.arc]] }}>{active.arc}</span>
            <span style={{ color: t.textMuted }}>· {active.energy} energy</span>
          </>
        ) : active ? (
          <span style={{ color: t.textMuted }}>{active.date} · no check-in</span>
        ) : (
          <span style={{ color: t.textMuted }}>Height is energy, colour is arc. Hover a day.</span>
        )}
      </div>
    </div>
  )
}
