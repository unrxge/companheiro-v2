// src/components/studio/shelf/folder-icon.tsx — one folder, four states.
//
//   undeclared  empty folder, a little sparkle  an idea still being explored
//   queued      one taped-in page               declared, waiting its turn
//   active      pages + a photo, taped in       underway
//   completed   the active folder, greyed, with a hand-drawn check on the front
//
// Drawn to look sketched rather than engineered: soft, slightly uneven shapes,
// a chunky outline, wobbly writing lines, bits of tape. The paper sits between
// the back and front panels, which is what makes "how full" readable at a
// glance. Colours follow the app's light/dark switch.

import { useId } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import type { FolderState } from '@/lib/studio/shelf-view'

interface Tone { back: string; front: string; line: string }
interface Palette {
  tones: Record<FolderState, Tone>
  paper: string
  rule: string
  sky: string
  sun: string
  hillA: string
  hillB: string
  tape: string
  ink: string
  shadow: string
}

// Dark mode: deep, slightly dusty folders that sit in the dark without glowing.
const DARK: Palette = {
  tones: {
    undeclared: { back: '#3a3935', front: '#514f49', line: '#1d1c19' },
    queued: { back: '#6a4f17', front: '#8f6c26', line: '#33260a' },
    active: { back: '#1c5540', front: '#2a7656', line: '#0d2e22' },
    completed: { back: '#35342f', front: '#494842', line: '#1d1c19' },
  },
  paper: '#dcd6c8',
  rule: '#a9a292',
  sky: '#7f98aa',
  sun: '#dcbd68',
  hillA: '#5b788d',
  hillB: '#496479',
  tape: 'rgba(232,206,130,0.62)',
  ink: '#3d3b36',
  shadow: 'drop-shadow(0 5px 7px rgba(0,0,0,0.45))',
}

// Light mode: paper-and-pastel, the way the light cards read.
const LIGHT: Palette = {
  tones: {
    undeclared: { back: '#d6d0c2', front: '#e8e3d7', line: '#8f8874' },
    queued: { back: '#e9c877', front: '#f5dd9e', line: '#a07a22' },
    active: { back: '#9dd0b4', front: '#bfe6d0', line: '#4a866a' },
    completed: { back: '#cbcac5', front: '#dedcd8', line: '#8b8983' },
  },
  paper: '#fffdf7',
  rule: '#dcd4c0',
  sky: '#bcd8e9',
  sun: '#f6d97f',
  hillA: '#8db1c8',
  hillB: '#7b9fb7',
  tape: 'rgba(244,196,112,0.72)',
  ink: '#6c6a64',
  shadow: 'drop-shadow(0 5px 6px rgba(60,50,30,0.22))',
}

/** A deterministic wobble in [-amp, amp], so shapes are uneven but never flicker. */
const wob = (n: number, amp: number) => Math.sin(n * 12.9898 + 1.7) * amp

/** A soft, slightly lopsided rectangle. */
function soft(x: number, y: number, w: number, h: number, seed: number): string {
  const a = wob(seed, 2), b = wob(seed + 1, 2), c = wob(seed + 2, 2), d = wob(seed + 3, 2)
  return (
    `M${x + 5} ${y + a} Q${x + w / 2} ${y - 1.5 + b} ${x + w - 5} ${y + c} `
    + `Q${x + w + 1.5} ${y + h / 2} ${x + w - 4} ${y + h + d} `
    + `Q${x + w / 2} ${y + h + 2 + a} ${x + 5} ${y + h + b} `
    + `Q${x - 1.5} ${y + h / 2 + c} ${x + 5} ${y + a} Z`
  )
}

/** A hand-written line: a run of small waves. */
const scribble = (x: number, y: number, len: number) => {
  const waves = Math.max(2, Math.round(len / 9))
  return `M${x} ${y} q4.5 -4 9 0${' t9 0'.repeat(waves - 1)}`
}

function Page({ p, x, y, w, h, turn, seed, tape }: { p: Palette; x: number; y: number; w: number; h: number; turn: number; seed: number; tape?: boolean }) {
  return (
    <g transform={`rotate(${turn} ${x + w / 2} ${y + h / 2})`}>
      <path d={soft(x, y, w, h, seed)} fill={p.paper} stroke={p.ink} strokeWidth={2.4} strokeLinejoin="round" />
      <path d={scribble(x + 11, y + h * 0.3, 44)} fill="none" stroke={p.rule} strokeWidth={2.6} strokeLinecap="round" />
      <path d={scribble(x + 11, y + h * 0.5, 58)} fill="none" stroke={p.rule} strokeWidth={2.6} strokeLinecap="round" />
      <path d={scribble(x + 11, y + h * 0.7, 30)} fill="none" stroke={p.rule} strokeWidth={2.6} strokeLinecap="round" />
      {tape && <rect x={x + w / 2 - 11} y={y - 5} width={22} height={9} rx={1.5} fill={p.tape} transform={`rotate(-6 ${x + w / 2} ${y})`} />}
    </g>
  )
}

