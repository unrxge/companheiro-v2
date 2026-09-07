'use client'

import { useTheme } from '@/components/theme/theme-provider'
import { fonts, radius } from '@/lib/design-tokens'

export interface Facet {
  id: string
  statement: string
  /** 0–1: reinforcement relative to the strongest facet. Sets size. */
  weight: number
  /** 0–1: 1 = reinforced today, 0 = about to decay. Sets opacity. */
  freshness: number
  onClick?: () => void
}

/**
 * The portrait as facets. Reinforcement count sets size, time since last
 * reinforcement sets opacity, so the 15-cap and 150-day decay become visible
 * rather than hidden rules. Each facet is a button when `onClick` is given.
 */
export function FacetCloud({ facets, align = 'center' }: { facets: Facet[]; align?: 'center' | 'left' }) {
  const { t } = useTheme()
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: align === 'center' ? 'center' : 'flex-start', alignItems: 'center' }}>
      {facets.map((f) => {
        const w = Math.max(0, Math.min(1, f.weight))
        const fresh = Math.max(0.35, Math.min(1, f.freshness))
        const fontSize = 13 + w * 6
        const s: React.CSSProperties = {
          fontFamily: fonts.display,
          fontStyle: 'italic',
          fontSize,
          fontVariationSettings: `"opsz" ${Math.round(24 + w * 40)}, "SOFT" 50`,
          lineHeight: 1.3,
          color: t.textPrimary,
          backgroundColor: t.cardBg,
          boxShadow: t.shadow,
          borderRadius: 999,
          padding: `${6 + w * 4}px ${14 + w * 6}px`,
          opacity: fresh,
          border: 'none',
          cursor: f.onClick ? 'pointer' : 'default',
          textAlign: 'left',
          maxWidth: '100%',
          transition: 'transform 0.15s ease, opacity 0.3s ease',
        }
        if (f.onClick) {
          return (
            <button key={f.id} type="button" onClick={f.onClick} style={s} title="Open this facet">
              {f.statement}
            </button>
          )
        }
        return (
          <span key={f.id} style={{ ...s, borderRadius: radius.widget }}>
            {f.statement}
          </span>
        )
      })}
    </div>
  )
}
