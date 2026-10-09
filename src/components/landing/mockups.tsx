'use client'

// Landing-page visuals. Every one is built from the app's real components
// (Container, Card, Pill, StageRibbon) or drawn in their exact design language, fed with sample
// data. One example runs through the whole page: a person whose scattered
// fragments turn out to be one vision, "The Good Plates". Nothing here reads
// the database.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  animate,
  motion as m,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { Camera, Check, FileText, Mic, Music, Waypoints, type LucideIcon } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { Container, Card } from '@/components/shell/page-shell'
import { Pill } from '@/components/ui/pill'
import { StageRibbon } from '@/components/widgets'
import { alpha, onColor, radius, type as typeRoles, type Hue, type JourneyStep } from '@/lib/design-tokens'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

const VISION_TITLE = 'The Good Plates'
const VISION_LINE = 'A body of work about what we save for later, and the choice to use it now.'

/**
 * Reveals `text` a character at a time once `start` is true. Instant under
 * reduced motion. While `unwind` is true it is backspaced instead, in well
 * under half a second however long it is.
 */
export function useTypewriter(text: string, start: boolean, msPerChar = 26, unwind = false) {
  const reduce = useReducedMotion()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (unwind) {
      const id = window.setInterval(() => {
        setN((prev) => {
          if (prev <= 0) {
            window.clearInterval(id)
            return 0
          }
          return Math.max(0, prev - Math.max(3, Math.ceil(text.length / 25)))
        })
      }, 16)
      return () => window.clearInterval(id)
    }
    if (!start) return
    if (reduce) {
      setN(text.length)
      return
    }
    setN(0)
    const id = window.setInterval(() => {
      setN((prev) => {
        if (prev >= text.length) {
          window.clearInterval(id)
          return prev
        }
        return prev + 1
      })
    }, msPerChar)
    return () => window.clearInterval(id)
  }, [text, start, msPerChar, reduce, unwind])
  return { shown: text.slice(0, n), done: n >= text.length }
}

/**
 * A widget winding itself back before it plays again. Each time `signal`
 * changes, `back` counts up through `marks` (milliseconds from the start of
 * the rewind): 1 at once, 2 at the first mark, and so on. The last mark ends
 * it: `back` returns to 0, `reset` puts the widget at its beginning, and
 * `cycle` goes up, which is the cue to play forward. `stop` abandons a rewind
 * under way, for when someone presses something in the middle of one.
 */
export function useRewind(signal: number | undefined, marks: readonly number[], reset?: () => void) {
  const [back, setBack] = useState(0)
  const [cycle, setCycle] = useState(0)
  const first = useRef(signal)
  const ids = useRef<number[]>([])
  const onEnd = useRef(reset)
  onEnd.current = reset
  const stop = useCallback(() => {
    ids.current.forEach((id) => window.clearTimeout(id))
    ids.current = []
    setBack(0)
  }, [])
  useEffect(() => {
    if (signal === undefined || signal === first.current) return
    setBack(1)
    ids.current = marks.map((ms, i) =>
      window.setTimeout(() => {
        if (i < marks.length - 1) return setBack(i + 2)
        setBack(0)
        onEnd.current?.()
        setCycle((c) => c + 1)
      }, ms),
    )
    return () => {
      ids.current.forEach((id) => window.clearTimeout(id))
      ids.current = []
    }
  }, [signal, marks])
  return { back, cycle, stop }
}

/**
 * The accent card: the one thing on a surface that is more than the surface. A
 * soft wash of `color` over `base`, a thin outline, a firmer edge on the left
 * and a faint glow underneath. `base` is what it sits on when the wash is
 * taken away.
 */
export function accentWash(color: string, base: string): React.CSSProperties {
  return {
    backgroundColor: base,
    backgroundImage: `linear-gradient(135deg, ${alpha(color, 0.13)}, ${alpha(color, 0.04)} 70%)`,
    border: `1px solid ${alpha(color, 0.3)}`,
    borderLeft: `4px solid ${color}`,
    boxShadow: `0 10px 26px -16px ${alpha(color, 0.55)}`,
  }
}

/** A phrase picked out with a marker stroke, which sweeps across it when `on`. */
export function Marked({ on, color, children }: { on: boolean; color: string; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(${alpha(color, 0.3)}, ${alpha(color, 0.3)})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: '0 85%',
        backgroundSize: on ? '100% 82%' : '0% 82%',
        transition: reduce ? 'none' : `background-size ${on ? 0.65 : 0.25}s cubic-bezier(0.16, 1, 0.3, 1)`,
        borderRadius: 3,
        padding: '0 1px',
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
      }}
    >
      {children}
    </span>
  )
}

