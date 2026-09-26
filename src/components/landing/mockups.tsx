'use client'

// Landing-page visuals. Every one is built from the app's real components
// (Container, Card, Pill, MicButton, SignalCards, PhaseDots, Thread,
// StageRibbon) or drawn in their exact design language, fed with sample
// data. One example runs through the whole page: a person whose scattered
// fragments turn out to be one vision, "The Good Plates". Nothing here reads
// the database.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AnimatePresence,
  animate,
  motion as m,
  useInView,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { Container, Card, Divider } from '@/components/shell/page-shell'
import { MicButton } from '@/components/ui/mic-button'
import { Pill } from '@/components/ui/pill'
import { Thread, type ThreadMessage } from '@/components/conversation/thread'
import { PhaseDots, SignalCards, StageRibbon } from '@/components/widgets'
import { alpha, radius, type as typeRoles, type Hue, type JourneyStep, type MeaningKey } from '@/lib/design-tokens'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

const VISION_TITLE = 'The Good Plates'
const VISION_LINE = 'A body of work about what we save for later, and the choice to use it now.'

/** Reveals `text` a character at a time once `start` is true. Instant under reduced motion. */
function useTypewriter(text: string, start: boolean, msPerChar = 26) {
  const reduce = useReducedMotion()
  const [n, setN] = useState(0)
  useEffect(() => {
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
  }, [text, start, msPerChar, reduce])
  return { shown: text.slice(0, n), done: n >= text.length }
}

function Label({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  const { t } = useTheme()
  return <p style={{ ...typeRoles.small, fontWeight: 600, color: t.textMuted, ...style }}>{children}</p>
}

/** The vision block as it sits on a project: ember edge, title, one line. */
function VisionCard({ compact = false }: { compact?: boolean }) {
  const { t } = useTheme()
  return (
    <Card inner padding={compact ? 14 : 16} style={{ borderLeft: `3px solid ${t.ember}`, borderRadius: radius.widget }}>
      <Pill hue="ember">Vision</Pill>
      <p style={{ ...typeRoles.h3, fontSize: compact ? 15 : 17, color: t.textPrimary, marginTop: 10 }}>{VISION_TITLE}</p>
      <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 4 }}>{VISION_LINE}</p>
    </Card>
  )
}

// ── Hero: finding the vision in what you already made ────────────────────────

const FRAGMENTS: { kind: string; before: string; mark: string; after: string; tilt: number }[] = [
  { kind: 'Draft', before: 'My mother kept the good plates ', mark: 'for guests who never came.', after: '', tilt: -2.2 },
  { kind: 'Lyric', before: 'Every house I’ve lived in had ', mark: 'a room I never used', after: '.', tilt: 1.6 },
  { kind: 'Voice memo, 0:42', before: 'something about ', mark: 'waiting until I’m ready', after: '', tilt: -1.2 },
  { kind: 'Photo idea', before: 'Empty café chairs, ', mark: 'just before opening', after: '.', tilt: 2 },
]

