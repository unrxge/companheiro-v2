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
import { useTheme } from '@/components/theme/theme-provider'
import { Container, Card } from '@/components/shell/page-shell'
import { Pill } from '@/components/ui/pill'
import { StageRibbon } from '@/components/widgets'
import { alpha, radius, type as typeRoles, type Hue, type JourneyStep } from '@/lib/design-tokens'

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

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { t } = useTheme()
  return <p style={{ ...typeRoles.small, fontWeight: 600, color: t.textMuted, ...style }}>{children}</p>
}

// ── Hero: everything in one place, the vision in your own words ─────────────
// Four things made at different times settle side by side in one project, and
// the person writes what they add up to. Nothing here shows Companheiro
// finding the link for them: the line under "Vision" types as theirs.

const FRAGMENTS: { kind: string; text: string; tilt: number }[] = [
  { kind: 'Draft', text: 'My mother kept the good plates for guests who never came.', tilt: -2.2 },
  { kind: 'Lyric', text: 'Every house I’ve lived in had a room I never used.', tilt: 1.6 },
  { kind: 'Voice memo, 0:42', text: 'something about waiting until I’m ready', tilt: -1.2 },
  { kind: 'Photo idea', text: 'Empty café chairs, just before opening.', tilt: 2 },
]

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
    <Container padding={16} style={{ width: '100%' }}>
      <Card padding={20}>
        <Label>Things you&rsquo;ve already made</Label>
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {FRAGMENTS.map((f, i) => (
            <m.div
              key={f.kind}
              initial={reduce ? false : { opacity: 0, y: 12, rotate: f.tilt * 2 }}
              animate={away ? { opacity: 0, y: 12, rotate: f.tilt * 2 } : { opacity: 1, y: 0, rotate: settled ? 0 : f.tilt }}
              transition={
                back === 2 ? { type: 'spring', stiffness: 300, damping: 9, delay: (FRAGMENTS.length - 1 - i) * 0.06 }
                : { duration: 0.7, delay: stage === 0 ? 0.25 + i * 0.15 : i * 0.06, ease: EASE }
              }
            >
              <Card inner padding={12} style={{ height: '100%' }}>
                <p style={{ ...typeRoles.small, fontSize: 11, fontWeight: 600, color: t.textMuted }}>{f.kind}</p>
                <p style={{ ...typeRoles.small, fontSize: 14, color: t.textPrimary, marginTop: 4 }}>{f.text}</p>
              </Card>
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
          {/* The one dark thing on the paper, so the eye lands where the four fragments were heading. */}
          <div style={{ padding: 18, borderRadius: radius.widget, backgroundColor: t.inverseBg, boxShadow: `0 14px 30px -14px ${alpha(t.ember, 0.6)}, 0 2px 0 ${t.ember} inset` }}>
            <div className="flex items-center justify-between gap-3">
              <span style={{ ...typeRoles.small, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '4px 10px', borderRadius: 999, backgroundColor: t.ember, color: '#ffffff' }}>Vision</span>
              <span style={{ ...typeRoles.small, fontSize: 11, color: alpha(t.inverseText, 0.6) }}>In your words</span>
            </div>
            <p style={{ ...typeRoles.h2, fontSize: 21, color: t.inverseText, marginTop: 12 }}>{VISION_TITLE}</p>
            <p aria-label={VISION_LINE} style={{ ...typeRoles.small, fontSize: 14, color: alpha(t.inverseText, 0.82), marginTop: 5, minHeight: '2.9em' }}>
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
            style={{ ...typeRoles.small, fontWeight: 600, color: t.textSecondary, textDecoration: 'underline', textUnderlineOffset: 3 }}
            className="cursor-pointer rounded-full px-2 py-1"
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
  | { kind: 'recording'; title: string; length: string }
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
  { id: 'hands', kind: 'hub', x: 312, y: 110, w: 152, h: 40, label: 'hands at work', hue: 'ochre' },
  { id: 'reveal', kind: 'hub', x: 312, y: 286, w: 156, h: 40, label: 'the slow reveal', hue: 'tide' },
  { id: 'treatment', kind: 'piece', x: 512, y: 24, w: 210, h: 104, title: 'Treatment', medium: 'For the client', step: 'test' },
  { id: 'shots', kind: 'piece', x: 512, y: 180, w: 210, h: 104, title: 'Shot list', medium: 'Film', step: 'write' },
  { id: 'stills', kind: 'piece', x: 846, y: 40, w: 210, h: 104, title: 'Stills for the site', medium: 'Photo series', step: 'concept' },
  { id: 'note', kind: 'recording', x: 512, y: 340, w: 232, h: 104, title: 'Voice note after the recce', length: '1:12' },
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
  return <m.path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeDasharray={dashed ? '3 5' : undefined} />
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
      <p style={{ ...typeRoles.small, fontSize: compact ? 12 : 13, fontWeight: 600, color: t.textPrimary }}>{node.title}</p>
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

function NodeBody({ node }: { node: BoardNode }) {
  const { t } = useTheme()
  if (node.kind === 'vision') {
    const tight = node.w < 240
    return (
      <Card padding={tight ? 14 : 18} style={{ height: '100%', borderLeft: `3px solid ${t.ember}` }}>
        <Pill hue="ember">Vision</Pill>
        <p style={{ ...typeRoles.h2, fontSize: tight ? 18 : 20, color: t.textPrimary, marginTop: 10 }}>{PROJECT_TITLE}</p>
        <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 6 }}>{PROJECT_LINE}</p>
        <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, marginTop: 10 }}>{PROJECT_RULES}</p>
      </Card>
    )
  }
  if (node.kind === 'hub') {
    return (
      <div
        className="flex h-full items-center gap-2 rounded-full px-4"
        style={{ backgroundColor: t.cardBg, boxShadow: t.shadow, border: `1.5px solid ${alpha(t[node.hue], 0.55)}` }}
      >
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: t[node.hue] }} />
        <span style={{ ...typeRoles.small, fontWeight: 600, color: t.textPrimary, whiteSpace: 'nowrap' }}>{node.label}</span>
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
      <p style={{ ...typeRoles.small, fontSize: 11, fontWeight: 600, color: t.textMuted }}>{node.medium}</p>
      <p style={{ ...typeRoles.h3, color: t.textPrimary, marginTop: 3 }}>{node.title}</p>
      <div style={{ marginTop: 12 }}>
        <StageRibbon step={node.step} compact />
      </div>
    </Card>
  )
}

