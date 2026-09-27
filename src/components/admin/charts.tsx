'use client'

// Small hand-rolled SVG charts for /admin. No chart library: the page is
// owner-only and these five shapes cover it. Colours are the validated
// dataviz reference palette's dark steps (categorical order fixed, never
// cycled), exposed as CSS variables by <OpsRoot>.
import { createContext, useCallback, useContext, useState } from 'react'

export const OPS_VARS = {
  '--ops-bg': '#0d0c0b',
  '--ops-surface': '#1a1a19',
  '--ops-line': 'rgba(236,233,226,0.12)',
  '--ops-text': '#ece9e2',
  '--ops-text-2': '#c3c2b7',
  '--ops-muted': '#8a857c',
  '--s1': '#3987e5', // blue
  '--s2': '#d95926', // orange
  '--s3': '#199e70', // aqua
  '--s4': '#c98500', // yellow
  '--s5': '#d55181', // magenta
  '--good': '#0ca30c',
  '--warning': '#fab219',
  '--serious': '#ec835a',
  '--critical': '#d03b3b',
} as React.CSSProperties

export const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)']

// Sequential blue ramp (100 → 700), for magnitude cells.
const RAMP = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b']
export function rampColor(t: number): string {
  if (!Number.isFinite(t) || t <= 0) return 'transparent'
  return RAMP[Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))]
}

// ── Tooltip ──────────────────────────────────────────────────────────────────
type Tip = { x: number; y: number; content: React.ReactNode } | null
const TipCtx = createContext<(t: Tip) => void>(() => {})

export function OpsRoot({ children }: { children: React.ReactNode }) {
  const [tip, setTip] = useState<Tip>(null)
  return (
    <TipCtx.Provider value={setTip}>
      <div style={{ ...OPS_VARS, background: 'var(--ops-bg)', color: 'var(--ops-text)', minHeight: '100dvh' }}>
        {children}
        {tip && (
          <div
            role="tooltip"
            className="pointer-events-none fixed z-50 max-w-[320px] rounded-lg px-3 py-2 text-xs shadow-lg"
            style={{
              left: Math.min(tip.x + 14, typeof window !== 'undefined' ? window.innerWidth - 330 : tip.x),
              top: tip.y + 14,
              background: '#262523',
              border: '1px solid var(--ops-line)',
              color: 'var(--ops-text)',
            }}
          >
            {tip.content}
          </div>
        )}
      </div>
    </TipCtx.Provider>
  )
}

export function useTip() {
  const set = useContext(TipCtx)
  const show = useCallback((e: React.MouseEvent, content: React.ReactNode) => set({ x: e.clientX, y: e.clientY, content }), [set])
  const hide = useCallback(() => set(null), [set])
  return { show, hide }
}

// Rect with its data end rounded (4px) and its baseline end square.
function topRounded(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0 || w <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return `M${x},${y + h} V${y + rr} Q${x},${y} ${x + rr},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h} Z`
}
function rightRounded(x: number, y: number, w: number, h: number, r = 4) {
  if (h <= 0 || w <= 0) return ''
  const rr = Math.min(r, h / 2, w)
  return `M${x},${y} H${x + w - rr} Q${x + w},${y} ${x + w},${y + rr} V${y + h - rr} Q${x + w},${y + h} ${x + w - rr},${y + h} H${x} Z`
}

// ── Column chart over days ───────────────────────────────────────────────────
export function Columns({
  values,
  labels,
  format,
  color = 'var(--s1)',
  height = 120,
  highlight,
}: {
  values: number[]
  labels: string[]
  format: (v: number) => string
  color?: string
  height?: number
  highlight?: (i: number) => boolean
}) {
  const { show, hide } = useTip()
  const W = 600
  const H = height
  const max = Math.max(...values, 0) || 1
  const n = Math.max(values.length, 1)
  const slot = W / n
  const gap = Math.min(2, slot * 0.2)
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px]" style={{ color: 'var(--ops-muted)' }}>
        <span>max {format(max)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full" style={{ height: H }} onMouseLeave={hide}>
        <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--ops-line)" />
        {values.map((v, i) => {
          const h = (v / max) * (H - 4)
          return (
            <g key={i}>
              <path
                d={topRounded(i * slot + gap / 2, H - h, slot - gap, h, Math.min(4, (slot - gap) / 2))}
                fill={highlight?.(i) ? 'var(--s2)' : color}
              />
              <rect
                x={i * slot}
                y={0}
                width={slot}
                height={H}
                fill="transparent"
                onMouseMove={(e) => show(e, <><b>{labels[i]}</b><br />{format(v)}</>)}
              />
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[11px]" style={{ color: 'var(--ops-muted)' }}>
        <span>{labels[0]}</span>
        <span>{labels.at(-1)}</span>
      </div>
    </div>
  )
}

// ── Sparkline (inside tables; the row already carries the numbers) ──────────
export function Spark({ values, width = 90, height = 22, color = 'var(--s1)' }: { values: number[]; width?: number; height?: number; color?: string }) {
  const max = Math.max(...values, 0) || 1
  const step = values.length > 1 ? width / (values.length - 1) : width
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  )
}

// ── Horizontal bar, for one value against a max (funnels, sources) ──────────
export function HBar({
  value,
  max,
  color = 'var(--s1)',
  height = 10,
  marker,
  tip,
}: {
  value: number
  max: number
  color?: string
  height?: number
  marker?: number
  tip?: React.ReactNode
}) {
  const { show, hide } = useTip()
  const W = 200
  const w = max > 0 ? Math.max(0, Math.min(1, value / max)) * W : 0
  const m = marker !== undefined && max > 0 ? Math.min(1, marker / max) * W : null
  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height }}
      onMouseMove={tip ? (e) => show(e, tip) : undefined}
      onMouseLeave={tip ? hide : undefined}
    >
      <rect x={0} y={0} width={W} height={height} rx={2} fill="rgba(236,233,226,0.05)" />
      <path d={rightRounded(0, 0, w, height, 4)} fill={color} />
      {m !== null && <line x1={m} x2={m} y1={-2} y2={height + 2} stroke="var(--ops-text)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />}
    </svg>
  )
}

