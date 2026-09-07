'use client'

import { useMemo, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { fonts } from '@/lib/design-tokens'

export interface ThreadNode {
  id: string
  label: string
  /** An unresolved thread: drawn as an open ember ring instead of a filled node. */
  open?: boolean
  /** Relative importance 0–1 (e.g. how many threads touch it). */
  weight?: number
  onClick?: () => void
}

export interface ThreadEdge {
  from: string
  to: string
  /** Dashed edge: a continuation that was suggested but not yet made. */
  tentative?: boolean
}

/**
 * Published pieces as nodes, post-publication threads as edges, unresolved
 * threads as open ember rings. Deterministic layout (nodes on a gentle arc,
 * alternating rows) so it never jitters between renders.
 */
export function ThreadMap({ nodes, edges, height = 160 }: { nodes: ThreadNode[]; edges: ThreadEdge[]; height?: number }) {
  const { t } = useTheme()
  const [hover, setHover] = useState<string | null>(null)
  const W = 600
  const H = height
  const positions = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>()
    const n = nodes.length
    nodes.forEach((node, i) => {
      const x = n <= 1 ? W / 2 : 50 + (i / (n - 1)) * (W - 100)
      const wave = Math.sin((i / Math.max(n - 1, 1)) * Math.PI * 1.6)
      const y = H / 2 + wave * (H / 2 - 34) * (i % 2 === 0 ? 1 : -0.7)
      m.set(node.id, { x, y })
    })
    return m
  }, [nodes, H])

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }} role="img" aria-label={`${nodes.length} pieces, ${edges.length} threads`}>
      {edges.map((e, i) => {
        const a = positions.get(e.from)
        const b = positions.get(e.to)
        if (!a || !b) return null
        const lit = hover === e.from || hover === e.to
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={lit ? t.violet : e.tentative ? t.ember : t.divider}
            strokeWidth={lit ? 2.5 : e.tentative ? 2 : 1.5}
            strokeDasharray={e.tentative ? '4 4' : undefined}
            style={{ transition: 'stroke 0.2s ease' }}
          />
        )
      })}
      {nodes.map((node) => {
        const p = positions.get(node.id)!
        const r = 5 + (node.weight ?? 0.3) * 6
        const lit = hover === node.id
        return (
          <g
            key={node.id}
            onMouseEnter={() => setHover(node.id)}
            onMouseLeave={() => setHover(null)}
            onClick={node.onClick}
            style={{ cursor: node.onClick ? 'pointer' : 'default' }}
          >
            <circle cx={p.x} cy={p.y} r={r + 10} fill="transparent" />
            {node.open ? (
              <circle cx={p.x} cy={p.y} r={lit ? r + 1.5 : r} fill={t.cardBg} stroke={t.ember} strokeWidth={2.5} style={{ transition: 'r 0.15s' }} />
            ) : (
              <circle cx={p.x} cy={p.y} r={lit ? r + 1.5 : r} fill={t.violet} stroke={t.cardBg} strokeWidth={2} style={{ transition: 'r 0.15s' }} />
            )}
            <text
              x={p.x}
              y={p.y + r + 14}
              textAnchor="middle"
              fontSize={10}
              fontFamily="var(--font-geist-sans), sans-serif"
              fontWeight={lit ? 700 : 500}
              fill={node.open ? t.ember : lit ? t.textPrimary : t.textSecondary}
            >
              {node.label.length > 22 ? node.label.slice(0, 21) + '…' : node.label}
            </text>
          </g>
        )
      })}
      <text x={W - 4} y={12} textAnchor="end" fontSize={9} fontFamily={fonts.ui} fill={t.textMuted} letterSpacing="0.1em">
        OPEN THREADS IN EMBER
      </text>
    </svg>
  )
}