function BoardNodeView({ node, pos, order, draggable, boardRef, away, leaving }: { node: BoardNode; pos: Pos; order: number; draggable: boolean; boardRef: React.RefObject<HTMLDivElement | null>; /** Not on the canvas (yet, or for the moment). */ away: boolean; /** The canvas is winding back: what leaves does so last to arrive first. */ leaving: boolean }) {
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
      <NodeBody node={node} />
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

export function CanvasMockup({ active = true, replay, onDone }: LoopProps) {
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

  // Phone layout once the width is known; the wide one renders first.
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    setPhone(mq.matches)
    const on = (e: MediaQueryListEvent) => setPhone(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  const nodes = phone ? NODES_PHONE : NODES
  const boardW = phone ? BOARD_W_PHONE : BOARD_W
  const boardH = phone ? BOARD_H_PHONE : BOARD_H
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))

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
            {EDGES.filter(([a, b]) => byId[a] && byId[b]).map(([a, b]) => {
              const from = byId[a]
              const thread = from.kind === 'hub'
              const color = from.kind === 'hub' ? alpha(t[from.hue], 0.7) : alpha(t.textPrimary, 0.28)
              return <Edge key={`${a}-${b}`} a={positions[a]} b={positions[b]} na={from} nb={byId[b]} color={color} dashed={!thread} />
            })}
          </m.svg>
          {nodes.map((n) => (
            <BoardNodeView key={n.id} node={n} pos={positions[n.id]} order={ARRIVE.indexOf(n.id)} draggable={fine} boardRef={boardRef} away={unseen || (back > 0 && n.id !== 'vision')} leaving={back > 0} />
          ))}
        </div>
      </div>
    </Container>
  )
}

// ── Closing: a rule set in passing, heard and offered back ─────────────────
// The same project as the canvas above, talked through as a director would:
// the client asks for something the work refuses, and saying so once is enough.

const RULE_TALK = 'Ana wants a voiceover explaining the process. I don’t want anyone talking over the hands. The sound of the wheel is the script.'
const RULE_QUOTE = 'I don’t want anyone talking over the hands.'

// Winding back only as far as what was said: the offer goes, then the reply,
// and the reply is given again.
const RULE_BACK = [700] as const

export function RuleHeardMockup({ replay, onDone }: LoopProps) {
  const { t } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const reduce = useReducedMotion()
  const { back, cycle } = useRewind(replay, RULE_BACK)
  useEffect(() => {
    if (!inView || !onDone) return
    const id = window.setTimeout(() => onDone(), 2300)
    return () => window.clearTimeout(id)
  }, [inView, cycle, onDone])
  const shownAt = reduce || (inView && back === 0)
  return (
    <div ref={ref}>
      <Container padding={16}>
        <Card padding={22}>
          <Label>Talking the vision through · {PROJECT_TITLE}</Label>
          <p style={{ ...typeRoles.small, fontWeight: 600, color: t.textMuted, marginTop: 16 }}>You</p>
          <p style={{ ...typeRoles.ui, color: t.textSecondary, marginTop: 4 }}>{RULE_TALK}</p>
          <m.div initial={false} animate={{ opacity: shownAt ? 1 : 0, y: shownAt ? 0 : 8 }} transition={back > 0 ? { duration: 0.3, delay: 0.3, ease: 'easeIn' } : { duration: 0.6, delay: reduce ? 0 : 0.5, ease: EASE }}>
            <p style={{ ...typeRoles.small, fontWeight: 600, color: t.violet, marginTop: 14 }}>Companheiro</p>
            <p style={{ ...typeRoles.ui, color: t.textPrimary, marginTop: 4 }}>
              Then the film has to make the process clear without a word. Which shot carries the part she is afraid people will miss?
            </p>
          </m.div>
          <m.div
            initial={false}
            animate={{ opacity: shownAt ? 1 : 0, y: shownAt ? 0 : 10 }}
            transition={back > 0 ? { duration: 0.3, ease: 'backIn' } : { duration: 0.7, delay: reduce ? 0 : 1.6, ease: EASE }}
            style={{
              marginTop: 18, padding: '12px 14px', borderRadius: radius.widget,
              background: alpha(t.ochre, 0.08), border: `1px solid ${alpha(t.ochre, 0.28)}`,
            }}
          >
            <p style={{ ...typeRoles.small, fontSize: 12, fontWeight: 600, color: t.ochre }}>Something this refuses?</p>
            <p style={{ ...typeRoles.ui, color: t.textPrimary, marginTop: 6 }}>No voiceover</p>
            <p style={{ ...typeRoles.small, fontStyle: 'italic', color: t.textMuted, marginTop: 4 }}>You said: &ldquo;{RULE_QUOTE}&rdquo;</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill hue="neutral" size="md">Keep it as a rule</Pill>
              <Pill hue="neutral" size="md">Not a rule</Pill>
            </div>
          </m.div>
        </Card>
      </Container>
    </div>
  )
}
