// src/components/studio/shelf/folder-icon.tsx — one folder, four states.
//
//   undeclared  empty folder with a spark     an idea still being explored
//   queued      one page tucked in            declared, waiting its turn
//   active      pages and a photo tucked in   underway
//   completed   the active folder, greyed, with a check across the front
//
// Built from the app's own vocabulary: the meaning palette (ochre = waiting,
// verdant = underway), hairline edges rather than heavy outlines, the same
// round-capped stroke the Dock's icons use, and soft paper in place of ink.
// Casual comes from the tucked-in paper at gentle angles and generous radii,
// not from wobble. Colours follow the light/dark switch.

import { useId } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import type { FolderState } from '@/lib/studio/shelf-view'

/** Linear blend of two #rrggbb colours: t=0 is `a`, t=1 is `b`. */
function mix(a: string, b: string, t: number): string {
  const p = (hex: string) => {
    const n = parseInt(hex.replace('#', ''), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  }
  const [ar, ag, ab] = p(a)
  const [br, bg, bb] = p(b)
  const c = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  return `#${c(ar, br)}${c(ag, bg)}${c(ab, bb)}`
}

function Page({ x, y, w, h, turn, paper, rule }: { x: number; y: number; w: number; h: number; turn: number; paper: string; rule: string }) {
  return (
    <g transform={`rotate(${turn} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={paper} />
      {[0.26, 0.44, 0.62].map((f, i) => (
        <line key={f} x1={x + 11} y1={y + h * f} x2={x + w - 11 - i * 12} y2={y + h * f} stroke={rule} strokeWidth={2.2} strokeLinecap="round" />
      ))}
    </g>
  )
}

function Photo({ x, y, w, h, turn, paper, sky, sun, hillA, hillB, uid }: {
  x: number; y: number; w: number; h: number; turn: number
  paper: string; sky: string; sun: string; hillA: string; hillB: string; uid: string
}) {
  const clip = `photo-${uid}`
  const ix = x + 5, iy = y + 5, iw = w - 10, ih = h - 10
  return (
    <g transform={`rotate(${turn} ${x + w / 2} ${y + h / 2})`}>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={paper} />
      <clipPath id={clip}><rect x={ix} y={iy} width={iw} height={ih} rx={2.5} /></clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect x={ix} y={iy} width={iw} height={ih} fill={sky} />
        <circle cx={ix + iw * 0.72} cy={iy + ih * 0.3} r={ih * 0.12} fill={sun} />
        <path d={`M${ix} ${iy + ih} L${ix} ${iy + ih * 0.72} Q${ix + iw * 0.28} ${iy + ih * 0.4} ${ix + iw * 0.55} ${iy + ih * 0.74} T${ix + iw} ${iy + ih * 0.66} V${iy + ih} Z`} fill={hillA} />
        <path d={`M${ix} ${iy + ih} L${ix} ${iy + ih * 0.88} Q${ix + iw * 0.3} ${iy + ih * 0.7} ${ix + iw * 0.62} ${iy + ih * 0.88} T${ix + iw} ${iy + ih * 0.84} V${iy + ih} Z`} fill={hillB} />
      </g>
    </g>
  )
}

export function FolderIcon({ state, width = 150 }: { state: FolderState; width?: number }) {
  const { t, theme } = useTheme()
  const uid = useId().replace(/:/g, '')
  const dark = theme === 'dark'

  // One base colour per state, then the two panels are the same colour lifted
  // toward white (light) or sunk toward black (dark), so every state reads as
  // the same object in a different mood.
  const base =
    state === 'queued' ? t.ochre
    : state === 'active' ? t.verdant
    : dark ? '#6f6b63' : '#8f8a80' // undeclared + completed: quiet greys
  const back = dark ? mix(base, '#000000', 0.5) : mix(base, '#ffffff', 0.32)
  const front = dark ? mix(base, '#000000', 0.2) : mix(base, '#ffffff', 0.66)
  const hairline = dark ? 'rgba(236,233,226,0.14)' : 'rgba(26,24,21,0.12)'
  const sheen = dark ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.7)'

  const paper = dark ? '#e6e2d8' : '#fbfaf7'
  const rule = dark ? '#c9c3b4' : '#dcd7cb'

  const done = state === 'completed'
  const full = state === 'active' || done
  const inkOnPaper = '#3b3833'

  return (
    <svg
      aria-hidden
      viewBox="0 0 160 132"
      width={width}
      height={(width * 132) / 160}
      style={{
        display: 'block', overflow: 'visible',
        filter: dark ? 'drop-shadow(0 6px 8px rgba(0,0,0,0.4))' : 'drop-shadow(0 6px 8px rgba(26,24,21,0.14))',
      }}
    >
      {/* back panel, with its tab */}
      <path
        d="M16 12 H50 C53.5 12 56 13.5 58 16 L62 21.5 C63.5 23.5 65.5 24.5 68 24.5 H144 A8 8 0 0 1 152 32.5 V112 A8 8 0 0 1 144 120 H16 A8 8 0 0 1 8 112 V20 A8 8 0 0 1 16 12 Z"
        fill={back}
        stroke={hairline}
        strokeWidth={1}
      />

      {/* what is inside, tucked between the two panels */}
      <g opacity={done ? 0.85 : 1}>
        {state === 'queued' && <Page x={34} y={26} w={90} h={72} turn={-3} paper={paper} rule={rule} />}
        {full && (
          <>
            <Page x={20} y={30} w={80} h={72} turn={-7} paper={paper} rule={rule} />
            <Photo
              x={58} y={22} w={82} h={70} turn={6} paper={paper} uid={uid}
              sky={mix(t.tide, '#ffffff', done ? 0.75 : 0.55)}
              sun={mix(t.ochre, '#ffffff', 0.35)}
              hillA={mix(t.verdant, '#ffffff', 0.35)}
              hillB={mix(t.verdant, '#000000', 0.05)}
            />
            <Page x={36} y={32} w={88} h={72} turn={-1.5} paper={paper} rule={rule} />
          </>
        )}
      </g>

      {/* front panel */}
      <rect x={8} y={50} width={144} height={70} rx={8} fill={front} stroke={hairline} strokeWidth={1} />
      <path d="M14 51.5 H146" stroke={sheen} strokeWidth={1.5} strokeLinecap="round" fill="none" />

      {state === 'undeclared' && (
        <g
          transform="translate(65 68) scale(1.25)"
          fill="none" stroke={dark ? 'rgba(236,233,226,0.6)' : 'rgba(26,24,21,0.5)'}
          strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
        >
          {/* the same spark the Dock uses for Ideas */}
          <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4z" />
        </g>
      )}

      {done && (
        <g>
          <circle cx={80} cy={87} r={19} fill={paper} stroke={hairline} strokeWidth={1} />
          <path d="M70 87.5 L77 94.5 L91 80" fill="none" stroke={inkOnPaper} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  )
}