export function VisionFinder() {
  const { t } = useTheme()
  const reduce = useReducedMotion()
  const [stage, setStage] = useState(0) // 0 scattered, 1 threads marked, 2 vision found
  const [run, setRun] = useState(0)

  useEffect(() => {
    if (reduce) {
      setStage(2)
      return
    }
    setStage(0)
    const a = window.setTimeout(() => setStage(1), 1700)
    const b = window.setTimeout(() => setStage(2), 3300)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [reduce, run])

  return (
    <Container padding={16} style={{ width: '100%' }}>
      <Card padding={20}>
        <Label>Things you&rsquo;ve already made</Label>
        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {FRAGMENTS.map((f, i) => (
            <m.div
              key={`${run}-${f.kind}`}
              initial={reduce ? false : { opacity: 0, y: 12, rotate: f.tilt * 2 }}
              animate={{ opacity: 1, y: 0, rotate: stage >= 1 ? 0 : f.tilt }}
              transition={{ duration: 0.7, delay: stage === 0 ? 0.25 + i * 0.15 : i * 0.06, ease: EASE }}
            >
              <Card inner padding={12} style={{ height: '100%' }}>
                <p style={{ ...typeRoles.small, fontSize: 11, fontWeight: 600, color: t.textMuted }}>{f.kind}</p>
                <p style={{ ...typeRoles.small, fontSize: 14, color: t.textPrimary, marginTop: 4 }}>
                  {f.before}
                  <span
                    style={{
                      backgroundColor: stage >= 1 ? t.soft.ember : 'transparent',
                      boxShadow: stage >= 1 ? `inset 0 -2px 0 ${t.ember}` : 'none',
                      borderRadius: 3,
                      transition: `background-color 0.6s ease ${i * 0.12}s, box-shadow 0.6s ease ${i * 0.12}s`,
                    }}
                  >
                    {f.mark}
                  </span>
                  {f.after}
                </p>
              </Card>
            </m.div>
          ))}
        </div>

        <m.div
          initial={false}
          animate={{ opacity: stage >= 2 ? 1 : 0, y: stage >= 2 ? 0 : 10 }}
          transition={{ duration: 0.7, ease: EASE }}
          style={{ marginTop: 14 }}
          aria-hidden={stage < 2}
        >
          <VisionCard />
        </m.div>
      </Card>
      <div className="flex items-center justify-between gap-3 px-2 pb-1 pt-3.5">
        <p style={{ ...typeRoles.small, color: t.textSecondary }}>Four separate ideas. One vision.</p>
        {!reduce && (
          <button
            type="button"
            onClick={() => setRun((r) => r + 1)}
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

// ── Movements: find it, hold it, talk to it ──────────────────────────────────

const PHASES = ['First Contact', 'Expansion', 'The Audience', 'The Principle', 'Declaration']

function FindVisual() {
  const { t } = useTheme()
  return (
    <Container padding={16}>
      <Card padding={22}>
        <PhaseDots phase={4} labels={PHASES} />
        <p style={{ ...typeRoles.ui, color: t.textSecondary, marginTop: 20 }}>
          If someone saw all four of these together, what would you want them to notice?
        </p>
        <p style={{ ...typeRoles.ui, fontWeight: 500, color: t.textPrimary, marginTop: 12, textAlign: 'right' }}>
          That we keep waiting for permission to use the good things.
        </p>
        <div style={{ marginTop: 20 }}>
          <VisionCard />
        </div>
      </Card>
    </Container>
  )
}

function HoldVisual() {
  const { t } = useTheme()
  const row = (label: string, items: string[], hue: MeaningKey) => (
    <div className="flex flex-wrap items-center gap-2">
      <span style={{ ...typeRoles.small, fontWeight: 600, color: t.textMuted, minWidth: 64 }}>{label}</span>
      {items.map((i) => (
        <Pill key={i} hue={hue}>
          {i}
        </Pill>
      ))}
    </div>
  )
  return (
    <Container padding={16}>
      <Card padding={22}>
        <VisionCard compact />
        <div className="mt-4 flex flex-col gap-2.5">
          {row('Keeps', ['ordinary objects', 'the waiting, not the loss'], 'verdant')}
          {row('Refuses', ['nostalgia', 'a neat ending'], 'danger')}
        </div>
        <Divider style={{ margin: '18px 0' }} />
        <Label>New piece: Sunday at the Coast</Label>
        <p style={{ ...typeRoles.ui, color: t.textPrimary, marginTop: 6 }}>
          This one looks back fondly. Your vision says no nostalgia. Change the piece, or change the vision?
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Pill hue="neutral" size="md">
            Change the piece
          </Pill>
          <Pill hue="neutral" size="md">
            Change the vision
          </Pill>
        </div>
      </Card>
    </Container>
  )
}

const TALK_WORDS =
  'Walked past the café again. The chairs were stacked, waiting. I think it’s the same thing as the plates.'

function TalkVisual() {
  const { t } = useTheme()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const { shown, done } = useTypewriter(TALK_WORDS, inView)
  return (
    <div ref={ref}>
      <Container padding={16}>
        <Card padding={22}>
          <div className="flex items-center justify-between gap-4">
            <Label>Thursday, 08:12</Label>
            <MicButton recording={inView && !done} onToggle={() => {}} size={40} />
          </div>
          <p aria-label={TALK_WORDS} style={{ ...typeRoles.quote, color: t.textPrimary, marginTop: 16, minHeight: '4.4em' }}>
            <span aria-hidden>{shown}</span>
          </p>
          <m.div initial={false} animate={{ opacity: done ? 1 : 0, y: done ? 0 : 8 }} transition={{ duration: 0.6, ease: EASE }} style={{ marginTop: 16 }}>
            <SignalCards signals={{ energy: 'medium', inner_weather: 'clear, a bit tender', arc_texture: 'Expansion' }} />
          </m.div>
        </Card>
        <m.p
          initial={false}
          animate={{ opacity: done ? 1 : 0 }}
          transition={{ duration: 0.7, delay: 0.8, ease: EASE }}
          style={{ ...typeRoles.ui, color: t.textSecondary, padding: '16px 8px 4px' }}
        >
          That&rsquo;s the fourth thing this month about waiting. Want to add it to {VISION_TITLE}?
        </m.p>
      </Container>
    </div>
  )
}

export const MOVEMENT_VISUALS = [FindVisual, HoldVisual, TalkVisual]

/** Swaps between the movement visuals with a soft cross-fade. */
export function MovementStage({ active }: { active: number }) {
  const reduce = useReducedMotion()
  const Visual = MOVEMENT_VISUALS[active]
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={active}
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, y: -10 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <Visual />
      </m.div>
    </AnimatePresence>
  )
}

// ── The canvas: the whole vision laid out, threads between pieces ────────────

type BoardNode =
  | { id: string; kind: 'vision'; x: number; y: number; w: number; h: number }
  | { id: string; kind: 'hub'; x: number; y: number; w: number; h: number; label: string; hue: Hue }
  | { id: string; kind: 'piece'; x: number; y: number; w: number; h: number; title: string; medium: string; step: JourneyStep }

const BOARD_W = 1080
const BOARD_H = 560
const NODES: BoardNode[] = [
  { id: 'vision', kind: 'vision', x: 28, y: 170, w: 270, h: 210 },
  { id: 'waiting', kind: 'hub', x: 350, y: 120, w: 170, h: 40, label: 'the waiting', hue: 'ochre' },
  { id: 'objects', kind: 'hub', x: 350, y: 410, w: 200, h: 40, label: 'objects that outlive us', hue: 'tide' },
  { id: 'plates', kind: 'piece', x: 600, y: 36, w: 214, h: 104, title: 'My Mother’s Plates', medium: 'Essay', step: 'write' },
  { id: 'room', kind: 'piece', x: 842, y: 150, w: 214, h: 104, title: 'The Room I Never Used', medium: 'Song', step: 'test' },
  { id: 'ready', kind: 'piece', x: 600, y: 262, w: 214, h: 104, title: 'Ready', medium: 'Short film', step: 'concept' },
  { id: 'chairs', kind: 'piece', x: 842, y: 408, w: 214, h: 104, title: 'Before Opening', medium: 'Photo series', step: 'shape' },
]
const EDGES: [string, string][] = [
  ['waiting', 'plates'],
  ['waiting', 'room'],
  ['waiting', 'ready'],
  ['objects', 'plates'],
  ['objects', 'chairs'],
]

type Pos = { x: MotionValue<number>; y: MotionValue<number> }

function Edge({ a, b, na, nb, color }: { a: Pos; b: Pos; na: BoardNode; nb: BoardNode; color: string }) {
  const d = useTransform([a.x, a.y, b.x, b.y], ([ax, ay, bx, by]: number[]) => {
    const x1 = na.x + ax + na.w / 2
    const y1 = na.y + ay + na.h / 2
    const x2 = nb.x + bx + nb.w / 2
    const y2 = nb.y + by + nb.h / 2
    const mx = (x1 + x2) / 2
    return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
  })
  return <m.path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
}

function NodeBody({ node }: { node: BoardNode }) {
  const { t } = useTheme()
  if (node.kind === 'vision') {
    return (
      <Card padding={18} style={{ height: '100%', borderLeft: `3px solid ${t.ember}` }}>
        <Pill hue="ember">Vision</Pill>
        <p style={{ ...typeRoles.h2, fontSize: 20, color: t.textPrimary, marginTop: 10 }}>{VISION_TITLE}</p>
        <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 6 }}>{VISION_LINE}</p>
        <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, marginTop: 10 }}>Refuses: nostalgia, a neat ending</p>
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

function BoardNodeView({ node, pos, draggable, boardRef }: { node: BoardNode; pos: Pos; draggable: boolean; boardRef: React.RefObject<HTMLDivElement | null> }) {
  return (
    <m.div
      drag={draggable}
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={boardRef}
      whileDrag={{ scale: 1.03, zIndex: 2 }}
      style={{ x: pos.x, y: pos.y, width: node.w, height: node.h, position: 'absolute', left: node.x, top: node.y, touchAction: draggable ? 'none' : 'auto' }}
      className={draggable ? 'cursor-grab active:cursor-grabbing' : undefined}
    >
      <NodeBody node={node} />
    </m.div>
  )
}

export function CanvasMockup() {
  const { t } = useTheme()
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

  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]))

  return (
    <Container padding={0} style={{ overflow: 'hidden' }}>
      <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-4">
        <p style={{ ...typeRoles.small, fontWeight: 600, color: t.textSecondary }}>{VISION_TITLE}</p>
        <div className="flex items-center gap-3">
          <span style={{ ...typeRoles.small, color: t.textMuted }}>{fine ? 'Drag anything' : 'Swipe across'}</span>
          <button type="button" onClick={rearrange} className="cursor-pointer" style={{ all: 'unset', cursor: 'pointer' }}>
            <Pill hue="neutral" size="md">
              Rearrange
            </Pill>
          </button>
        </div>
      </div>
      <div className="overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
        <div
          ref={boardRef}
          className="relative m-4 mt-3"
          style={{
            width: BOARD_W,
            height: BOARD_H,
            borderRadius: radius.card,
            backgroundColor: t.cardBgInner,
            backgroundImage: `radial-gradient(${t.divider} 1.2px, transparent 1.2px)`,
            backgroundSize: '22px 22px',
          }}
        >
          <svg aria-hidden width={BOARD_W} height={BOARD_H} className="pointer-events-none absolute inset-0">
            {EDGES.map(([a, b]) => {
              const hub = byId[a]
              const color = hub.kind === 'hub' ? alpha(t[hub.hue], 0.7) : t.divider
              return <Edge key={`${a}-${b}`} a={positions[a]} b={positions[b]} na={hub} nb={byId[b]} color={color} />
            })}
          </svg>
          {NODES.map((n) => (
            <BoardNodeView key={n.id} node={n} pos={positions[n.id]} draggable={fine} boardRef={boardRef} />
          ))}
        </div>
      </div>
    </Container>
  )
}

