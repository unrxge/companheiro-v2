'use client'

import { useTheme } from '@/components/theme/theme-provider'
import { fonts, type MeaningKey } from '@/lib/design-tokens'

const CYCLE: MeaningKey[] = ['verdant', 'ochre', 'ember', 'violet', 'tide']

export interface Beat {
  label: string
  hue?: MeaningKey
  /** Relative width; defaults to label length. */
  weight?: number
}

/**
 * The emotional-journey "continuum": interlocking chevrons, one per beat,
 * each labelled beneath in its own colour. Widths are proportional.
 */
export function ChevronChain({ beats, height = 22, labels = true }: { beats: Beat[]; height?: number; labels?: boolean }) {
  const { t } = useTheme()
  if (beats.length === 0) return null
  const weights = beats.map((b) => Math.max(b.weight ?? b.label.length, 8))
  return (
    <div>
      <div style={{ display: 'flex', width: '100%', height }} role="img" aria-label={beats.map((b) => b.label).join(' → ')}>
        {beats.map((b, i) => {
          const hue = b.hue ?? CYCLE[i % CYCLE.length]
          const first = i === 0
          const last = i === beats.length - 1
          const clip = first
            ? 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)'
            : last
              ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%)'
              : 'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)'
          return (
            <div
              key={i}
              style={{
                flexGrow: weights[i],
                flexBasis: 0,
                height: '100%',
                backgroundColor: t[hue],
                clipPath: clip,
                marginLeft: first ? 0 : -10,
                borderRadius: first ? `${height / 2}px 0 0 ${height / 2}px` : last ? `0 ${height / 2}px ${height / 2}px 0` : 0,
                transition: 'flex-grow 0.4s ease',
              }}
            />
          )
        })}
      </div>
      {labels && (
        <div style={{ display: 'flex', width: '100%', marginTop: 8, gap: 8 }}>
          {beats.map((b, i) => (
            <span
              key={i}
              title={b.label}
              style={{
                flexGrow: weights[i],
                flexBasis: 0,
                minWidth: 0,
                fontFamily: fonts.ui,
                fontSize: 11,
                fontWeight: 500,
                color: t[b.hue ?? CYCLE[i % CYCLE.length]],
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