// ── Stacked horizontal bar with a legend (token and context anatomy) ────────
export function StackBar({
  segments,
  format,
  height = 12,
}: {
  segments: { label: string; value: number; color: string }[]
  format: (v: number) => string
  height?: number
}) {
  const { show, hide } = useTip()
  const total = segments.reduce((a, s) => a + Math.max(0, s.value), 0)
  const W = 400
  let x = 0
  const visible = segments.filter((s) => s.value > 0)
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} onMouseLeave={hide}>
        {total > 0 &&
          visible.map((s, i) => {
            const w = (s.value / total) * W
            const gap = i < visible.length - 1 ? 2 : 0
            const el = (
              <rect
                key={s.label}
                x={x}
                y={0}
                width={Math.max(0, w - gap)}
                height={height}
                rx={i === visible.length - 1 || i === 0 ? 3 : 0}
                fill={s.color}
                onMouseMove={(e) => show(e, <><b>{s.label}</b><br />{format(s.value)} · {Math.round((s.value / total) * 100)}%</>)}
              />
            )
            x += w
            return el
          })}
      </svg>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: 'var(--ops-text-2)' }}>
        {visible.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
            {s.label} {format(s.value)}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Scatter: one task's calls over time, cost on a log scale ────────────────
export function CostScatter({
  points,
  median,
  format,
  selected,
  onSelect,
}: {
  points: { t: number; v: number; flagged: boolean; id: number; label: React.ReactNode }[]
  median: number
  format: (v: number) => string
  selected?: number | null
  onSelect?: (id: number) => void
}) {
  const { show, hide } = useTip()
  const W = 640
  const H = 220
  const P = { l: 44, r: 8, t: 8, b: 18 }
  if (points.length === 0) return <p className="text-sm" style={{ color: 'var(--ops-muted)' }}>No calls in this window.</p>
  const ts = points.map((p) => p.t)
  const t0 = Math.min(...ts)
  const t1 = Math.max(...ts, t0 + 1)
  const vs = points.map((p) => Math.max(p.v, 1))
  const lo = Math.log10(Math.min(...vs, median || 1) / 1.5)
  const hi = Math.log10(Math.max(...vs, (median || 1) * 3) * 1.5)
  const X = (t: number) => P.l + ((t - t0) / (t1 - t0)) * (W - P.l - P.r)
  const Y = (v: number) => P.t + (1 - (Math.log10(Math.max(v, 1)) - lo) / (hi - lo || 1)) * (H - P.t - P.b)
  const ticks: number[] = []
  for (let e = Math.floor(lo); e <= Math.ceil(hi); e++) if (e >= lo && e <= hi) ticks.push(10 ** e)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" onMouseLeave={hide}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={P.l} x2={W - P.r} y1={Y(v)} y2={Y(v)} stroke="var(--ops-line)" />
          <text x={P.l - 6} y={Y(v) + 3} textAnchor="end" fontSize={10} fill="var(--ops-muted)">{format(v)}</text>
        </g>
      ))}
      {median > 0 && (
        <>
          <line x1={P.l} x2={W - P.r} y1={Y(median)} y2={Y(median)} stroke="var(--ops-text-2)" strokeDasharray="4 3" />
          <text x={W - P.r} y={Y(median) - 4} textAnchor="end" fontSize={10} fill="var(--ops-text-2)">median</text>
          <line x1={P.l} x2={W - P.r} y1={Y(median * 3)} y2={Y(median * 3)} stroke="var(--s2)" strokeDasharray="2 3" strokeOpacity={0.7} />
          <text x={W - P.r} y={Y(median * 3) - 4} textAnchor="end" fontSize={10} fill="var(--s2)">3× median</text>
        </>
      )}
      {points.map((p) => (
        <circle
          key={p.id}
          cx={X(p.t)}
          cy={Y(p.v)}
          r={p.id === selected ? 6 : 4}
          fill={p.flagged ? 'var(--s2)' : 'var(--s1)'}
          stroke="var(--ops-surface)"
          strokeWidth={2}
          style={{ cursor: onSelect ? 'pointer' : undefined }}
          onMouseMove={(e) => show(e, p.label)}
          onClick={() => onSelect?.(p.id)}
        />
      ))}
      <text x={P.l} y={H - 4} fontSize={10} fill="var(--ops-muted)">{new Date(t0).toLocaleDateString()}</text>
      <text x={W - P.r} y={H - 4} textAnchor="end" fontSize={10} fill="var(--ops-muted)">{new Date(t1).toLocaleDateString()}</text>
    </svg>
  )
}

// ── Status chip: colour never alone, always icon + label ────────────────────
export function Status({ level, children }: { level: 'good' | 'warning' | 'serious' | 'critical'; children: React.ReactNode }) {
  const icon = { good: '✓', warning: '!', serious: '!', critical: '✕' }[level]
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
      style={{ border: `1px solid var(--${level})`, color: 'var(--ops-text)' }}
    >
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold" style={{ background: `var(--${level})`, color: '#0d0c0b' }}>
        {icon}
      </span>
      {children}
    </span>
  )
}
