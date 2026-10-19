'use client'

// ── the walk round an example ───────────────────────────────────────────────
//
// Plays the steps of lib/examples/tour-script.ts over an example's canvas, the
// first time someone opens one. It moves on by itself, unhurried, once a step
// has played and been given time to be read; Next (or the message box) moves
// on sooner, Back goes back, and the pause button holds a step still. A stray
// tap anywhere else does nothing, so an accidental one never skips a step.
//
// The eye is led, not told where to look: a lit window in a darkened screen
// travels from one thing to the next while the canvas glides under it, and the
// words arrive once the travelling has stopped. The caption keeps to whichever
// side the lit thing is not on — beside it on a computer, a sheet above or below
// it on a phone, where most people will first meet this.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Portal } from '@/components/ui/portal'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, fonts, radius, shell } from '@/lib/design-tokens'
import type { BoardTourHandle } from '@/components/studio/work/board'
import { readingTime, type TourPanel, type TourStep } from '@/lib/examples/tour-script'

/** Travel between steps: the canvas glide, and the lit window following it. Unhurried, so the eye can follow. */
const GLIDE_MS = 1400
/** Travel to something on the page itself (not the canvas). */
const ANCHOR_MS = 760
/** The vision room opens and closes with its own animation; the tour waits it out. */
const ROOM_MS = 1400
/** The headline arrives a word at a time, this far apart; the lines follow it. */
const WORD_MS = 80
const LINE_MS = 240
/** How the caption sits on a computer. */
const CARD_W = 360
const CARD_GAP = 28
/** A phone's caption is a sheet about this tall: kept small, the canvas is what is being shown. */
const SHEET_H = 168
/** The "+" menu hangs this far under its card, in board units, and is framed with it. */
const MENU_BELOW = 330
/** Around whatever is lit. */
const PAD = 14

export type RoomMove = 'open' | 'page' | 'talk' | 'close'

type Rect = { x: number; y: number; w: number; h: number }