function Photo({ p, x, y, w, h, turn, seed, uid }: { p: Palette; x: number; y: number; w: number; h: number; turn: number; seed: number; uid: string }) {
  const clip = `photo-${uid}`
  return (
    <g transform={`rotate(${turn} ${x + w / 2} ${y + h / 2})`}>
      <path d={soft(x, y, w, h, seed)} fill={p.paper} stroke={p.ink} strokeWidth={2.4} strokeLinejoin="round" />
      <clipPath id={clip}><path d={soft(x + 6, y + 6, w - 12, h - 12, seed + 5)} /></clipPath>
      <g clipPath={`url(#${clip})`}>
        <rect x={x} y={y} width={w} height={h} fill={p.sky} />
        <circle cx={x + w * 0.73} cy={y + h * 0.32} r={h * 0.11} fill={p.sun} />
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i / 6) * Math.PI * 2
          const cx = x + w * 0.73, cy = y + h * 0.32, r0 = h * 0.15, r1 = h * 0.21
          return <line key={i} x1={cx + Math.cos(a) * r0} y1={cy + Math.sin(a) * r0} x2={cx + Math.cos(a) * r1} y2={cy + Math.sin(a) * r1} stroke={p.sun} strokeWidth={2.2} strokeLinecap="round" />
        })}
        <path d={`M${x} ${y + h} Q${x + w * 0.22} ${y + h * 0.3} ${x + w * 0.45} ${y + h * 0.62} T${x + w} ${y + h * 0.7} L${x + w} ${y + h} Z`} fill={p.hillA} />
        <path d={`M${x} ${y + h} Q${x + w * 0.4} ${y + h * 0.62} ${x + w * 0.7} ${y + h * 0.82} T${x + w} ${y + h * 0.86} L${x + w} ${y + h} Z`} fill={p.hillB} />
      </g>
      <rect x={x + w / 2 - 12} y={y - 5} width={24} height={9} rx={1.5} fill={p.tape} transform={`rotate(5 ${x + w / 2} ${y})`} />
    </g>
  )
}

export function FolderIcon({ state, width = 150 }: { state: FolderState; width?: number }) {
  const { theme } = useTheme()
  const uid = useId().replace(/:/g, '')
  const p = theme === 'dark' ? DARK : LIGHT
  const tone = p.tones[state]
  const done = state === 'completed'
  const full = state === 'active' || done

  const outline = { stroke: tone.line, strokeWidth: 3, strokeLinejoin: 'round' as const }

  return (
    <svg
      aria-hidden
      viewBox="0 0 160 132"
      width={width}
      height={(width * 132) / 160}
      style={{ display: 'block', overflow: 'visible', filter: p.shadow }}
    >
      {/* back panel, with its tab */}
      <path
        d="M10 28 C9 19 14 14 22 14 L56 13 C61 13 64 16 67 21 C69 24 72 26 77 26 L138 25 C147 25 152 30 152 39 L153 106 C153 115 148 120 139 120 L21 121 C13 121 8 116 8 108 Z"
        fill={tone.back}
        {...outline}
      />

      {/* what is inside, drawn between the two panels */}
      <g opacity={done ? 0.8 : 1}>
        {state === 'queued' && <Page p={p} x={33} y={27} w={92} h={72} turn={-4} seed={1} tape />}
        {full && (
          <>
            <Page p={p} x={19} y={31} w={80} h={72} turn={-9} seed={2} />
            <Photo p={p} x={58} y={21} w={82} h={70} turn={7} seed={3} uid={uid} />
            <Page p={p} x={36} y={33} w={88} h={72} turn={-2} seed={4} tape />
          </>
        )}
      </g>

      {/* front panel — its top edge sits a touch off-level, like it was drawn */}
      <path
        d="M9 60 C9 54 13 51 19 51 L142 49.5 C148 49.5 152 53 152 59 L153 108 C153 116 148 121 140 121 L21 121.5 C13 121.5 8 117 8 109 Z"
        fill={tone.front}
        {...outline}
      />
      <path d="M18 58 Q80 55.5 141 57.5" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={2.4} strokeLinecap="round" />

      {state === 'undeclared' && (
        <path
          d="M80 74 C81 82 83 84 91 86 C83 88 81 90 80 98 C79 90 77 88 69 86 C77 84 79 82 80 74 Z"
          fill="none" stroke={tone.line} strokeWidth={2.6} strokeLinejoin="round" opacity={0.75}
        />
      )}

      {done && (
        <g>
          <path d={soft(60, 70, 40, 38, 9)} fill={p.paper} stroke={p.ink} strokeWidth={2.4} strokeLinejoin="round" opacity={0.96} />
          <path d="M69 90 C72 92 74 95 77 99 C83 90 90 83 96 78" fill="none" stroke={p.ink} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
    </svg>
  )
}