/** Takes the height of what is inside it, and eases to the next height when that changes. */
export function AutoHeight({ children }: { children: React.ReactNode }) {
  const inner = useRef<HTMLDivElement>(null)
  const [h, setH] = useState<number | null>(null)
  const reduce = useReducedMotion()
  useEffect(() => {
    const el = inner.current
    if (!el) return
    // Between one slide leaving and the next arriving there is nothing inside: keep the last height through that.
    const read = () => { if (el.childElementCount) setH(el.offsetHeight) }
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div style={{ height: h ?? 'auto', overflow: 'hidden', transition: reduce || h === null ? 'none' : 'height 0.45s cubic-bezier(0.16, 1, 0.3, 1)' }}>
      {/* Room underneath for a glow that would otherwise be cut off. */}
      {/* flow-root: a top margin inside must count towards the height, or the bottom is cut off by that much. */}
      <div ref={inner} style={{ display: 'flow-root', paddingBottom: 14 }}>{children}</div>
    </div>
  )
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { t } = useTheme()
  return <p style={{ ...typeRoles.small, fontWeight: 600, color: t.textMuted, ...style }}>{children}</p>
}

// ── Hero: everything in one place, the vision in your own words ─────────────
// Four things made at different times, in four different mediums, settle side
// by side in one project, and the person writes what they add up to. Each
// fragment is named and coloured for its medium, and all four are built the
// same way (a mark, a name, a line), so someone who only glances sees four
// kinds of work becoming one. Nothing here
// shows Companheiro finding the link for them: the line under "Vision" types
// as theirs.

type FragmentId = 'draft' | 'lyric' | 'memo' | 'photo'
const FRAGMENTS: { id: FragmentId; kind: string; hue: Hue; Icon: LucideIcon; tilt: number }[] = [
  { id: 'draft', kind: 'Draft', hue: 'tide', Icon: FileText, tilt: -2.2 },
  { id: 'lyric', kind: 'Lyric', hue: 'violet', Icon: Music, tilt: 1.6 },
  { id: 'memo', kind: 'Voice memo', hue: 'verdant', Icon: Mic, tilt: -1.2 },
  { id: 'photo', kind: 'Photo', hue: 'ochre', Icon: Camera, tilt: 2 },
]

/** One thing already made, in its medium's colour. */
function FragmentCard({ f }: { f: (typeof FRAGMENTS)[number] }) {
  const { t } = useTheme()
  const c = t[f.hue]
  const text: React.CSSProperties = { ...typeRoles.small, fontSize: 13, lineHeight: 1.4, color: t.textPrimary, marginTop: 8 }
  return (
    <div style={{ height: '100%', padding: '10px 11px 12px', borderRadius: radius.widget, backgroundColor: t.cardBgInner, borderTop: `2px solid ${alpha(c, 0.75)}` }}>
      <div className="flex items-center gap-1.5">
        <span className="flex shrink-0 items-center justify-center" style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: t.soft[f.hue], color: c }}>
          <f.Icon size={12} strokeWidth={2.4} aria-hidden />
        </span>
        <span style={{ ...typeRoles.small, fontSize: 11, fontWeight: 700, letterSpacing: '0.03em', color: c, whiteSpace: 'nowrap' }}>{f.kind}</span>
      </div>
      {f.id === 'draft' && <p style={text}>My mother kept the good plates for guests who never came.</p>}
      {f.id === 'lyric' && (
        <p style={{ ...typeRoles.quote, fontSize: 14.5, lineHeight: 1.35, color: t.textPrimary, marginTop: 8 }}>
          Every house I&rsquo;ve lived in had a room I never used.
        </p>
      )}
      {f.id === 'memo' && <p style={text}>&ldquo;something about waiting until I&rsquo;m ready&rdquo;</p>}
      {f.id === 'photo' && <p style={text}>Empty café chairs, before opening.</p>}
    </div>
  )
}

// Winding back: the line is backspaced, then the vision drops away and the
// four fragments jiggle back to how they lay. Nothing leaves; it plays forward
// again from there.
const VISION_BACK = [450, 1200] as const

/** What a widget that keeps itself moving is handed by the landing page's Replay. */
export interface LoopProps {
  /** False until it has been seen. */
  active?: boolean
  /** Goes up each time it should wind back, or move on. */
  replay?: number
  /** Called each time it finishes playing, optionally with how long to hold there. */
  onDone?: (holdMs?: number) => void
}

