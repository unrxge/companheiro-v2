// src/components/studio/shelf/folder-icon.tsx — one folder, four states.
//
//   undeclared  empty folder            an idea still being explored in Idea Lab
//   queued      one sheet inside        declared, waiting its turn
//   active      sheets + a photo inside underway
//   completed   the active folder, greyed, with a check across the front
//
// Flat shapes only, so it stays crisp from a 120px phone cell to the 40%
// zoom-out. The paper is drawn between the back and front panels, which is
// what makes "how full" readable at a glance.

import type { FolderState } from '@/lib/studio/shelf-view'

const TONES: Record<FolderState, { back: string; front: string; edge: string }> = {
  undeclared: { back: '#6c6b67', front: '#8a8882', edge: 'rgba(255,255,255,0.20)' },
  queued: { back: '#b3822f', front: '#dfa94a', edge: 'rgba(255,255,255,0.30)' },
  active: { back: '#2c8a61', front: '#46b384', edge: 'rgba(255,255,255,0.30)' },
  completed: { back: '#5d5c58', front: '#7b7974', edge: 'rgba(255,255,255,0.18)' },
}

const PAPER = '#f3efe6'
const RULE = '#cfc8b8'

/** A sheet of writing: a page with a few ruled lines. */
function Sheet({ x, y, w, h, turn }: { x: number; y: number; w: number; h: number; turn: number }) {
  const cx = x + w / 2
  const cy = y + h / 2
  return (
    <g transform={`rotate(${turn} ${cx} ${cy})`}>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={PAPER} />
      {[0.22, 0.4, 0.58].map((f) => (
        <line key={f} x1={x + 10} y1={y + h * f} x2={x + w - 10 - (f > 0.5 ? 18 : 0)} y2={y + h * f} stroke={RULE} strokeWidth={2.4} strokeLinecap="round" />
      ))}
    </g>
  )
}

/** A photo: a frame with a sun and two hills. */
function Photo({ x, y, w, h, turn }: { x: number; y: number; w: number; h: number; turn: number }) {
  const cx = x + w / 2
  const cy = y + h / 2
  const id = `hills-${Math.round(x)}-${Math.round(y)}`
  return (
    <g transform={`rotate(${turn} ${cx} ${cy})`}>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={PAPER} />
      <clipPath id={id}><rect x={x + 6} y={y + 6} width={w - 12} height={h - 12} rx={2} /></clipPath>
      <g clipPath={`url(#${id})`}>
        <rect x={x + 6} y={y + 6} width={w - 12} height={h - 12} fill="#a9bfcf" />
        <circle cx={x + w * 0.72} cy={y + h * 0.3} r={h * 0.1} fill="#f3d48a" />
        <path d={`M${x + 6} ${y + h - 6} L${x + w * 0.38} ${y + h * 0.42} L${x + w * 0.62} ${y + h - 6} Z`} fill="#6f8ea8" />
        <path d={`M${x + w * 0.42} ${y + h - 6} L${x + w * 0.72} ${y + h * 0.55} L${x + w - 6} ${y + h - 6} Z`} fill="#5a7891" />
      </g>
    </g>
  )
}

export function FolderIcon({ state, width = 150 }: { state: FolderState; width?: number }) {
  const tone = TONES[state]
  const done = state === 'completed'
  const full = state === 'active' || done

  return (
    <svg
      aria-hidden
      viewBox="0 0 160 132"
      width={width}
      height={(width * 132) / 160}
      style={{ display: 'block', overflow: 'visible', filter: 'drop-shadow(0 7px 9px rgba(0,0,0,0.34))' }}
    >
      {/* back panel, with its tab */}
      <path
        d="M8 20 a8 8 0 0 1 8-8 h44 l10 10 h74 a8 8 0 0 1 8 8 v82 a8 8 0 0 1-8 8 H16 a8 8 0 0 1-8-8 z"
        fill={tone.back}
      />

      {/* what is inside, drawn between the two panels */}
      <g opacity={done ? 0.78 : 1}>
        {state === 'queued' && <Sheet x={32} y={28} w={94} h={74} turn={-3} />}
        {full && (
          <>
            <Sheet x={20} y={30} w={82} h={74} turn={-8} />
            <Photo x={56} y={22} w={84} h={72} turn={6} />
            <Sheet x={36} y={32} w={90} h={74} turn={-1} />
          </>
        )}
      </g>

      {/* front panel */}
      <path
        d="M8 60 a8 8 0 0 1 8-8 H144 a8 8 0 0 1 8 8 v52 a8 8 0 0 1-8 8 H16 a8 8 0 0 1-8-8 z"
        fill={tone.front}
      />
      <path d="M16 52.8 H144" stroke={tone.edge} strokeWidth={1.6} strokeLinecap="round" fill="none" />

      {done && (
        <g>
          <circle cx={80} cy={88} r={19} fill={PAPER} opacity={0.94} />
          <path d="M70 88.5 l7 7 l14-15" fill="none" stroke="#4d4c48" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  )
}
