'use client'

import { useTheme } from '@/components/theme/theme-provider'
import { fonts, type MeaningKey } from '@/lib/design-tokens'

export interface ProportionSegment {
  label: string
  value: number
  hue: MeaningKey
}

/**
 * Home's "Ideas" bar, generalised: a pill track split proportionally, with
 * a legend of counts beneath. The house style for "how does a total split".
 */
export function ProportionBar({ segments, legend = true, height = 10 }: { segments: ProportionSegment[]; legend?: boolean; height?: number }) {
  const { t } = useTheme()
  const total = segments.reduce((a, s) => a + s.value, 0)
  return (
    <div>
      <div
        role="img"
        aria-label={segments.map((s) => `${s.label} ${s.value}`).join(', ')}
        style={{ display: 'flex', width: '100%', height, borderRadius: 999, overflow: 'hidden', backgroundColor: t.divider, gap: 2 }}
      >
        {total > 0 &&
          segments
            .filter((s) => s.value > 0)
            .map((s) => (
              <div key={s.label} style={{ flexGrow: s.value, flexBasis: 0, backgroundColor: t[s.hue], transition: 'flex-grow 0.4s ease' }} />
            ))}
      </div>
      {legend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, marginTop: 14 }}>
          {segments.map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t[s.hue], display: 'inline-block' }} />
              <span style={{ fontFamily: fonts.display, fontSize: 20, color: t.textPrimary, fontVariantNumeric: 'tabular-nums', fontVariationSettings: '"opsz" 144' }}>{s.value}</span>
              <span style={{ fontFamily: fonts.ui, fontSize: 12, color: t.textMuted }}>{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