export function VisionFinder({ active = true, replay = 0, onDone }: LoopProps) {
  const { t } = useTheme()
  const reduce = useReducedMotion()
  const [stage, setStage] = useState(0) // 0 scattered, 1 side by side, 2 the vision being written
  const [again, setAgain] = useState(0)
  const { back, cycle } = useRewind(replay + again, VISION_BACK, () => setStage(0))

  useEffect(() => {
    if (!active) return
    if (reduce) {
      setStage(2)
      return
    }
    setStage(0)
    // The first time the fragments have to arrive; after a rewind they are already lying there.
    const lead = cycle === 0 ? 1700 : 500
    const a = window.setTimeout(() => setStage(1), lead)
    const b = window.setTimeout(() => setStage(2), lead + 1200)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [reduce, cycle, active])

  const { shown, done } = useTypewriter(VISION_LINE, stage >= 2, 30, back > 0)
  const away = !reduce && !active
  const settled = stage >= 1 && back < 2
  const visionUp = stage >= 2 && back < 2
  const written = stage >= 2 && done && back === 0
  useEffect(() => {
    if (written) onDone?.()
  }, [written, onDone])

  return (
    <Container padding="clamp(10px, 3vw, 16px)" style={{ width: '100%' }}>
      <Card padding="clamp(13px, 4vw, 20px)">
        <Label>Things you&rsquo;ve already made</Label>
        <div className="mt-3.5 grid grid-cols-2 gap-2 sm:gap-2.5">
          {FRAGMENTS.map((f, i) => (
            <m.div
              key={f.id}
              initial={reduce ? false : { opacity: 0, y: 12, rotate: f.tilt * 2 }}
              animate={away ? { opacity: 0, y: 12, rotate: f.tilt * 2 } : { opacity: 1, y: 0, rotate: settled ? 0 : f.tilt }}
              transition={
                back === 2 ? { type: 'spring', stiffness: 300, damping: 9, delay: (FRAGMENTS.length - 1 - i) * 0.06 }
                : { duration: 0.7, delay: stage === 0 ? 0.25 + i * 0.15 : i * 0.06, ease: EASE }
              }
            >
              <FragmentCard f={f} />
            </m.div>
          ))}
        </div>

        <m.div
          initial={false}
          animate={{ opacity: visionUp ? 1 : 0, y: visionUp ? 0 : 10 }}
          transition={back > 0 ? { duration: 0.3, ease: 'easeIn' } : { duration: 0.7, ease: EASE }}
          style={{ marginTop: 14 }}
          aria-hidden={!visionUp}
        >
          {/* The one card that is more than paper: a soft wash of the accent, a firmer edge and a faint glow, so it reads as where the four fragments were heading without shouting. */}
          <div style={{ padding: 18, borderRadius: radius.widget, ...accentWash(t.ember, t.cardBgInner) }}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Pill hue="ember">Vision</Pill>
                <span style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted, whiteSpace: 'nowrap' }}>In your words</span>
              </div>
              {/* The four it was made from, landing in it one after another. */}
              <div aria-hidden className="flex shrink-0 items-center">
                {FRAGMENTS.map((f, i) => (
                  <m.span
                    key={f.id}
                    initial={false}
                    animate={{ scale: visionUp || reduce ? 1 : 0, opacity: visionUp || reduce ? 1 : 0 }}
                    transition={visionUp ? { type: 'spring', stiffness: 380, damping: 18, delay: 0.25 + i * 0.09 } : { duration: 0.15 }}
                    className="flex items-center justify-center"
                    style={{ width: 22, height: 22, marginLeft: i ? -5 : 0, borderRadius: 999, backgroundColor: t[f.hue], color: '#ffffff', border: `2px solid ${t.cardBgInner}` }}
                  >
                    <f.Icon size={10} strokeWidth={2.6} />
                  </m.span>
                ))}
              </div>
            </div>
            <p style={{ ...typeRoles.h2, fontSize: 21, color: t.textPrimary, marginTop: 12 }}>{VISION_TITLE}</p>
            <p aria-label={VISION_LINE} style={{ ...typeRoles.small, fontSize: 14, color: t.textSecondary, marginTop: 5, minHeight: '2.9em' }}>
              <span aria-hidden>
                {shown}
                {!done && stage >= 2 && <span style={{ borderRight: `1.5px solid ${t.ember}`, marginLeft: 1 }}>&#8203;</span>}
              </span>
            </p>
          </div>
        </m.div>
      </Card>
      <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-3.5">
        <p style={{ ...typeRoles.small, color: t.textSecondary }}>Four separate ideas. One vision.</p>
        {!reduce && (
          <button
            type="button"
            onClick={() => setAgain((n) => n + 1)}
            style={{ ...typeRoles.small, fontWeight: 600, color: t.textSecondary, textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}
            className="shrink-0 cursor-pointer rounded-full px-2 py-1"
          >
            Show me again
          </button>
        )}
      </div>
    </Container>
  )
}

// ── The canvas: one client project, as a studio of one or a director holds it ─
// A launch film for a ceramics studio: what it is meant to be, the pieces, the
// threads across them, and the things the canvas keeps beside the work (a
// reference image, a voice note, a task list). Drawn in the design language of
// the real canvas items (components/studio/work/board-items.tsx); nothing here
// is uploaded or played.

const PROJECT_TITLE = 'Atlas Ceramics · launch film'
const PROJECT_LINE = 'Sixty seconds on hands, heat and patience.'
const PROJECT_RULES = 'Keeps: natural light. Refuses: a voiceover, stock music.'

type Box = { id: string; x: number; y: number; w: number; h: number }
type BoardNode = Box & (
  | { kind: 'vision' }
  | { kind: 'hub'; label: string; hue: Hue }
  | { kind: 'piece'; title: string; medium: string; step: JourneyStep }
  | { kind: 'image'; caption: string }
  | { kind: 'recording'; title: string; /** For where there is no room for the whole title. */ short: string; length: string }
  | { kind: 'tasks'; title: string; tasks: { text: string; done: boolean }[] }
)

const BOARD_W = 1080
const BOARD_H = 468
const NODES: BoardNode[] = [
  { id: 'vision', kind: 'vision', x: 24, y: 24, w: 252, h: 214 },
  { id: 'tasks', kind: 'tasks', x: 24, y: 258, w: 252, h: 172, title: 'Before the shoot', tasks: [
    { text: 'Confirm the kiln day with Ana', done: true },
    { text: 'Book the 50mm', done: false },
    { text: 'Send her the treatment', done: false },
  ] },
  { id: 'hands', kind: 'hub', x: 300, y: 104, w: 176, h: 50, label: 'made by hand', hue: 'ochre' },
  { id: 'reveal', kind: 'hub', x: 300, y: 282, w: 176, h: 50, label: 'nothing rushed', hue: 'tide' },
  { id: 'treatment', kind: 'piece', x: 512, y: 24, w: 210, h: 104, title: 'Treatment', medium: 'For the client', step: 'test' },
  { id: 'shots', kind: 'piece', x: 512, y: 180, w: 210, h: 104, title: 'Shot list', medium: 'Film', step: 'write' },
  { id: 'stills', kind: 'piece', x: 846, y: 40, w: 210, h: 104, title: 'Stills for the site', medium: 'Photo series', step: 'concept' },
  { id: 'note', kind: 'recording', x: 512, y: 340, w: 232, h: 104, title: 'Voice note after the recce', short: 'Recce voice note', length: '1:12' },
  { id: 'frame', kind: 'image', x: 846, y: 204, w: 210, h: 224, caption: 'Kiln at 6am. The light to match.' },
]

// On a phone the same canvas is folded up: the threads sit above and below
// the vision so no height is wasted, and the pieces start close enough that
// the first column shows at the edge of the screen. One swipe reaches the end.
// The task list is left to the wide version.
const BOARD_W_PHONE = 610
const BOARD_H_PHONE = 344
const PHONE: Record<string, Box | null> = {
  hands: { id: 'hands', x: 14, y: 14, w: 150, h: 36 },
  vision: { id: 'vision', x: 14, y: 62, w: 212, h: 222 },
  reveal: { id: 'reveal', x: 14, y: 296, w: 154, h: 36 },
  treatment: { id: 'treatment', x: 246, y: 14, w: 168, h: 104 },
  shots: { id: 'shots', x: 246, y: 130, w: 168, h: 104 },
  note: { id: 'note', x: 246, y: 246, w: 168, h: 86 },
  stills: { id: 'stills', x: 428, y: 14, w: 168, h: 104 },
  frame: { id: 'frame', x: 428, y: 130, w: 168, h: 202 },
  tasks: null,
}
const NODES_PHONE: BoardNode[] = NODES.filter((n) => PHONE[n.id]).map((n) => ({ ...n, ...PHONE[n.id]! }))

// The landing page on a phone shows less of it, further apart and off the
// grid: the vision by its title alone, one thread, two pieces, and one image
// and one recording kept beside them. It is there to be taken in at a glance,
// not to list everything a canvas can hold; the wide version does that.
const BOARD_W_AIRY = 566
const BOARD_H_AIRY = 372
const AIRY: Record<string, Box> = {
  vision: { id: 'vision', x: 16, y: 24, w: 196, h: 104 },
  hands: { id: 'hands', x: 34, y: 164, w: 172, h: 46 },
  note: { id: 'note', x: 20, y: 262, w: 178, h: 86 },
  treatment: { id: 'treatment', x: 250, y: 14, w: 164, h: 104 },
  shots: { id: 'shots', x: 228, y: 176, w: 164, h: 104 },
  frame: { id: 'frame', x: 424, y: 110, w: 126, h: 178 },
}
const NODES_AIRY: BoardNode[] = NODES.filter((n) => AIRY[n.id]).map((n) => ({ ...n, ...AIRY[n.id] }))
const EDGES_AIRY: [string, string][] = [
  ['hands', 'treatment'],
  ['hands', 'shots'],
  ['shots', 'note'],
  ['shots', 'frame'],
]

/** A thread from its hub to a piece (coloured), or a piece to something kept beside it (plain, dashed). */
const EDGES: [string, string][] = [
  ['hands', 'shots'],
  ['hands', 'stills'],
  ['reveal', 'treatment'],
  ['reveal', 'shots'],
  ['shots', 'note'],
  ['stills', 'frame'],
]

type Pos = { x: MotionValue<number>; y: MotionValue<number> }

function Edge({ a, b, na, nb, color, dashed }: { a: Pos; b: Pos; na: BoardNode; nb: BoardNode; color: string; dashed: boolean }) {
  const d = useTransform([a.x, a.y, b.x, b.y], ([ax, ay, bx, by]: number[]) => {
    const x1 = na.x + ax + na.w / 2
    const y1 = na.y + ay + na.h / 2
    const x2 = nb.x + bx + nb.w / 2
    const y2 = nb.y + by + nb.h / 2
    // Something kept under a piece hangs straight down from it; a thread sweeps across.
    if (dashed) return `M ${x1} ${y1} L ${x2} ${y2}`
    const mx = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
  })
  const reduce = useReducedMotion()
  if (dashed) return <m.path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeDasharray="3 5" />
  // A thread is the thing to notice on a canvas: one point that several pieces
  // share. It is drawn lit, with a pulse travelling out from its name to each
  // piece it runs through.
  return (
    <>
      <m.path d={d} fill="none" stroke={color} strokeOpacity={0.16} strokeWidth={9} strokeLinecap="round" />
      <m.path d={d} fill="none" stroke={color} strokeOpacity={0.85} strokeWidth={1.75} strokeLinecap="round" />
      {!reduce && (
        <m.path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray="0.5 26"
          animate={{ strokeDashoffset: [0, -53] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'linear' }}
        />
      )}
    </>
  )
}

/** A waveform that fills as it "plays". No sound: the page has no recording to play. */
const BARS = [0.35, 0.6, 0.45, 0.8, 0.55, 0.3, 0.7, 0.9, 0.5, 0.4, 0.75, 0.6, 0.35, 0.55, 0.85, 0.45, 0.3, 0.65, 0.5, 0.4, 0.7, 0.35, 0.5, 0.3]

function RecordingBody({ node }: { node: Extract<BoardNode, { kind: 'recording' }> }) {
  const { t } = useTheme()
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => setAt((v) => (v >= 1 ? 1 : v + 0.02)), 120)
    return () => window.clearInterval(id)
  }, [playing])
  useEffect(() => { if (at >= 1) { setPlaying(false); setAt(0) } }, [at])
  const compact = node.w < 200
  return (
    <Card padding={compact ? 10 : 12} style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ ...typeRoles.small, fontSize: compact ? 12 : 13, fontWeight: 600, color: t.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{compact ? node.short : node.title}</p>
      <div className="mt-auto flex items-center gap-2.5">
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => setPlaying((v) => !v)}
          onPointerDown={(e) => e.stopPropagation()}
          className="flex shrink-0 cursor-pointer items-center justify-center rounded-full"
          style={{ width: compact ? 28 : 34, height: compact ? 28 : 34, border: 'none', background: t.inverseBg, color: t.inverseText }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            {playing ? <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></> : <path d="M8 5v14l11-7z" />}
          </svg>
        </button>
        <div aria-hidden className="flex min-w-0 flex-1 items-center gap-[2px]" style={{ height: compact ? 22 : 30 }}>
          {BARS.map((b, i) => (
            <span key={i} style={{ flex: 1, borderRadius: 2, height: `${Math.round(b * 100)}%`, background: (i + 0.5) / BARS.length <= at ? t.textPrimary : alpha(t.textPrimary, 0.22) }} />
          ))}
        </div>
        <span style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted, fontVariantNumeric: 'tabular-nums' }}>{node.length}</span>
      </div>
    </Card>
  )
}