// ── Being heard: the real conversation surface, replying as you watch ────────

const USER_MSG =
  'I have too many ideas and none of them go together. A song, some photos of empty chairs, an essay about my mother’s plates. I think I just can’t commit to anything.'
const REPLY =
  'I don’t think they’re separate. Each one is about something kept for a day that never comes. That might not be a failure to commit. It might be your vision. Does that sound right?'

export function HeardMockup() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const reduce = useReducedMotion()
  const [started, setStarted] = useState(false)
  useEffect(() => {
    if (!inView) return
    const id = window.setTimeout(() => setStarted(true), reduce ? 0 : 900)
    return () => window.clearTimeout(id)
  }, [inView, reduce])
  const { shown, done } = useTypewriter(REPLY, started, 22)

  const messages: ThreadMessage[] = [{ role: 'user', content: USER_MSG }]
  if (started) messages.push({ role: 'assistant', content: shown })

  return (
    <div ref={ref}>
      <Container padding={28}>
        <div style={{ minHeight: 200 }}>{inView || reduce ? <Thread messages={messages} streaming={!done} /> : null}</div>
      </Container>
    </div>
  )
}

// ── Closing: where you left off ──────────────────────────────────────────────

export function LeftOffMockup() {
  const { t } = useTheme()
  const pieces: { title: string; medium: string; step: JourneyStep }[] = [
    { title: 'My Mother’s Plates', medium: 'Essay', step: 'write' },
    { title: 'The Room I Never Used', medium: 'Song', step: 'test' },
    { title: 'Before Opening', medium: 'Photo series', step: 'shape' },
  ]
  return (
    <Container padding={16}>
      <Card padding={22}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p style={{ ...typeRoles.h2, fontSize: 22, color: t.textPrimary }}>{VISION_TITLE}</p>
            <p style={{ ...typeRoles.small, color: t.textMuted, marginTop: 4 }}>{VISION_LINE}</p>
          </div>
          <Pill hue="verdant" dot>
            Active
          </Pill>
        </div>
        <div className="mt-5 flex flex-col gap-3">
          {pieces.map((p) => (
            <div key={p.title} className="grid grid-cols-[1fr_120px] items-center gap-4">
              <div className="min-w-0">
                <p style={{ ...typeRoles.h3, fontSize: 14, color: t.textPrimary }}>{p.title}</p>
                <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted }}>{p.medium}</p>
              </div>
              <StageRibbon step={p.step} compact />
            </div>
          ))}
        </div>
        <Card inner padding={16} style={{ marginTop: 18 }}>
          <Label>Last thing you said, 12 days ago</Label>
          <p style={{ ...typeRoles.quote, fontSize: 17, color: t.textPrimary, marginTop: 8 }}>&ldquo;The plates were never for the guests.&rdquo;</p>
        </Card>
      </Card>
      <Card padding={16} style={{ marginTop: 12 }}>
        <div className="flex items-center justify-between gap-3">
          <p style={{ ...typeRoles.h3, color: t.textPrimary }}>Night Shift Songs</p>
          <Pill hue="ochre">Resting</Pill>
        </div>
      </Card>
    </Container>
  )
}