function unionOf(els: Element[]): Rect | null {
  const boxes = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
  if (!boxes.length) return null
  const x0 = Math.min(...boxes.map((r) => r.left))
  const y0 = Math.min(...boxes.map((r) => r.top))
  const x1 = Math.max(...boxes.map((r) => r.right))
  const y1 = Math.max(...boxes.map((r) => r.bottom))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/** The canvas ids a step frames: on a narrow screen, its shorter list when it has one. */
function idsFor(step: TourStep, narrow: boolean): string[] | 'all' | null {
  if (!('ids' in step.show)) return null
  return narrow && step.narrow ? step.narrow : step.show.ids
}

/** What a step points at, where it is on the window right now. */
function rectFor(step: TourStep, narrow: boolean): Rect | null {
  if ('anchor' in step.show) {
    const anchors: string[] = Array.isArray(step.show.anchor) ? [...step.show.anchor] : [step.show.anchor]
    // The "+" menu, once open, is part of what that step is showing.
    if (step.plus) anchors.push('plus-menu')
    return unionOf(anchors.flatMap((a) => Array.from(document.querySelectorAll(`[data-tour="${a}"]`))))
  }
  const ids = idsFor(step, narrow)
  const els = ids === 'all'
    ? Array.from(document.querySelectorAll('[data-lit]'))
    : (ids ?? []).flatMap((id) => Array.from(document.querySelectorAll(`[data-lit="${CSS.escape(id)}"]`)))
  // The "+" menu, once open, is part of what that step is showing.
  if (step.plus) els.push(...Array.from(document.querySelectorAll('[data-tour="plus-menu"]')))
  return unionOf(els)
}

/** Where a step's gesture is shown being done: the "+" it opens, or the first thing it points at. */
function gestureAt(step: TourStep): Rect | null {
  if (step.plus) {
    const plus = document.querySelector('[data-tour="add-button"]')
    return plus ? unionOf([plus]) : null
  }
  if (!('ids' in step.show) || step.show.ids === 'all') return null
  const el = document.querySelector(`[data-lit="${CSS.escape(step.show.ids[0])}"]`)
  return el ? unionOf([el]) : null
}

/** Whether the vision room is open once the steps up to `j` have played. */
function roomOpenAt(steps: TourStep[], j: number): boolean {
  let open = false
  for (let k = 0; k <= j; k++) {
    if (steps[k].room === 'open') open = true
    if (steps[k].room === 'close') open = false
  }
  return open
}
/** Which half of the room is shown at `j` (null: as it opens). */
function roomHalfAt(steps: TourStep[], j: number): 'page' | 'talk' | null {
  let half: 'page' | 'talk' | null = null
  for (let k = 0; k <= j; k++) {
    const r = steps[k].room
    if (r === 'open' || r === 'close') half = null
    if (r === 'page' || r === 'talk') half = r
  }
  return half
}
/** The writing page's panel at `j`, and how it reads: the last a step set. */
function panelAt(steps: TourStep[], j: number): TourPanel | null {
  for (let k = j; k >= 0; k--) if (steps[k].panel !== undefined) return steps[k].panel ?? null
  return null
}
function viewAt(steps: TourStep[], j: number): 'write' | 'flow' | null {
  for (let k = j; k >= 0; k--) if (steps[k].view) return steps[k].view ?? null
  return null
}

/** Once a step is readable it stands this much longer than a calm read of its words, then the walk moves on. */
function dwellMs(step: TourStep): number {
  return Math.round(readingTime(step.headline, step.lines) * 1.15) + 1200
}

/** How long a step takes to arrive in words: the headline word by word, then each line. */
function revealMs(step: TourStep): number {
  return step.headline.split(' ').length * WORD_MS + 700 + step.lines.length * LINE_MS
}

export function ExampleTour({
  steps, board, phone, onRoom, onPanel, onView, onStep, onDone, startAt = 0, label = 'A short walk round this example',
}: {
  steps: TourStep[]
  /** Each step as it begins: lets a page set out what the step talks about (the check-in's example conversation). */
  onStep?: (step: TourStep) => void
  /** What a screen reader hears the walk called. */
  label?: string
  /** Where to begin (the preview only, for looking at one step). */
  startAt?: number
  /** The canvas, on the canvas's walk; absent on the writing page's. */
  board?: React.MutableRefObject<BoardTourHandle | null>
  /** The writing page's panels, opened and closed as the walk reaches them. */
  onPanel?: (panel: TourPanel | null) => void
  /** The writing page's two ways of reading. */
  onView?: (view: 'write' | 'flow') => void
  /** On a phone (or a window as narrow): the caption is a sheet, and holds are shown, not rests. */
  phone: boolean
  /** The vision room, as the tour reaches it: opened out of the button, a half shown, closed again. */
  onRoom?: (move: RoomMove, from: { x: number; y: number } | null) => void
  /** Played to the end. */
  onDone: () => void
}) {
  const { t } = useTheme()
  const reduce = useReducedMotion() ?? false
  const [index, setIndex] = useState(Math.max(0, Math.min(steps.length - 1, startAt)))
  const [phase, setPhase] = useState<'travelling' | 'reading'>('travelling')
  const [pressing, setPressing] = useState(false)
  const [leaving, setLeaving] = useState(false)
  /** Which way the last move went: the words slide in from that side. */
  const [dir, setDir] = useState<'on' | 'back'>('on')
  /** The step has played and been on screen long enough to be read: Next works from here. */
  const [ready, setReady] = useState(false)
  const prevIndex = useRef<number | null>(null)
  /** Held still by the person (the pause button, or resting on the message box). */
  const [paused, setPaused] = useState(false)
  const [resting, setResting] = useState(false)
  /** Counts each resume, so the bar under Next starts again from empty with the wait. */
  const [lap, setLap] = useState(0)
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    const on = () => setHidden(document.hidden)
    on()
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  }, [])
  const step = steps[index]
  const last = index === steps.length - 1

  // A narrow window on a computer gets the sheet too: there is no room beside.
  const [narrow, setNarrow] = useState(phone)
  useEffect(() => {
    const check = () => setNarrow(phone || window.innerWidth < 720)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [phone])

  // ── moving on ─────────────────────────────────────────────────────────────
  const finish = useCallback(() => {
    board?.current?.light(null)
    setLeaving(true)
    window.setTimeout(onDone, reduce ? 0 : 420)
  }, [board, onDone, reduce])

  const advance = useCallback(() => {
    if (leaving) return
    if (last) { finish(); return }
    setDir('on')
    // Into the room: the button is seen being pressed before it opens.
    if (steps[index + 1]?.room === 'open') {
      setPressing(true)
      window.setTimeout(() => { setPressing(false); setIndex((i) => i + 1) }, reduce ? 0 : 340)
      return
    }
    setIndex((i) => i + 1)
  }, [finish, index, last, leaving, reduce, steps])

  const tryAdvance = useCallback(() => {
    if (phase !== 'reading' || !ready) return
    advance()
  }, [advance, phase, ready])

  const goBack = useCallback(() => {
    if (leaving || index === 0 || phase !== 'reading') return
    setDir('back')
    setIndex((i) => i - 1)
  }, [index, leaving, phase])

  // ── each step arriving ────────────────────────────────────────────────────
  useEffect(() => {
    if (!step) return
    const from = prevIndex.current
    prevIndex.current = index
    const backwards = from !== null && index < from
    setPhase('travelling')
    setReady(false)
    // A small tick under the thumb on each new step, where the phone allows it.
    // (Only once they have touched the page: before that, browsers refuse it.)
    const touched = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive
    if (phone && touched && 'vibrate' in navigator) {
      try { navigator.vibrate(8) } catch { /* not allowed here */ }
    }
    onStep?.(step)
    let travel = 'ids' in step.show ? GLIDE_MS : ANCHOR_MS
    const door = () => {
      const d = document.querySelector('[data-tour="launcher"]')?.getBoundingClientRect()
      return d ? { x: d.left + d.width / 2, y: d.top + d.height / 2 } : null
    }
    const timers: number[] = []
    if (!backwards) {
      if (step.room === 'open' || step.room === 'close') {
        onRoom?.(step.room, door())
        travel = ROOM_MS
      } else if (step.room) {
        onRoom?.(step.room, null)
        travel = Math.max(travel, 620)
      }
      // The writing page: a panel opening or closing, the page changing how it reads.
      if (step.panel !== undefined) { onPanel?.(step.panel); travel = Math.max(travel, 760) }
      if (step.view) { onView?.(step.view); travel = Math.max(travel, 760) }
    } else if (from !== null) {
      // Going back: the room, the panel and the page are put back as this step had them.
      const wasOpen = roomOpenAt(steps, from)
      const isOpen = roomOpenAt(steps, index)
      const half = roomHalfAt(steps, index)
      if (wasOpen && !isOpen) { onRoom?.('close', door()); travel = ROOM_MS }
      else if (!wasOpen && isOpen) {
        onRoom?.('open', door())
        travel = ROOM_MS
        if (half) timers.push(window.setTimeout(() => onRoom?.(half, null), reduce ? 0 : ROOM_MS))
        if (half) travel += 620
      } else if (isOpen && half && half !== roomHalfAt(steps, from)) { onRoom?.(half, null); travel = Math.max(travel, 620) }
      const panel = panelAt(steps, index)
      if (panel !== panelAt(steps, from)) { onPanel?.(panel); travel = Math.max(travel, 760) }
      const view = viewAt(steps, index)
      if (view && view !== viewAt(steps, from)) { onView?.(view); travel = Math.max(travel, 760) }
    }
    const ids = idsFor(step, narrow)
    if (ids) {
      const inset = narrow
        ? { top: 64, bottom: SHEET_H + 28, left: 10, right: 10 }
        : { top: 72, right: CARD_W + CARD_GAP * 2, bottom: 96, left: 24 }
      board?.current?.frame(ids, { inset, maxZoom: 1, ms: reduce ? 1 : GLIDE_MS, below: step.plus ? MENU_BELOW : 0 })
    }
    board?.current?.light(step.light ?? null)
    const arrive = reduce ? 120 : travel
    const id = window.setTimeout(() => setPhase('reading'), arrive)
    // Next works once the step has played (what the page itself acts out, `wait`)
    // and its words have arrived: a short step is ready soon, a busy one later.
    const gate = reduce ? 300 : Math.max(step.wait ?? 0, revealMs(step) + 500)
    timers.push(window.setTimeout(() => setReady(true), arrive + gate))
    // The "+" is seen being tapped, and then what it offers opens.
    const plus = step.plus
    const opens = plus ? window.setTimeout(() => board?.current?.plus(true), (reduce ? 120 : travel) + 900) : 0
    return () => {
      window.clearTimeout(id)
      timers.forEach((x) => window.clearTimeout(x))
      if (plus) { window.clearTimeout(opens); board?.current?.plus(false) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index])

  // On its own, once the step is readable: unless it is held (paused, or the
  // pointer is resting on the box), the tab is hidden, or it is the last step,
  // which waits for a press so a walk never ends unseen. (The preview can hold
  // a step still with ?tourhold=1, to look at it.)
  const hold = process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('tourhold')
  const auto = phase === 'reading' && ready && !last && !paused && !resting && !hidden && !hold && !leaving
  useEffect(() => {
    if (!auto || !step) return
    const id = window.setTimeout(advance, dwellMs(step))
    return () => window.clearTimeout(id)
  }, [advance, auto, index, lap, step])

  // Keys move on and back as the buttons do; nothing closes it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); tryAdvance() }
      if (e.key === ' ') { e.preventDefault(); setPaused((p) => !p); setLap((n) => n + 1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); goBack() }
      if (e.key === 'Escape') e.preventDefault()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [tryAdvance, goBack])

  // The canvas is not to be panned or zoomed out from under the walk.
  const root = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const stop = (e: Event) => e.preventDefault()
    el.addEventListener('wheel', stop, { passive: false })
    el.addEventListener('touchmove', stop, { passive: false })
    return () => { el.removeEventListener('wheel', stop); el.removeEventListener('touchmove', stop) }
  }, [])

  // ── the lit window, following whatever it points at every frame ───────────
  const hole = useRef<SVGRectElement | null>(null)
  const ring = useRef<HTMLDivElement | null>(null)
  const card = useRef<HTMLDivElement | null>(null)
  const hand = useRef<HTMLDivElement | null>(null)
  const shade = useRef<SVGRectElement | null>(null)
  const now = useRef<Rect | null>(null)
  const stepRef = useRef(step)
  stepRef.current = step
  const narrowRef = useRef(narrow)
  narrowRef.current = narrow

  useEffect(() => {
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      const s = stepRef.current
      if (!s) return
      const vw = window.innerWidth
      const vh = window.innerHeight
      const target = rectFor(s, narrowRef.current)
      if (target) {
        const want = {
          x: Math.max(6, target.x - PAD), y: Math.max(6, target.y - PAD),
          w: Math.min(vw - 12, target.w + PAD * 2), h: Math.min(vh - 12, target.h + PAD * 2),
        }
        const cur = now.current ?? want
        // Eased toward, not snapped to: the travelling is what carries the eye.
        const k = reduce ? 1 : 0.1
        now.current = {
          x: cur.x + (want.x - cur.x) * k, y: cur.y + (want.y - cur.y) * k,
          w: cur.w + (want.w - cur.w) * k, h: cur.h + (want.h - cur.h) * k,
        }
      }
      const r = now.current
      if (!r) return
      const round = Math.min(26, r.h / 2, r.w / 2)
      hole.current?.setAttribute('x', String(r.x))
      hole.current?.setAttribute('y', String(r.y))
      hole.current?.setAttribute('width', String(Math.max(0, r.w)))
      hole.current?.setAttribute('height', String(Math.max(0, r.h)))
      hole.current?.setAttribute('rx', String(round))
      if (shade.current) { shade.current.setAttribute('width', String(vw)); shade.current.setAttribute('height', String(vh)) }
      if (ring.current) {
        ring.current.style.transform = `translate(${r.x}px, ${r.y}px)`
        ring.current.style.width = `${r.w}px`
        ring.current.style.height = `${r.h}px`
        ring.current.style.borderRadius = `${round}px`
      }
      // The caption keeps to the side the lit thing is not on.
      const c = card.current
      if (c) {
        const ch = c.offsetHeight || SHEET_H
        if (narrowRef.current) {
          // At the bottom, unless the top covers nothing at all of what is lit
          // and the bottom would. When something fills the screen (the vision
          // room) the bottom is still right: it keeps the header at the top in
          // view, and the start of what is being shown, which is read first.
          const overBottom = Math.max(0, r.y + r.h - (vh - ch - 14))
          const overTop = Math.max(0, ch + 14 - r.y)
          c.dataset.edge = overBottom > 0 && overTop === 0 ? 'top' : 'bottom'
        } else if (r.w > vw * 0.62 && r.h > vh * 0.55) {
          // Nearly everything is lit (a first, wide look at a page): the words sit low and central, over it.
          const x = (vw - CARD_W) / 2
          c.style.transform = `translate(${Math.round(x)}px, ${Math.round(vh - ch - 28)}px)`
        } else {
          const roomRight = vw - 16 - (r.x + r.w + CARD_GAP)
          const roomLeft = r.x - CARD_GAP - 16
          if (roomRight >= CARD_W || roomLeft >= CARD_W) {
            const right = roomRight >= CARD_W && (roomLeft < CARD_W || r.x + r.w / 2 <= vw * 0.55)
            const x = right ? r.x + r.w + CARD_GAP : r.x - CARD_GAP - CARD_W
            const y = Math.min(vh - ch - 24, Math.max(84, r.y + r.h / 2 - ch / 2))
            c.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
          } else {
            // No room either side (a centred column on a smaller screen): under
            // what is lit when it fits there, otherwise over it.
            const x = Math.min(vw - CARD_W - 16, Math.max(16, r.x + r.w / 2 - CARD_W / 2))
            const below = r.y + r.h + CARD_GAP
            const above = r.y - CARD_GAP - ch
            // Under it when that fits, over its top edge when that does, otherwise low and over it.
            const y = below + ch <= vh - 16 ? below : above >= 16 ? above : vh - ch - 28
            c.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`
          }
        }
      }
      const g = hand.current
      if (g) {
        const at = gestureAt(s)
        if (at) {
          g.style.opacity = '1'
          g.style.transform = `translate(${Math.round(at.x + at.w / 2)}px, ${Math.round(at.y + at.h / 2)}px)`
        } else g.style.opacity = '0'
      }
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [reduce])

  if (!step) return null
  const inRoom = 'anchor' in step.show && (step.show.anchor === 'vision-page' || step.show.anchor === 'vision-talk')
  const words = step.headline.split(' ')

  return (
    <Portal>
      <style>{`
        @keyframes tourIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tourOut { from { opacity: 1; } to { opacity: 0; } }
        @keyframes tourWord { from { opacity: 0; transform: translateY(0.45em); filter: blur(4px); } to { opacity: 1; transform: none; filter: blur(0); } }
        @keyframes tourLine { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        @keyframes tourPulse { 0%, 100% { box-shadow: 0 0 0 1px ${alpha(t.violet, 0.9)}, 0 0 0 6px ${alpha(t.violet, 0.14)}, 0 0 38px ${alpha(t.violet, 0.28)}; } 50% { box-shadow: 0 0 0 1px ${alpha(t.violet, 0.9)}, 0 0 0 12px ${alpha(t.violet, 0.05)}, 0 0 58px ${alpha(t.violet, 0.42)}; } }
        @keyframes tourPress { 0% { transform: scale(1); } 45% { transform: scale(0.9); } 100% { transform: scale(1.06); opacity: 0; } }
        @keyframes tourHold { 0% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; } 18% { opacity: 1; } 55% { transform: translate(-50%, -50%) scale(0.82); opacity: 1; } 70% { transform: translate(-50%, -50%) scale(0.82); } 100% { transform: translate(-50%, -50%) scale(0.82); opacity: 0; } }
        @keyframes tourRipple { 0%, 55% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; } 62% { opacity: 0.8; } 100% { transform: translate(-50%, -50%) scale(2.4); opacity: 0; } }
        @keyframes tourRest { 0% { transform: translate(46px, 52px); opacity: 0; } 15% { opacity: 1; } 55%, 85% { transform: translate(0, 0); opacity: 1; } 100% { transform: translate(0, 0); opacity: 0; } }
        @keyframes tourTapDot { 0% { transform: translate(-50%, -50%) scale(1.6); opacity: 0; } 35% { transform: translate(-50%, -50%) scale(0.8); opacity: 1; } 70% { opacity: 1; } 100% { transform: translate(-50%, -50%) scale(0.8); opacity: 0; } }
        @keyframes tourTap { 0% { transform: translate(-50%, -50%) scale(0.6); opacity: 0.9; } 100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; } }
        @keyframes tourFill { from { width: 0%; } to { width: 100%; } }
        @keyframes tourNudge { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(3px); } }
        .tour-root { animation: tourIn 380ms ease both; }
        .tour-root[data-leaving] { animation: tourOut 400ms ease both; }
        .tour-ring { animation: tourPulse 2.4s ease-in-out infinite; }
        @keyframes tourFromRight { from { opacity: 0; transform: translateX(18px); } to { opacity: 1; transform: none; } }
        @keyframes tourFromLeft { from { opacity: 0; transform: translateX(-18px); } to { opacity: 1; transform: none; } }
        .tour-step-on { animation: tourFromRight 520ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        .tour-step-back { animation: tourFromLeft 520ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        .tour-word { display: inline-block; animation: tourWord 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        .tour-line { animation: tourLine 640ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        .tour-btn { transition: opacity 260ms ease, background-color 160ms ease, transform 160ms ease; }
        .tour-btn:active { transform: scale(0.96); }
        .tour-press { animation: tourPress 340ms cubic-bezier(0.3, 0, 0.2, 1) both; }
        .tour-card { transition: transform ${reduce ? 0 : 520}ms cubic-bezier(0.2, 0.7, 0.2, 1), opacity 260ms ease; }
        .tour-sheet { transition: top ${reduce ? 0 : 480}ms cubic-bezier(0.2, 0.7, 0.2, 1), bottom ${reduce ? 0 : 480}ms cubic-bezier(0.2, 0.7, 0.2, 1); }
        .tour-sheet[data-edge="bottom"] { bottom: max(14px, env(safe-area-inset-bottom)); top: auto; }
        .tour-sheet[data-edge="top"] { top: max(14px, env(safe-area-inset-top)); bottom: auto; }
        .tour-next { animation: tourNudge 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .tour-word, .tour-line, .tour-ring, .tour-next, .tour-step-on, .tour-step-back { animation: none !important; }
        }
      `}</style>
      <div
        ref={root}
        className="tour-root"
        data-leaving={leaving || undefined}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        // A tap anywhere but the message box does nothing: an accidental one must never skip a step.
        onClick={(e) => e.stopPropagation()}
        style={{ position: 'fixed', inset: 0, zIndex: 300, cursor: 'default', touchAction: 'none' }}
      >
        {/* the screen, darkened everywhere but the lit window */}
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
          <defs>
            <mask id="tour-hole">
              <rect ref={shade} x="0" y="0" width="100%" height="100%" fill="white" />
              <rect ref={hole} fill="black" />
            </mask>
          </defs>
          <rect
            x="0" y="0" width="100%" height="100%" mask="url(#tour-hole)"
            fill={inRoom ? 'rgba(8,8,7,0.46)' : 'rgba(8,8,7,0.66)'}
            style={{ transition: 'fill 420ms ease' }}
          />
        </svg>
        <div ref={ring} className="tour-ring" aria-hidden style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none' }} />

        {/* the door to the room, pressed */}
        {pressing && <DoorPress />}

        {/* a hold, or a rest, shown being done */}
        <div ref={hand} aria-hidden style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', opacity: 0, transition: 'opacity 240ms ease' }}>
          {step.gesture && phase === 'reading' && (step.gesture === 'hold' ? <Hold /> : step.gesture === 'tap' ? <Tap /> : <Rest />)}
        </div>

        {/* the words */}
        <div
          ref={card}
          className={narrow ? 'tour-sheet' : 'tour-card'}
          data-edge="bottom"
          onClick={(e) => { e.stopPropagation(); tryAdvance() }}
          onPointerEnter={(e) => { if (e.pointerType === 'mouse') setResting(true) }}
          onPointerLeave={() => { if (resting) { setResting(false); setLap((n) => n + 1) } }}
          style={narrow ? {
            cursor: ready ? 'pointer' : 'default',
            position: 'absolute', left: 10, right: 10, maxWidth: 480, margin: '0 auto',
            padding: '11px 16px 12px', borderRadius: 18,
            background: alpha(t.containerBg, 0.96), backdropFilter: 'blur(20px) saturate(1.1)',
            border: `1px solid ${alpha(t.textPrimary, 0.1)}`, boxShadow: '0 18px 50px rgba(0,0,0,0.45)',
          } : {
            cursor: ready ? 'pointer' : 'default',
            position: 'absolute', left: 0, top: 0, width: CARD_W,
            padding: '18px 22px 20px', borderRadius: radius.widget,
            background: alpha(t.containerBg, 0.97), backdropFilter: 'blur(20px) saturate(1.1)',
            border: `1px solid ${alpha(t.textPrimary, 0.1)}`, boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          }}
        >
          <Progress count={steps.length} at={index} reading={phase === 'reading'} colour={t.violet} track={alpha(t.textPrimary, 0.12)} />
          <div aria-live="polite" style={{ minHeight: narrow ? 56 : 112, marginTop: narrow ? 10 : 14 }}>
            {phase === 'reading' && (
              <div key={step.key} className={dir === 'back' ? 'tour-step-back' : 'tour-step-on'}>
                <h2 style={{
                  margin: 0, color: t.textPrimary, fontFamily: fonts.display, fontWeight: 650,
                  fontSize: narrow ? 18.5 : 22, lineHeight: 1.2, letterSpacing: '-0.02em', textWrap: 'balance',
                }}>
                  {words.map((w, i) => (
                    <span key={i} className="tour-word" style={{ animationDelay: `${i * WORD_MS}ms` }}>
                      {w}{i < words.length - 1 ? ' ' : ''}
                    </span>
                  ))}
                </h2>
                <div style={{ marginTop: narrow ? 6 : 10, display: 'flex', flexDirection: 'column', gap: narrow ? 2 : 4 }}>
                  {step.lines.map((line, i) => (
                    <p key={i} className="tour-line" style={{
                      ...canvasType.body, fontSize: narrow ? 13.5 : 15, lineHeight: 1.4, margin: 0,
                      color: i === 0 ? t.textSecondary : t.textMuted,
                      animationDelay: `${words.length * WORD_MS + 200 + i * LINE_MS}ms`,
                    }}>
                      {line}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: narrow ? 8 : 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {index > 0 && (
                <button
                  type="button"
                  className="tour-btn"
                  onClick={(e) => { e.stopPropagation(); goBack() }}
                  disabled={phase !== 'reading'}
                  aria-label="Back a step"
                  style={{
                    width: 34, height: 34, borderRadius: 999, border: `1px solid ${alpha(t.textPrimary, 0.16)}`,
                    background: 'transparent', color: t.textSecondary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    cursor: phase === 'reading' ? 'pointer' : 'default', opacity: phase === 'reading' ? 1 : 0.4,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 5l-7 7 7 7" /></svg>
                </button>
              )}
              {!last && (
                <button
                  type="button"
                  className="tour-btn"
                  onClick={(e) => { e.stopPropagation(); setPaused((p) => !p); setLap((n) => n + 1) }}
                  aria-label={paused ? 'Carry on by itself' : 'Pause: stop it moving on by itself'}
                  aria-pressed={paused}
                  style={{
                    width: 34, height: 34, borderRadius: 999, border: `1px solid ${alpha(t.textPrimary, 0.16)}`,
                    background: paused ? alpha(t.violet, 0.14) : 'transparent', color: paused ? t.violet : t.textSecondary,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  }}
                >
                  {paused
                    ? <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.5v15l12-7.5z" /></svg>
                    : <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>}
                </button>
              )}
              {/* On a phone the bars above already say how far in; the count is room it can spare. */}
              <span style={{ ...canvasType.meta, color: alpha(shell.text, 0.4) }}>{narrow ? '' : `${index + 1} of ${steps.length}`}</span>
            </div>
            <button
              type="button"
              className="tour-btn"
              onClick={(e) => { e.stopPropagation(); tryAdvance() }}
              disabled={!ready}
              aria-label={last ? 'Finish the walk' : 'Next step'}
              style={{
                height: 34, padding: '0 14px 0 16px', borderRadius: 999, border: 'none',
                background: ready ? t.violet : alpha(t.textPrimary, 0.1), color: ready ? '#fff' : alpha(shell.text, 0.45),
                fontFamily: fonts.ui, fontSize: 13.5, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
                cursor: ready ? 'pointer' : 'default', position: 'relative', overflow: 'hidden',
              }}
            >
              {/* How long until it moves on by itself: a line filling along the foot of the button. */}
              {auto && (
                <span
                  key={`${index}-${lap}`}
                  aria-hidden
                  style={{ position: 'absolute', left: 0, bottom: 0, height: 2.5, background: 'rgba(255,255,255,0.75)', animation: `tourFill ${dwellMs(step)}ms linear both` }}
                />
              )}
              {last ? 'Done' : 'Next'}
              <svg className={ready ? 'tour-next' : undefined} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 5l7 7-7 7" /></svg>
            </button>
          </div>
        </div>
      </div>
    </Portal>
  )
}

/** One bar per step: the ones done and the one being read are filled, the way stories show how far in you are. */
function Progress({ count, at, reading, colour, track }: { count: number; at: number; reading: boolean; colour: string; track: string }) {
  return (
    <div aria-hidden style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: track, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%', background: colour, borderRadius: 2,
              width: i < at || (i === at && reading) ? '100%' : '0%',
              transition: 'width 520ms cubic-bezier(0.2, 0.7, 0.2, 1)',
            }}
          />
        </div>
      ))}
    </div>
  )
}

/** A finger coming down and staying: how a phone asks what something is tied to. */
function Hold() {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{
        position: 'absolute', left: 0, top: 0, width: 54, height: 54, borderRadius: '50%',
        border: `2px solid ${alpha(shell.text, 0.85)}`, animation: 'tourRipple 2.2s ease-out infinite',
      }} />
      <span style={{
        position: 'absolute', left: 0, top: 0, width: 46, height: 46, borderRadius: '50%',
        background: alpha(shell.text, 0.32), boxShadow: `0 0 0 1px ${alpha(shell.text, 0.6)}, 0 6px 20px rgba(0,0,0,0.35)`,
        animation: 'tourHold 2.2s cubic-bezier(0.3, 0, 0.2, 1) infinite',
      }} />
    </div>
  )
}

/** One tap, once: the "+" being pressed before its menu opens. */
function Tap() {
  return (
    <div style={{ position: 'relative' }}>
      <span style={{
        position: 'absolute', left: 0, top: 0, width: 40, height: 40, borderRadius: '50%',
        border: `2px solid ${alpha(shell.text, 0.9)}`, animation: 'tourTap 900ms 420ms ease-out both',
      }} />
      <span style={{
        position: 'absolute', left: 0, top: 0, width: 34, height: 34, borderRadius: '50%',
        background: alpha(shell.text, 0.35), animation: 'tourTapDot 900ms 120ms ease-out both',
      }} />
    </div>
  )
}

/** A pointer arriving and resting. */
function Rest() {
  return (
    <div style={{ animation: 'tourRest 2.4s cubic-bezier(0.2, 0.7, 0.2, 1) infinite' }}>
      <svg width="22" height="26" viewBox="0 0 22 26" style={{ filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))' }}>
        <path d="M2 2l17 11-7.5 1.6L8 22z" fill={shell.text} stroke="#111" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

/** The room's button, seen being pressed. */
function DoorPress() {
  const [at, setAt] = useState<Rect | null>(null)
  useEffect(() => {
    const el = document.querySelector('[data-tour="launcher"]')
    if (el) setAt(unionOf([el]))
  }, [])
  if (!at) return null
  return (
    <div
      className="tour-press"
      aria-hidden
      style={{
        position: 'absolute', left: at.x, top: at.y, width: at.w, height: at.h, borderRadius: 999,
        background: alpha(shell.text, 0.18), pointerEvents: 'none',
      }}
    />
  )
}
