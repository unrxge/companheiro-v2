'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { fonts, radius, type MeaningKey } from '@/lib/design-tokens'

const CYCLE: MeaningKey[] = ['ochre', 'verdant', 'violet', 'ember', 'tide']
const MAX_STAGES = 9
const MAX_LABEL_WORDS = 6
/** Below this much width per stage, labels drop out from under the curve into a wrapping legend. */
const MIN_COLUMN = 76

function tidyLabel(raw: string): string {
  const words = raw.replace(/^[\s"'“‘(]+|[\s"'”’)]+$/g, '').split(/\s+/).filter(Boolean).slice(0, MAX_LABEL_WORDS)
  const label = words.join(' ').replace(/[\s.,;:—–-]+$/, '')
  return label.charAt(0).toUpperCase() + label.slice(1)
}

/** One beat: "Short label — what it holds", "Short label: what it holds", a bare short label, or a loose sentence. */
function parseBeat(line: string): { label: string; full: string } {
  for (const sep of [/^(.{1,80}?)\s+[—–]\s+(.+)$/, /^([^:]{1,80}?):\s+(.+)$/]) {
    const m = line.match(sep)
    if (m && m[1].trim().split(/\s+/).length <= MAX_LABEL_WORDS) return { label: tidyLabel(m[1]), full: m[2].trim() }
  }
  const words = line.split(/\s+/)
  if (words.length <= MAX_LABEL_WORDS) return { label: tidyLabel(line), full: '' }
  // Loose prose: the first clause, kept to a handful of words.
  const clause = line.split(/[,;—–:]|\s-\s/)[0]
  return { label: tidyLabel(clause), full: line }
}

/**
 * Split a journey into labelled stages. The count follows the text: one stage
 * per line (the format Core Concept writes), or per sentence for older prose.
 * Every label is a one-to-six-word summary; the rest becomes the hover text.
 */
export function journeyStages(text: string): { label: string; full: string }[] {
  const lines = text.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter((l) => l.length > 1)
  let parts = lines
  if (lines.length <= 1) {
    const sentences = (text.match(/[^.!?]+[.!?]*/g) ?? []).map((x) => x.trim()).filter((x) => x.length > 8)
    parts = sentences.length > 1 ? sentences : lines
  }
  return parts.slice(0, MAX_STAGES).map(parseBeat)
}

/**
 * The emotional journey as a curve: a smooth line through one dot per beat,
 * a short summary under each, hover reveals the beat's fuller text. Ported from
 * Core Concept into the kit so Piece Modal, Write's core panel and the Reading
 * room share it.
 */
export function JourneyCurve({ text, height = 64 }: { text: string; height?: number }) {
  const { t } = useTheme()
  const [hovered, setHovered] = useState<number | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const [width, setWidth] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const stages = useMemo(() => journeyStages(text), [text])
  const n = stages.length
  const hasStages = n > 0
  const W = 500
  const H = height

  useEffect(() => {
    const el = wrapRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [hasStages])

  // Dots sit at the centre of equal columns, so each label can be a grid cell
  // straight underneath and wrap freely.
  const pts = useMemo(() => {
    return stages.map((s, i) => {
      const tt = i / (n - 1 || 1)
      const base = n === 1 ? 0.5 : Math.sin(tt * Math.PI) * 0.8
      const hash = s.label.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
      const h = Math.max(0.08, Math.min(0.92, base + ((hash % 15) - 7) / 100))
      return { x: ((i + 0.5) / n) * W, y: H - h * (H - 8), hue: CYCLE[i % CYCLE.length] }
    })
  }, [stages, n, H])

  if (n === 0) return null

  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const cpx = ((pts[i - 1].x + pts[i].x) / 2).toFixed(1)
    d += ` C ${cpx} ${pts[i - 1].y.toFixed(1)} ${cpx} ${pts[i].y.toFixed(1)} ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`
  }

  const enter = (i: number) => {
    setHovered(i)
    const el = svgRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ x: r.left + pts[i].x * (r.width / W), y: r.top + pts[i].y * (r.height / H) })
  }
  const leave = () => { setHovered(null); setPos(null) }
  const TW = 220
  const left = pos ? Math.min(Math.max(pos.x - TW / 2, 8), (typeof window !== 'undefined' ? window.innerWidth : 1200) - TW - 8) : 0
  const compact = width > 0 && width / n < MIN_COLUMN

  const labelStyle = (i: number): React.CSSProperties => ({
    fontFamily: fonts.ui,
    fontSize: 11,
    lineHeight: 1.3,
    color: t[pts[i].hue],
    fontWeight: hovered === i ? 700 : 500,
    overflowWrap: 'break-word',
    cursor: 'default',
  })

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }} role="img" aria-label={stages.map((s) => s.label).join(' → ')}>
        <defs>
          <linearGradient id="journeyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.textMuted} stopOpacity="0.08" />
            <stop offset="100%" stopColor={t.textMuted} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L ${pts[pts.length - 1].x} ${H + 2} L ${pts[0].x} ${H + 2} Z`} fill="url(#journeyFill)" />
        <path d={d} fill="none" stroke={t.divider} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => enter(i)} onMouseLeave={leave} style={{ cursor: 'default' }}>
            <circle cx={p.x} cy={p.y} r={18} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={hovered === i ? 6 : 4} fill={t[p.hue]} stroke={t.cardBg} strokeWidth={2} style={{ transition: 'r 0.15s' }} />
          </g>
        ))}
      </svg>

      {compact ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '6px 16px', marginTop: 10 }}>
          {stages.map((s, i) => (
            <span key={i} onMouseEnter={() => enter(i)} onMouseLeave={leave} style={{ ...labelStyle(i), display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: t[pts[i].hue], flexShrink: 0 }} />
              {s.label}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, marginTop: 8 }}>
          {stages.map((s, i) => (
            <span key={i} onMouseEnter={() => enter(i)} onMouseLeave={leave} style={{ ...labelStyle(i), textAlign: 'center', padding: '0 4px' }}>
              {s.label}
            </span>
          ))}
        </div>
      )}

      {hovered !== null && pos && stages[hovered].full && (
        <div
          style={{
            position: 'fixed',
            left,
            top: pos.y - 8,
            transform: 'translateY(-100%)',
            width: TW,
            backgroundColor: t.cardBg,
            border: `1px solid ${t[pts[hovered].hue]}55`,
            borderRadius: radius.field,
            padding: '10px 14px',
            boxShadow: t.shadow,
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          <p style={{ fontFamily: fonts.ui, fontSize: 9, fontWeight: 700, color: t[pts[hovered].hue], textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 5px' }}>{stages[hovered].label}</p>
          <p style={{ fontFamily: fonts.display, fontStyle: 'italic', fontSize: 13, color: t.textPrimary, lineHeight: 1.5, margin: 0 }}>{stages[hovered].full}</p>
        </div>
      )}
    </div>
  )
}
