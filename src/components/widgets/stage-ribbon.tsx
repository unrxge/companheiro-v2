'use client'

import Link from 'next/link'
import { useTheme } from '@/components/theme/theme-provider'
import { fonts, JOURNEY_LABELS, PIECE_JOURNEY, type JourneyStep } from '@/lib/design-tokens'

/**
 * Where a piece is in its six-step journey. Compact on cards (bars only),
 * full on writing screens (bars + labels), and when `hrefFor` is given each
 * step becomes a link — this is the navigation between Write, Test, Shape,
 * Post and Reflect, which is what re-joins the orphaned screens to the loop.
 */
export function StageRibbon({
  step,
  compact = false,
  hrefFor,
  onSelect,
}: {
  step: JourneyStep
  compact?: boolean
  hrefFor?: (s: JourneyStep) => string | null
  onSelect?: (s: JourneyStep) => void
}) {
  const { t } = useTheme()
  const idx = PIECE_JOURNEY.indexOf(step)
  return (
    <div role="img" aria-label={`Stage: ${JOURNEY_LABELS[step]} (${idx + 1} of ${PIECE_JOURNEY.length})`}>
      <div style={{ display: 'flex', gap: compact ? 2 : 3, alignItems: 'center' }}>
        {PIECE_JOURNEY.map((s, i) => {
          const done = i < idx
          const now = i === idx
          const bar = (
            <span
              style={{
                display: 'block',
                width: '100%',
                height: compact ? (now ? 6 : 4) : now ? 10 : 7,
                borderRadius: 3,
                backgroundColor: done ? t.verdant : now ? t.ember : t.divider,
                transition: 'background-color 0.3s ease',
              }}
            />
          )
          const href = hrefFor?.(s) ?? null
          const interactive = !!href || !!onSelect
          const wrap: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, cursor: interactive ? 'pointer' : undefined, padding: interactive ? '4px 0' : 0 }
          if (href) {
            return (
              <Link key={s} href={href} aria-label={`Go to ${JOURNEY_LABELS[s]}`} style={wrap}>
                {bar}
              </Link>
            )
          }
          if (onSelect) {
            return (
              <button key={s} type="button" onClick={() => onSelect(s)} aria-label={`Go to ${JOURNEY_LABELS[s]}`} style={{ ...wrap, background: 'none', border: 'none' }}>
                {bar}
              </button>
            )
          }
          return (
            <span key={s} style={wrap}>
              {bar}
            </span>
          )
        })}
      </div>
      {!compact && (
        <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
          {PIECE_JOURNEY.map((s, i) => (
            <span
              key={s}
              style={{
                flex: 1,
                fontFamily: fonts.ui,
                fontSize: 10,
                fontWeight: i === idx ? 700 : 500,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: i === idx ? t.ember : i < idx ? t.textSecondary : t.textMuted,
                textAlign: i === 0 ? 'left' : i === PIECE_JOURNEY.length - 1 ? 'right' : 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {JOURNEY_LABELS[s]}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
