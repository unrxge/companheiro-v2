'use client'

import { useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { arcHue, fonts, type Arc } from '@/lib/design-tokens'
import type { CheckInRecord } from '@/lib/check-in-signals'

export type Energy = 'low' | 'medium' | 'high'

export interface WeatherDay {
  /** ISO date or any label used as key + tooltip. */
  date: string
  energy: Energy | null
  arc: Arc | null
  weather?: string | null
  /** Optional first line of the entry, shown in the tooltip. */
  entry?: string | null
  /** Minutes active in the Write module this day, independent of check-in. */
  writingMinutes?: number
  /** All check-ins for this day, chronological, already capped. */
  checkIns?: CheckInRecord[]
}

/** Fallback energy ratios when durationProxy is absent (legacy data). */
const ENERGY_H: Record<Energy, number> = { low: 0.32, medium: 0.62, high: 0.92 }
const WRITING_MIN_H = 0.2
const WRITING_MAX_H = 0.58
const WRITING_CAP_MIN = 90
/** Max stacked slots — multi-check-in days divide available height by this. */
const MAX_SLOTS = 3
/** Gap in px between stacked blocks. */
const BLOCK_GAP = 2

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/**
 * Check-in signals over time.
 * Days with multiple check-ins render as stacked blocks that tower over
 * single-entry days. Height per block is driven by energy; colour by arc.
 * Hover reveals all entries for that day.
 */
export function WeatherStrip({ days, height = 56, onSelect }: { days: WeatherDay[]; height?: number; onSelect?: (d: WeatherDay) => void }) {
  const { t } = useTheme()
  const [hover, setHover] = useState<number | null>(null)
  const active = hover !== null ? days[hover] : null

  // A finger cannot rest on a bar the way a mouse does, and a bar is a few
  // pixels wide. So a touch anywhere on the strip shows the day under it and
  // follows the finger along; pressing a day that is already showing is what
  // goes on to it, as a click does for a mouse.
  const touched = useRef<{ i: number; was: number | null } | null>(null)
  const dayAt = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(days.length - 1, Math.floor(((e.clientX - box.left) / box.width) * days.length)))
  }
  const pick = (d: WeatherDay) => {
    const touch = touched.current
    touched.current = null
    if (!touch) { onSelect?.(d); return }
    if (touch.was === touch.i) onSelect?.(days[touch.i])
  }

  // Per-slot height for multi-check-in days (single-check-in days use full height)
  const multiSlotH = (height - BLOCK_GAP * (MAX_SLOTS - 1)) / MAX_SLOTS

  return (
    <div>
      <div
        style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height, width: '100%', touchAction: 'pan-y' }}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') { touched.current = null; return }
          const i = dayAt(e)
          touched.current = { i, was: hover }
          setHover(i)
        }}
        onPointerMove={(e) => { if (e.pointerType === 'touch' && touched.current) setHover(dayAt(e)) }}
        role="img"
        aria-label={`${days.length} days of check-in weather`}
      >
        {days.map((d, i) => {
          // Fall back: if checkIns not populated but energy/arc are set, synthesise a single record
          const cis: CheckInRecord[] | undefined =
            d.checkIns ??
            (d.energy && d.arc
              ? [{ energy: d.energy, arc: d.arc, weather: d.weather ?? null, entry: d.entry ?? null, time: '', durationProxy: ENERGY_H[d.energy] }]
              : undefined)
          const empty = !cis || cis.length === 0
          const minutes = d.writingMinutes ?? 0
          const wroteOnly = empty && minutes >= 1
          const dim = hover !== null && hover !== i

          // ── Writing-only or empty stub ──────────────────────────────────
          if (empty) {
            const stubH = wroteOnly
              ? WRITING_MIN_H + (Math.min(minutes, WRITING_CAP_MIN) / WRITING_CAP_MIN) * (WRITING_MAX_H - WRITING_MIN_H)
              : 0.14
            const label = wroteOnly
              ? `${d.date}: no check-in, ${formatMinutes(minutes)} writing`
              : `${d.date}: no check-in`
            return (
              <button
                key={d.date + i}
                type="button"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onClick={() => pick(d)}
                aria-label={label}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: `${stubH * 100}%`,
                  border: 'none',
                  padding: 0,
                  borderRadius: '3px 3px 0 0',
                  backgroundColor: wroteOnly ? t.textSecondary : t.divider,
                  opacity: dim ? 0.35 : wroteOnly ? 0.9 : 0.8,
                  cursor: 'default',
                  transition: 'opacity 0.15s ease',
                }}
              />
            )
          }

          // ── Stacked blocks for check-in days ───────────────────────────
          const label = `${d.date}: ${cis.length} check-in${cis.length > 1 ? 's' : ''}`
          return (
            <button
              key={d.date + i}
              type="button"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => pick(d)}
              aria-label={label}
              style={{
                flex: 1,
                minWidth: 0,
                border: 'none',
                padding: 0,
                background: 'none',
                display: 'flex',
                flexDirection: 'column-reverse',
                gap: BLOCK_GAP,
                alignItems: 'stretch',
                opacity: dim ? 0.35 : 1,
                cursor: onSelect ? 'pointer' : 'default',
                transition: 'opacity 0.15s ease',
              }}
            >
              {cis.map((ci, j) => {
                // Single check-in: full strip height available; multi: divided into slots
                const availH = cis.length === 1 ? height : multiSlotH
                const proxy = ci.durationProxy ?? ENERGY_H[ci.energy]
                const blockH = Math.round(proxy * availH)
                const isTop = j === cis.length - 1
                return (
                  <div
                    key={j}
                    style={{
                      height: blockH,
                      flexShrink: 0,
                      borderRadius: isTop ? '3px 3px 0 0' : '1px',
                      backgroundColor: t[arcHue[ci.arc]],
                      opacity: 0.9 + j * 0.03, // topmost blocks slightly more vivid
                      transition: 'height 0.3s ease',
                    }}
                  />
                )
              })}
            </button>
          )
        })}
      </div>

      {/* Inline caption area */}
      <div style={{ minHeight: 18, marginTop: 8, fontFamily: fonts.ui, fontSize: 12, color: t.textSecondary, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        {active && active.checkIns && active.checkIns.length > 0 ? (
          active.checkIns.length === 1 ? (
            <>
              <span style={{ color: t.textMuted }}>{active.date}</span>
              <span style={{ fontFamily: fonts.display, fontStyle: 'italic', fontSize: 14, color: t.textPrimary }}>{active.checkIns[0].weather || active.checkIns[0].arc}</span>
              <span style={{ color: t[arcHue[active.checkIns[0].arc]] }}>{active.checkIns[0].arc}</span>
              <span style={{ color: t.textMuted }}>· {active.checkIns[0].energy} energy</span>
            </>
          ) : (
            <>
              <span style={{ color: t.textMuted }}>{active.date}</span>
              <span style={{ fontFamily: fonts.display, fontStyle: 'italic', fontSize: 14, color: t.textPrimary }}>{active.checkIns.length} check-ins</span>
              {active.checkIns.map((ci, j) => (
                <span key={j} style={{ color: t[arcHue[ci.arc]] }}>{ci.time} · {ci.energy}</span>
              ))}
            </>
          )
        ) : active && (active.writingMinutes ?? 0) >= 1 ? (
          <>
            <span style={{ color: t.textMuted }}>{active.date}</span>
            <span style={{ fontFamily: fonts.display, fontStyle: 'italic', fontSize: 14, color: t.textPrimary }}>Wrote, no check-in</span>
            <span style={{ color: t.textMuted }}>· {formatMinutes(active.writingMinutes!)}</span>
          </>
        ) : active ? (
          <span style={{ color: t.textMuted }}>{active.date} · no check-in</span>
        ) : (
          <span style={{ color: t.textMuted }}>Height is energy, colour is movement. Stacked blocks mean multiple check-ins that day.</span>
        )}
      </div>
    </div>
  )
}