function TasksBody({ node }: { node: Extract<BoardNode, { kind: 'tasks' }> }) {
  const { t } = useTheme()
  const [done, setDone] = useState(() => node.tasks.map((x) => x.done))
  return (
    <Card padding={14} style={{ height: '100%' }}>
      <p style={{ ...typeRoles.small, fontSize: 11, fontWeight: 600, color: t.textMuted }}>Task list</p>
      <p style={{ ...typeRoles.h3, color: t.textPrimary, marginTop: 3 }}>{node.title}</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {node.tasks.map((task, i) => (
          <li key={task.text}>
            <button
              type="button"
              role="checkbox"
              aria-checked={done[i]}
              onClick={() => setDone((d) => d.map((v, j) => (j === i ? !v : v)))}
              onPointerDown={(e) => e.stopPropagation()}
              className="flex w-full cursor-pointer items-start gap-2.5 text-left"
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <span aria-hidden className="mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]" style={{ border: `1.5px solid ${done[i] ? t.verdant : t.inputBorder}`, background: done[i] ? t.verdant : 'transparent' }}>
                {done[i] && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
              </span>
              <span style={{ ...typeRoles.small, color: done[i] ? t.textMuted : t.textPrimary, textDecoration: done[i] ? 'line-through' : 'none' }}>{task.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function NodeBody({ node, threads }: { node: BoardNode; /** The threads that run through this piece, by colour. */ threads: Hue[] }) {
  const { t } = useTheme()
  if (node.kind === 'vision') {
    const tight = node.w < 240
    // Short enough to hold only its name: the lighter phone layout.
    const bare = node.h < 130
    return (
      <Card padding={tight ? 14 : 18} style={{ height: '100%', ...accentWash(t.ember, t.cardBg) }}>
        <Pill hue="ember">Vision</Pill>
        <p style={{ ...typeRoles.h2, fontSize: tight ? 18 : 20, color: t.textPrimary, marginTop: bare ? 8 : 10 }}>{PROJECT_TITLE}</p>
        {!bare && <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 6 }}>{PROJECT_LINE}</p>}
        {!bare && <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, marginTop: 10 }}>{PROJECT_RULES}</p>}
      </Card>
    )
  }
  if (node.kind === 'hub') {
    // A thread's name: what several pieces have in common, said in a few words.
    // Set apart from everything else on the canvas, in its own colour and lit from within.
    const c = t[node.hue]
    const small = node.h < 44
    const disc = node.h - 14
    return (
      <div
        className="flex h-full items-center rounded-full"
        style={{
          gap: small ? 7 : 9, paddingLeft: 6, paddingRight: 14,
          backgroundColor: t.cardBg,
          backgroundImage: `linear-gradient(120deg, ${alpha(c, 0.24)}, ${alpha(c, 0.06)})`,
          border: `1.5px solid ${alpha(c, 0.7)}`,
          boxShadow: `0 0 0 4px ${alpha(c, 0.12)}, 0 10px 22px -12px ${alpha(c, 0.8)}`,
        }}
      >
        <span className="flex shrink-0 items-center justify-center rounded-full" style={{ width: disc, height: disc, backgroundColor: c, color: onColor(c) }}>
          <Waypoints size={small ? 12 : 15} strokeWidth={2.2} aria-hidden />
        </span>
        <span className="min-w-0">
          {!small && <span style={{ ...typeRoles.small, display: 'block', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', lineHeight: 1.2, color: c }}>Thread</span>}
          <span style={{ ...typeRoles.small, display: 'block', fontSize: small ? 12.5 : 13.5, fontWeight: 600, lineHeight: 1.25, color: t.textPrimary, whiteSpace: 'nowrap' }}>{node.label}</span>
        </span>
      </div>
    )
  }
  if (node.kind === 'image') {
    return (
      <Card padding={0} style={{ height: '100%', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* A reference frame, drawn: the mouth of a kiln before dawn. */}
        <div
          role="img"
          aria-label="A reference image: a kiln glowing in a dark workshop"
          className="relative min-h-0 flex-1"
          style={{ background: 'radial-gradient(42% 38% at 50% 62%, #ffd9a0 0%, #f08a3c 28%, #8a2f14 58%, transparent 78%), linear-gradient(180deg, #14110f 0%, #2a1a12 55%, #0f0d0c 100%)' }}
        >
          <span aria-hidden className="absolute inset-x-[22%] bottom-[14%] top-[34%] rounded-t-[999px]" style={{ border: '6px solid rgba(15,13,12,0.82)', borderBottom: 'none' }} />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-[14%]" style={{ background: '#0f0d0c' }} />
        </div>
        <p style={{ ...typeRoles.small, fontSize: 12.5, color: t.textSecondary, padding: '8px 12px 10px' }}>{node.caption}</p>
      </Card>
    )
  }
  if (node.kind === 'recording') return <RecordingBody node={node} />
  if (node.kind === 'tasks') return <TasksBody node={node} />
  return (
    <Card padding={14} style={{ height: '100%' }}>
      <div className="flex items-center justify-between gap-2">
        <p style={{ ...typeRoles.small, fontSize: 11, fontWeight: 600, color: t.textMuted }}>{node.medium}</p>
        {/* Which threads run through it: a piece on two shows both. */}
        <span aria-hidden className="flex shrink-0 items-center gap-[7px] pr-0.5">
          {threads.map((h) => <span key={h} style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: t[h], boxShadow: `0 0 0 3px ${alpha(t[h], 0.22)}` }} />)}
        </span>
      </div>
      <p style={{ ...typeRoles.h3, color: t.textPrimary, marginTop: 3 }}>{node.title}</p>
      <div style={{ marginTop: 12 }}>
        <StageRibbon step={node.step} compact />
      </div>
    </Card>
  )
}

function BoardNodeView({ node, pos, order, draggable, boardRef, away, leaving, threads }: { node: BoardNode; threads: Hue[]; pos: Pos; order: number; draggable: boolean; boardRef: React.RefObject<HTMLDivElement | null>; /** Not on the canvas (yet, or for the moment). */ away: boolean; /** The canvas is winding back: what leaves does so last to arrive first. */ leaving: boolean }) {
  const reduce = useReducedMotion()
  return (
    <m.div
      drag={draggable}
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={boardRef}
      whileDrag={{ scale: 1.03, zIndex: 2 }}
      // Each thing arrives on the canvas in turn, so a replay reads as the project being laid out.
      initial={reduce ? false : { opacity: 0, scale: 0.94 }}
      animate={away ? { opacity: 0, scale: 0.94 } : { opacity: 1, scale: 1 }}
      transition={leaving ? { duration: 0.26, delay: (ARRIVE.length - 1 - order) * 0.055, ease: 'backIn' } : { duration: 0.5, delay: 0.15 + order * 0.14, ease: EASE }}
      style={{ x: pos.x, y: pos.y, width: node.w, height: node.h, position: 'absolute', left: node.x, top: node.y, touchAction: draggable ? 'none' : 'auto' }}
      className={draggable ? 'cursor-grab active:cursor-grabbing' : undefined}
    >
      <NodeBody node={node} threads={threads} />
    </m.div>
  )
}

// The order things arrive in: what it is meant to be, the pieces, the threads, then what is kept beside them.
const ARRIVE = ['vision', 'treatment', 'shots', 'stills', 'hands', 'reveal', 'frame', 'note', 'tasks']
// Winding back: the lines go, then everything is taken off in the reverse of
// that order, down to the vision. The vision stays, and the project is laid
// out around it again.
const CANVAS_BACK = [850] as const
const CANVAS_PLAYS = 1900

export function CanvasMockup({ active = true, replay, onDone, compact = false }: LoopProps & { /** The folded (phone) layout at any width, for a narrow column. */ compact?: boolean }) {
  const { t } = useTheme()
  const reduce = useReducedMotion()
  const { back, cycle } = useRewind(replay, CANVAS_BACK)
  const unseen = !reduce && !active
  useEffect(() => {
    if (!active || !onDone) return
    const id = window.setTimeout(() => onDone(), CANVAS_PLAYS)
    return () => window.clearTimeout(id)
  }, [active, cycle, onDone])
  const boardRef = useRef<HTMLDivElement>(null)
  const [fine, setFine] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)')
    setFine(mq.matches)
    const on = (e: MediaQueryListEvent) => setFine(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // One pair of motion values per node, created in a fixed order: the drag
  // offset from the node's home (left/top). Dragging writes straight into
  // them and the thread lines read them, so nothing re-renders while it moves.
  // (Offsets start at 0: non-zero starting x/y with dragConstraints get
  // double-applied by Motion's measurement.)
  const positions: Record<string, Pos> = {}
  for (const n of NODES) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    positions[n.id] = { x: useMotionValue(0), y: useMotionValue(0) }
  }

  const rearrange = useCallback(() => {
    for (const n of NODES) {
      animate(positions[n.id].x, 0, { type: 'spring', stiffness: 120, damping: 20 })
      animate(positions[n.id].y, 0, { type: 'spring', stiffness: 120, damping: 20 })
    }
    // positions are stable motion values for the component's lifetime
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Phone layout once the width is known; the wide one renders first. The
  // tour asks for the folded one by name (it describes everything on it); a
  // phone on the landing page gets the lighter one.
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setPhone(mq.matches)
    const on = (e: MediaQueryListEvent) => setPhone(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const layout = compact ? 'folded' : phone ? 'airy' : 'wide'
  const nodes = layout === 'folded' ? NODES_PHONE : layout === 'airy' ? NODES_AIRY : NODES
  const boardW = layout === 'folded' ? BOARD_W_PHONE : layout === 'airy' ? BOARD_W_AIRY : BOARD_W
  const boardH = layout === 'folded' ? BOARD_H_PHONE : layout === 'airy' ? BOARD_H_AIRY : BOARD_H
  const edges = layout === 'airy' ? EDGES_AIRY : EDGES
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
  const through: Record<string, Hue[]> = {}
  for (const [a, b] of edges) {
    const from = byId[a]
    if (from?.kind === 'hub' && byId[b]) (through[b] ??= []).push(from.hue)
  }

  return (
    <Container padding={0} style={{ overflow: 'hidden' }}>
      <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
        <p style={{ ...typeRoles.small, fontWeight: 600, color: t.textSecondary }}>{PROJECT_TITLE}</p>
        <div className="flex items-center gap-3">
          <span style={{ ...typeRoles.small, color: t.textMuted }}>{fine ? 'Drag anything' : 'Swipe across →'}</span>
          {/* Nothing can be moved by touch, so there is nothing to put back. */}
          {fine && (
            <button type="button" onClick={rearrange} className="cursor-pointer" style={{ all: 'unset', cursor: 'pointer' }}>
              <Pill hue="neutral" size="md">
                Rearrange
              </Pill>
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
        <div
          ref={boardRef}
          className="relative m-3 mt-2 md:m-4 md:mt-3"
          style={{
            width: boardW,
            height: boardH,
            borderRadius: radius.card,
            backgroundColor: t.cardBgInner,
            backgroundImage: `radial-gradient(${t.divider} 1.2px, transparent 1.2px)`,
            backgroundSize: '22px 22px',
          }}
        >
          <m.svg
            aria-hidden
            width={boardW}
            height={boardH}
            className="pointer-events-none absolute inset-0"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: unseen || back > 0 ? 0 : 1 }}
            transition={back > 0 ? { duration: 0.2 } : { duration: 0.8, delay: 0.9 }}
          >
            {edges.filter(([a, b]) => byId[a] && byId[b]).map(([a, b]) => {
              const from = byId[a]
              const thread = from.kind === 'hub'
              const color = from.kind === 'hub' ? t[from.hue] : alpha(t.textPrimary, 0.28)
              return <Edge key={`${a}-${b}`} a={positions[a]} b={positions[b]} na={from} nb={byId[b]} color={color} dashed={!thread} />
            })}
          </m.svg>
          {nodes.map((n) => (
            <BoardNodeView key={n.id} node={n} pos={positions[n.id]} order={ARRIVE.indexOf(n.id)} draggable={fine} boardRef={boardRef} threads={through[n.id] ?? []} away={unseen || (back > 0 && n.id !== 'vision')} leaving={back > 0} />
          ))}
        </div>
      </div>
    </Container>
  )
}

// ── Closing: a rule set in passing, heard, offered back and kept ───────────
// The documentary from the Writing section, talked through. The rule is the
// kind that matters: a promise made to someone in the film, which a year of
// editing could quietly break. Four beats, each one a single thing to look
// at: a line said in passing, the phrase in it picked out, the offer to keep
// it, and the rule kept. Few words on purpose: the heading beside it has
// already said what happens.

const RULE_BEFORE = 'Marta said yes to the film on one condition. '
const RULE_QUOTE = 'Her daughter is never shown or named.'
const RULE_NAME = 'Never show or name Marta’s daughter'

// Winding back: the rule is let go and its card leaves, then the marker comes
// off the phrase. The line that was said stays, and it is heard again.
const RULE_BACK = [380, 760] as const

export function RuleHeardMockup({ replay, onDone }: LoopProps) {
  const { t } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const reduce = useReducedMotion()
  // 0 said · 1 the phrase is picked out · 2 the offer · 3 "Keep it" being pressed · 4 kept
  const [stage, setStage] = useState(0)
  const [theirs, setTheirs] = useState(false)
  const { back, cycle } = useRewind(replay, RULE_BACK, () => setStage(0))
  useEffect(() => {
    if (!inView || theirs) return
    if (reduce) { setStage(4); return }
    const at: [number, number][] = [[cycle === 0 ? 900 : 350, 1], [cycle === 0 ? 1750 : 1150, 2], [cycle === 0 ? 3300 : 2600, 3], [cycle === 0 ? 3650 : 2950, 4]]
    const ids = at.map(([ms, to]) => window.setTimeout(() => setStage(to), ms))
    return () => ids.forEach((id) => window.clearTimeout(id))
  }, [inView, cycle, reduce, theirs])
  useEffect(() => {
    if (stage !== 4 || !onDone) return
    const id = window.setTimeout(() => onDone(), 500)
    return () => window.clearTimeout(id)
  }, [stage, onDone])

  const marked = stage >= 1 && back < 2
  const offered = stage >= 2 && back === 0
  const kept = stage >= 4 && back === 0
  const tone = kept ? t.verdant : t.ochre
  const decide = (to: number) => { setTheirs(true); setStage(to) }
  return (
    <div ref={ref}>
      <Container padding={16}>
        <Card padding={22}>
          <Label>Talking a project through</Label>
          <p style={{ ...typeRoles.small, fontWeight: 600, color: t.textMuted, marginTop: 16 }}>You</p>
          <p style={{ ...typeRoles.ui, fontSize: 17, lineHeight: 1.5, color: t.textPrimary, marginTop: 4 }}>
            {RULE_BEFORE}
            <Marked on={marked} color={t.ochre}>{RULE_QUOTE}</Marked>
          </p>
          <m.div
            initial={false}
            animate={{ opacity: offered ? 1 : 0, y: offered ? 0 : 14, scale: offered ? 1 : 0.97 }}
            transition={offered ? { type: 'spring', stiffness: 260, damping: 22 } : { duration: 0.28, ease: 'easeIn' }}
            aria-hidden={!offered}
            style={{
              marginTop: 18, padding: '14px 16px 16px', borderRadius: radius.widget,
              ...accentWash(tone, t.cardBgInner), transition: 'border-color 0.4s ease, background-image 0.4s ease',
              pointerEvents: offered ? 'auto' : 'none',
            }}
          >
            <p className="flex items-center gap-1.5" style={{ ...typeRoles.small, fontSize: 12, fontWeight: 600, color: tone }}>
              {kept && <Check size={13} strokeWidth={3} aria-hidden />}
              {kept ? 'Kept as a rule' : 'Something this refuses?'}
            </p>
            <p style={{ ...typeRoles.h2, fontSize: 20, lineHeight: 1.2, color: t.textPrimary, marginTop: 6 }}>{RULE_NAME}</p>
            <div className="flex flex-wrap items-center gap-2" style={{ marginTop: 12, minHeight: 34 }}>
              {kept ? (
                <p style={{ ...typeRoles.small, color: t.textSecondary }}>It will ask before new work breaks it.</p>
              ) : (
                <>
                  <m.button
                    type="button"
                    onClick={() => decide(4)}
                    animate={{ scale: stage === 3 ? 0.93 : 1 }}
                    transition={{ duration: 0.18 }}
                    whileTap={{ scale: 0.95 }}
                    className="cursor-pointer"
                    style={{ ...typeRoles.small, fontSize: 12.5, fontWeight: 600, padding: '8px 15px', borderRadius: 999, border: 'none', backgroundColor: stage === 3 ? t.verdant : t.inverseBg, color: stage === 3 ? '#ffffff' : t.inverseText, transition: 'background-color 0.2s ease' }}
                  >
                    Keep it as a rule
                  </m.button>
                  <button type="button" onClick={() => decide(1)} className="cursor-pointer" style={{ ...typeRoles.small, fontSize: 12.5, fontWeight: 600, padding: '8px 13px', borderRadius: 999, border: 'none', background: 'none', color: t.textSecondary }}>
                    Not a rule
                  </button>
                </>
              )}
            </div>
          </m.div>
        </Card>
      </Container>
    </div>
  )
}
