'use client'

import { useMemo, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { fonts, radius, type MeaningKey } from '@/lib/design-tokens'

const CYCLE: MeaningKey[] = ['ochre', 'verdant', 'violet', 'ember', 'tide']
const FILLERS = new Set(['the', 'a', 'an', 'in', 'at', 'on', 'with', 'from', 'of', 'and', 'but', 'they', 'we', 'it', 'this', 'there', 'then', 'as', 'by', 'to'])

/** Split a journey (newline beats or prose sentences) into labelled stages. */
export function journeyStages(text: string): { label: string; full: string }[] {
  const byLine = text.split('\n').map((s) => s.trim()).filter((s) => s.length > 3)
  const parts = byLine.length > 1 ? byLine : text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 8)
  return parts.slice(0, 6).map((s) => {
    const words = s.split(/\s+/).filter((w) => !FILLERS.has(w.toLowerCase().replace(/[^a-z]/g, '')))
    const label = words.slice(0, 2).join(' ') || s.split(/\s+/).slice(0, 2).join(' ')
    return { label: label.charAt(0).toUpperCase() + label.slice(1), full: s }
  })
}

/**
 * The emotional journey as a curve: a smooth line through one dot per beat,
 * hover reveals the beat's full text. Ported from Core Concept into the kit
 * so Piece Modal, Write's core panel and the Reading room share it.
 */
export function JourneyCurve({ text, height = 64 }: { text: string; height?: number }) {
  const { t } = useTheme()
  const [hovered, setHovered] = useState<number | null>(null)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const stages = useMemo(() => journeyStages(text), [text])
  const n = stages.length
  const W = 500
  const H = height
  const PAD = 40

  const pts = useMemo(() => {
    return stages.map((s, i) => {
      const tt = i / (n - 1 || 1)
      const base = Math.sin(tt * Math.PI) * 0.8
      const hash = s.label.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0)
      const h = Math.max(0.08, Math.min(0.92, base + ((hash % 15) - 7) / 100))
      return { x: n <= 1 ? W / 2 : PAD + (i / (n - 1)) * (W - PAD * 2), y: H - h * (H - 8), hue: CYCLE[i % CYCLE.length] }
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
    setPos({ x: r.left + pts[i].x * (r.width / W), y: r.top + pts[i].y * (r.height / (H + 30)) })
  }
  const TW = 220
  const left = pos ? Math.min(Math.max(pos.x - TW / 2, 8), (typeof window !== 'undefined' ? window.innerWidth : 1200) - TW - 8) : 0

  return (
    <div style={{ position: 'relative' }}>
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H + 30}`} style={{ overflow: 'visible', display: 'block' }} role="img" aria-label={stages.map((s) => s.label).join(' → ')}>
        <defs>
          <linearGradient id="journeyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={t.textMuted} stopOpacity="0.08" />
            <stop offset="100%" stopColor={t.textMuted} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${d} L ${pts[pts.length - 1].x} ${H + 2} L ${pts[0].x} ${H + 2} Z`} fill="url(#journeyFill)" />
        <path d={d} fill="none" stroke={t.divider} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i} onMouseEnter={() => enter(i)} onMouseLeave={() => { setHovered(null); setPos(null) }} style={{ cursor: 'default' }}>
            <circle cx={p.x} cy={p.y} r={18} fill="transparent" />
            <circle cx={p.x} cy={p.y} r={hovered === i ? 6 : 4} fill={t[p.hue]} stroke={t.cardBg} strokeWidth={2} style={{ transition: 'r 0.15s' }} />
            <text x={p.x} y={H + 22} textAnchor="middle" fontSize={9} fontFamily="var(--font-geist-sans), sans-serif" fill={t[p.hue]} fontWeight={hovered === i ? 700 : 500}>
              {stages[i].label.length > 14 ? stages[i].label.slice(0, 13) + '…' : stages[i].label}
            </text>
          </g>
        ))}
      </svg>
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
