'use client'

// studio/src/components/work/board.tsx — level 2, the board.
//
// Everything on it can be picked up and put down: the pieces, the threads'
// hubs, and the project's own vision block. A piece or a hub with no hand
// placement of its own sits in its reading-order lane or near the pieces it
// touches — "rearrange" (next to the zoom control) puts everything back
// there in one motion by clearing every hand placement at once.
//
// What runs across the pieces is drawn underneath as a web: one block per
// thread, with a line running to every piece it touches — never repeated
// per card. A thread connected to every single piece is not a thread any
// more, it is a constraint on the project, and the board says so before it
// lets you finish the last connection.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { Surface, ZoomPill, useCanvas, useFrame } from '@/components/surface/surface'
import { PieceCard } from '@/components/work/piece-card'
import { ThreadCard } from '@/components/work/thread-card'
import { CheckCard } from '@/components/work/rules'
import { VisionBlock, VISION_COLLAPSED_H, VISION_EXPANDED_H, visionWidth } from '@/components/work/vision-block'
import { hueOf } from '@/components/work/bits'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'
import type { Appearance, CheckOutcome, Rule, RuleCheck, Thread, ThreadTag, TreeNode } from '@/lib/studio/node-types'
import {
  MARGIN, growWorld, laneCardWidth, laneSlot, packRow, smoothPath, toWorld, type Point,
} from '@/lib/studio/surface'

const GAP = 44
const BASE_CARD_TOP = 108
const WEB_GAP = 46      // space between the cards and the web below them
const HUB_W = 236
const HUB_H = 104
const HUB_GAP = 30
const ADD_GAP = 16      // between the "add a piece" and "add a thread" spots —
                         // they read as one stacked unit, not two separate rows
const MARKER_SPACING = 16  // how far apart two connection points sit on one card's edge
const NOTICE_GAP = 24
// Its own scale, not the vision panel's — a collision is a nudge, not
// content, and wants the room to stay almost as short as its title, not a
// width tied to whatever the vision panel happens to be.
const NOTICE_MIN_W = 480
const NOTICE_MAX_W = 2000
const NOTICE_FALLBACK_H = 130  // only the one frame before the row measures itself
// Rearranging glides rather than snaps — fast at first, easing to a stop —
// the same curve the reveal panels already use (stage.tsx), so every motion
// on these canvases settles the same way.
const TIDY_EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'
const TIDY_MS = 450

export interface BoardProject {
  title: string
  intent: string
  rules: Rule[]
  vision_x: number | null
  vision_y: number | null
}

export interface BoardActions {
  openPiece: (id: string, from: HTMLElement | null) => void
  addPiece: () => void
  removePiece: (piece: TreeNode) => void
  renamePiece: (id: string, title: string) => void
  reorder: (ids: string[]) => void
  movePiece: (id: string, at: Point | null) => void
  /** Makes a new, unattached thread. Opened straight away so it can be named
   *  and connected to its first pieces from the checklist. */
  addThread: () => Promise<Thread | null>
  editThread: (id: string, patch: Partial<Thread>) => void
  removeThread: (id: string) => void
  moveThread: (id: string, at: Point | null) => void
  tag: (nodeId: string, threadId: string, note?: string) => void
  untag: (nodeId: string, threadId: string) => void
  /** The thread runs through everything; keep it as a rule on the project. */
  makeConstraint: (thread: Thread) => void
  /** Read every appearance of the thread in order, one level down. */
  readThread: (id: string) => void
  renameProject: (title: string) => void
  editProjectIntent: (intent: string) => void
  editProjectRules: (rules: Rule[]) => void
  moveVision: (at: Point | null) => void
  /** Clears every hand placement at once: pieces, hubs, and the vision block
   *  all return to their auto positions. */
  tidyBoard: () => void
}

type Drag = { kind: 'hub' | 'vision'; id: string; at: Point }

export function Board({
  project,
  pieces,
  threads,
  checks,
  onResolveCheck,
  onAmendCheck,
  tagFor,
  appearancesFor,
  actions,
  disabled = false,
}: {
  project: BoardProject
  pieces: TreeNode[]
  threads: Thread[]
  /** Sits right under the title, side by side when there's more than one —
   *  never floating in the middle of the canvas on its own. */
  checks: RuleCheck[]
  onResolveCheck: (checkId: string, outcome: CheckOutcome, note?: string) => void
  onAmendCheck: (checkId: string, text: string) => void
  tagFor: (nodeId: string, threadId: string) => ThreadTag | undefined
  appearancesFor: (threadId: string) => Appearance[]
  actions: BoardActions
  disabled?: boolean
}) {
  const { t } = useTheme()
  const ref = useRef<HTMLDivElement | null>(null)
  const frame = useFrame(ref)
  const visionRef = useRef<HTMLDivElement | null>(null)
  const visionFrame = useFrame(visionRef)
  const noticesRef = useRef<HTMLDivElement | null>(null)
  const noticesFrame = useFrame(noticesRef)

  const [drag, setDrag] = useState<Drag | null>(null)
  const [arming, setArming] = useState<string | null>(null)
  const [asking, setAsking] = useState<{ thread: Thread; toId: string } | null>(null)
  const [openThread, setOpenThread] = useState<string | null>(null)
  const [visionOpen, setVisionOpen] = useState(false)

  const cardW = frame.w ? laneCardWidth(frame.w, GAP) : 520
  const cardH = frame.h ? Math.round(Math.min(560, Math.max(340, frame.h * 0.5))) : 420
  // Kept in proportion with the piece cards, not a width of its own — a
  // fixed one dwarfed a lane of narrower cards on anything but a wide window.
  const visionW = visionWidth(cardW)

  // Measured, not assumed: a fixed height for the expanded panel either
  // clipped a long intent and its rules mid-sentence, or left a gap too big
  // for a short one. The fallback only covers the one frame before the
  // ResizeObserver's first reading lands.
  const visionH = visionFrame.h || (visionOpen ? VISION_EXPANDED_H : VISION_COLLAPSED_H)
  const visionMoved = project.vision_x !== null || project.vision_y !== null
  // Measured the same way as the vision panel above it — a guessed constant
  // either clipped a long question or left too much air under a short one.
  const noticeH = checks.length > 0 ? (noticesFrame.h || NOTICE_FALLBACK_H) : 0
  // Stretched across the frame itself, not the vision panel — a collision is
  // a nudge, and a nudge reads as one whenever it can stay short and wide
  // rather than boxed to the vision panel's own, much narrower scale.
  const noticeW = checks.length > 0
    ? Math.round(Math.min(NOTICE_MAX_W, Math.max(NOTICE_MIN_W, ((frame.w || 1200) - MARGIN * 2 - (checks.length - 1) * NOTICE_GAP) / checks.length)))
    : 0
  // Vision → notices → pieces uses NOTICE_GAP both times, the same rhythm
  // twice over. With no notices in the way, vision → pieces keeps the wider
  // GAP — that relationship was never the one asked to tighten.
  const gapBelowVision = checks.length > 0 ? NOTICE_GAP + noticeH + NOTICE_GAP : GAP
  // Pieces clear the title's own space — and the notices sitting under it,
  // when there are any — only while the title is still where it started.
  // Drag it away and the lane is free to rise back to its usual place.
  const cardTop = visionMoved ? BASE_CARD_TOP : Math.max(BASE_CARD_TOP, MARGIN + visionH + gapBelowVision)
  const cardX = useCallback((i: number) => laneSlot(i, cardW, GAP), [cardW])
  // The "add a piece" spot gives up some of its own height so a matching
  // "add a thread" card — the same size as a real one — can sit right
  // underneath it: one fixed column for adding to the board, instead of a
  // box that has to go looking for wherever the threads currently are.
  const addColW = HUB_W
  const addPieceH = Math.max(140, cardH - ADD_GAP - HUB_H)
  const addHelpH = pieces.length === 0 ? 54 : 0

  /** Where a piece sits: hand-placed from before this became fixed, or in
   *  its reading-order lane. Pieces are no longer dragged — the "add a
   *  thread" and "add a piece" spots kept drifting into odd places as the
   *  layout around them moved, so only the threads and the title still
   *  pick up and put down. */
  const pieceAt = useCallback((piece: TreeNode, i: number): Point =>
    ({ x: piece.board_x ?? cardX(i), y: piece.board_y ?? cardTop }),
  [cardX, cardTop])

  /** Where each thread appears, by top-level piece. The board only ever asks
   *  this question of the pieces; depth below them is level 1's business. */
  const presence = useMemo(() => {
    const map = new Map<string, { roots: Set<string>; direct: Set<string> }>()
    for (const th of threads) {
      const roots = new Set<string>()
      const direct = new Set<string>()
      for (const a of appearancesFor(th.id)) {
        roots.add(a.rootId)
        if (a.node.id === a.rootId) direct.add(a.rootId)
      }
      map.set(th.id, { roots, direct })
    }
    return map
  }, [threads, appearancesFor])

  /** The threads that actually have a hub — the ones with at least one piece.
   *  A brand-new thread with nothing on it yet lives only in its own card,
   *  reached through the "+ thread" button, until it has its first line. */
  const hubs = useMemo(
    () => threads.filter((th) => (presence.get(th.id)?.roots.size ?? 0) > 0),
    [threads, presence],
  )

  const webTop = cardTop + cardH + WEB_GAP

  /** Each un-placed hub sits near the average position of the pieces it
   *  touches, so the web reads as threads reaching toward their pieces
   *  rather than a legend with no relationship to what is on screen.
   *  packRow keeps them from landing on top of one another. */
  const autoHubX = useMemo(() => {
    const preferred = hubs.map((th) => {
      const on = presence.get(th.id)?.roots ?? new Set<string>()
      const xs = pieces
        .map((p, i) => (on.has(p.id) ? pieceAt(p, i).x + cardW / 2 : null))
        .filter((x): x is number => x !== null)
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : MARGIN + HUB_W / 2
    })
    const packed = packRow(preferred, HUB_W + HUB_GAP)
    const map = new Map<string, number>()
    hubs.forEach((th, i) => map.set(th.id, Math.max(MARGIN, packed[i] - HUB_W / 2)))
    return map
  }, [hubs, presence, pieces, pieceAt, cardW])

  /** Where a thread's hub actually is right now. */
  const hubAt = useCallback((th: Thread): Point => {
    if (drag?.kind === 'hub' && drag.id === th.id) return drag.at
    return { x: th.board_x ?? autoHubX.get(th.id) ?? MARGIN, y: th.board_y ?? webTop }
  }, [drag, autoHubX, webTop])

  const visionAt: Point = useMemo(
    () => (drag?.kind === 'vision' ? drag.at : { x: project.vision_x ?? MARGIN, y: project.vision_y ?? MARGIN }),
    [drag, project.vision_x, project.vision_y],
  )

  const hubRight = hubs.length ? Math.max(...hubs.map((th) => hubAt(th).x + HUB_W)) : MARGIN

  const world = useMemo(() => {
    let w = { w: frame.w || 0, h: frame.h || 0 }
    w = growWorld(w, MARGIN, MARGIN, (pieces.length + 1) * (cardW + GAP), 0)
    w = growWorld(w, 0, 0, hubRight + HUB_W + GAP, 0)
    w = growWorld(w, cardX(pieces.length), cardTop, addColW, addPieceH + addHelpH + ADD_GAP + HUB_H)
    w = growWorld(w, visionAt.x, visionAt.y, visionW, visionH)
    if (checks.length > 0) {
      w = growWorld(w, visionAt.x, visionAt.y + visionH + NOTICE_GAP, checks.length * (noticeW + NOTICE_GAP), noticeH)
    }
    for (const [i, piece] of pieces.entries()) {
      const at = pieceAt(piece, i)
      w = growWorld(w, at.x, at.y, cardW, cardH)
    }
    for (const th of hubs) {
      const at = hubAt(th)
      w = growWorld(w, at.x, at.y, HUB_W, HUB_H)
    }
    return w
  }, [
    frame, pieces, cardW, cardH, hubs, hubAt, hubRight, pieceAt, visionAt, visionH, visionW, checks.length,
    cardX, cardTop, addColW, addPieceH, addHelpH, noticeW, noticeH,
  ])

  const canvas = useCanvas(ref, frame, world)

  /** Where each piece's connection points land along its own bottom edge —
   *  one per thread touching it, fanned out so two threads on one card do
   *  not draw on top of each other. */
  const markersFor = useCallback((pieceId: string) => {
    const mine = hubs.filter((th) => presence.get(th.id)?.roots.has(pieceId))
    const n = mine.length
    return mine.map((th, i) => ({ thread: th, dx: (i - (n - 1) / 2) * MARKER_SPACING }))
  }, [hubs, presence])

  // Escape drops whatever you were in the middle of.
  useEffect(() => {
    if (!arming) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setArming(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [arming])

  const move = useCallback((id: string, delta: -1 | 1) => {
    const ids = pieces.map((p) => p.id)
    const from = ids.indexOf(id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= ids.length) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    actions.reorder(ids)
  }, [actions, pieces])

  /** One drag gesture, for anything on the board. Persists the drop only
   *  when the pointer actually travelled — a plain click never moves
   *  anything, so every inner button keeps working exactly as it did. */
  const beginDrag = useCallback((
    kind: Drag['kind'], id: string, committed: Point, onDrop: (at: Point) => void,
  ) => (e: React.PointerEvent) => {
    if (disabled) return
    const el = ref.current
    if (!el || e.button !== 0) return
    // user-select:none on the wrapper stops the drag's own text from
    // highlighting, but a press-and-drag that starts right at a text edge
    // could still hand the gesture to the browser's own selection instead of
    // ours. Preventing the default here is the actual guarantee — it heads
    // off text selection and native drag-image ghosting regardless of where
    // in the block the pointer went down, and does not stop the click that
    // follows a plain press-and-release (that is a separate event).
    e.preventDefault()
    const box = el.getBoundingClientRect()
    const grab = toWorld({ x: e.clientX - box.left, y: e.clientY - box.top }, canvas.pan, canvas.zoom)
    const offset = { x: grab.x - committed.x, y: grab.y - committed.y }
    let moved = false
    let landed = committed
    const target = e.currentTarget as HTMLElement
    // Capture is deferred until real movement, not set here at the down
    // event: capturing immediately redirects the click that follows a plain
    // press-and-release to this wrapper (the nearest common ancestor of
    // wherever the finger went down and up), so a rename or delete button
    // inside the card would stop receiving its own clicks entirely.
    const onMove = (ev: PointerEvent) => {
      const now = toWorld({ x: ev.clientX - box.left, y: ev.clientY - box.top }, canvas.pan, canvas.zoom)
      landed = { x: Math.round(Math.max(0, now.x - offset.x)), y: Math.round(Math.max(0, now.y - offset.y)) }
      if (!moved && (Math.abs(landed.x - committed.x) > 3 || Math.abs(landed.y - committed.y) > 3)) {
        moved = true
        target.setPointerCapture(ev.pointerId)
      }
      if (moved) setDrag({ kind, id, at: landed })
    }
    const onUp = (ev: PointerEvent) => {
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      target.removeEventListener('pointercancel', onUp)
      if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId)
      setDrag(null)
      if (moved) onDrop(landed)
    }
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
    target.addEventListener('pointercancel', onUp)
  }, [canvas.pan, canvas.zoom, disabled])

  /** Every hand placement, gone at once: pieces to their lane, hubs to their
   *  pieces, the vision block back to the corner. */
  const rearrange = useCallback(() => actions.tidyBoard(), [actions])

  /** Arming a connection carries the view toward the nearest piece that could
   *  take it — otherwise the only thing you can click is off the side of the
   *  glass. */
  const arm = useCallback((th: Thread) => {
    if (arming === th.id) { setArming(null); return }
    setArming(th.id)
    const on = presence.get(th.id)?.roots ?? new Set<string>()
    const open = pieces.map((p, i) => (on.has(p.id) ? -1 : i)).filter((i) => i >= 0)
    if (open.length === 0) return
    const hubCenter = hubAt(th).x + HUB_W / 2
    const nearest = open.reduce(
      (best, i) => (Math.abs(pieceAt(pieces[i], i).x + cardW / 2 - hubCenter) < Math.abs(pieceAt(pieces[best], best).x + cardW / 2 - hubCenter) ? i : best),
      open[0],
    )
    const at = pieceAt(pieces[nearest], nearest)
    canvas.glideTo({ x: at.x + cardW / 2, y: at.y + cardH / 2 })
  }, [arming, canvas, cardW, cardH, hubAt, pieceAt, pieces, presence])

  /** Finishing a connection. Everything about the "all but one" rule is here. */
  const connectTo = useCallback((piece: TreeNode) => {
    if (!arming) return
    const thread = threads.find((th) => th.id === arming)
    setArming(null)
    if (!thread) return
    const on = presence.get(thread.id)?.roots ?? new Set<string>()
    const wouldBeEverywhere = pieces.length > 1 && !on.has(piece.id) && on.size + 1 >= pieces.length
    if (wouldBeEverywhere) { setAsking({ thread, toId: piece.id }); return }
    actions.tag(piece.id, thread.id)
  }, [actions, arming, pieces.length, presence, threads])

  const addNewThread = useCallback(async () => {
    const created = await actions.addThread()
    if (created) setOpenThread(created.id)
  }, [actions])

  const armedThread = arming ? threads.find((th) => th.id === arming) ?? null : null
  const armedOn = armedThread ? presence.get(armedThread.id)?.roots ?? new Set<string>() : null

  return (
    <>
      <Surface
        canvas={canvas}
        innerRef={ref}
        ariaLabel="The board — the pieces of this project and the threads under them"
        chrome={
          <>
            <ZoomPill
              canvas={canvas}
              onHome={canvas.resetView}
              after={!disabled && <RearrangeButton onClick={rearrange} />}
            />
            {arming && armedThread && (
              <ConnectBanner thread={armedThread} onCancel={() => setArming(null)} />
            )}
          </>
        }
      >
        {/* every line in the web, drawn once, under everything */}
        <svg
          width={world.w}
          height={world.h}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
          aria-hidden
        >
          {hubs.map((th) => {
            const hb = hubAt(th)
            const hx = hb.x + HUB_W / 2
            const hy = hb.y
            const colour = hueOf(t, th.hue)
            const here = presence.get(th.id)!
            return pieces.map((piece, i) => {
              if (!here.roots.has(piece.id)) return null
              const marker = markersFor(piece.id).find((m) => m.thread.id === th.id)
              const p = pieceAt(piece, i)
              const ex = p.x + cardW / 2 + (marker?.dx ?? 0)
              const ey = p.y + cardH
              const deep = !here.direct.has(piece.id)
              return (
                <path
                  key={`${th.id}-${piece.id}`}
                  d={smoothPath({ x: ex, y: ey }, { x: hx, y: hy })}
                  fill="none"
                  stroke={alpha(colour, deep ? 0.32 : 0.55)}
                  strokeWidth={1.5}
                  strokeDasharray={deep ? '1 5' : undefined}
                  strokeLinecap="round"
                />
              )
            })
          })}
        </svg>

        {/* the project's own title, vision and rules */}
        <div
          ref={visionRef}
          data-hold
          onPointerDown={beginDrag('vision', 'vision', visionAt, (at) => actions.moveVision(at))}
          style={{
            position: 'absolute', left: visionAt.x, top: visionAt.y, cursor: disabled ? 'default' : 'grab', touchAction: 'none',
            // Dragging from directly on top of the title text would otherwise
            // select it like any other text on a page before the drag ever
            // registers — this only blocks selection outside actual inputs.
            userSelect: 'none', WebkitUserSelect: 'none',
            // Off while the hand is actually moving it — a live drag has to
            // track the pointer exactly, not ease toward it a beat behind.
            transition: drag?.kind === 'vision' ? 'none' : `left ${TIDY_MS}ms ${TIDY_EASE}, top ${TIDY_MS}ms ${TIDY_EASE}`,
          }}
        >
          <VisionBlock
            title={project.title}
            width={visionW}
            intent={project.intent}
            rules={project.rules}
            expanded={visionOpen}
            onToggle={() => setVisionOpen((v) => !v)}
            onRename={actions.renameProject}
            onEditIntent={actions.editProjectIntent}
            onEditRules={actions.editProjectRules}
            disabled={disabled}
          />
        </div>

        {/* whatever needs the person's attention, right under the title —
           never floating loose in the middle of the canvas. Side by side,
           and measured for its real height, the same as the vision panel
           above it: a guessed height either clipped a long question or
           left the pieces below sitting on too much empty air. */}
        {checks.length > 0 && (
          <div
            ref={noticesRef}
            style={{
              position: 'absolute', left: visionAt.x, top: visionAt.y + visionH + NOTICE_GAP,
              display: 'flex', alignItems: 'flex-start', gap: NOTICE_GAP,
            }}
          >
            {checks.map((check) => (
              <div
                key={check.id}
                data-hold
                style={{
                  width: noticeW,
                  // CheckCard is styled for a solid backing (it's normally read
                  // on the writing page's own container) — the canvas behind it
                  // here is transparent, so it needs that backing given directly.
                  background: t.containerBg, borderRadius: radius.widget, boxShadow: t.containerShadow,
                }}
              >
                <CheckCard
                  check={check}
                  onResolve={(outcome, note) => onResolveCheck(check.id, outcome, note)}
                  onAmend={(text) => onAmendCheck(check.id, text)}
                />
              </div>
            ))}
          </div>
        )}

        {/* the pieces — laid out, not dragged: a piece's place is its order
           among the others, moved with the arrows on the card itself. Only
           the threads that run across them, and the project's own title,
           are picked up and put down. */}
        {pieces.map((piece, i) => {
          const targeted = Boolean(armedOn && !armedOn.has(piece.id))
          const at = pieceAt(piece, i)
          return (
            <div
              key={piece.id}
              style={{
                position: 'absolute', left: at.x, top: at.y, width: cardW, height: cardH,
                transition: `left ${TIDY_MS}ms ${TIDY_EASE}, top ${TIDY_MS}ms ${TIDY_EASE}`,
              }}
            >
              <PieceCard
                node={piece}
                width={cardW}
                height={cardH}
                first={i === 0}
                last={i === pieces.length - 1}
                dimmed={Boolean(armedOn && armedOn.has(piece.id))}
                targeted={targeted}
                disabled={disabled}
                onOpen={(el) => actions.openPiece(piece.id, el)}
                onRename={(title) => actions.renamePiece(piece.id, title)}
                onRemove={() => actions.removePiece(piece)}
                onMove={(d) => move(piece.id, d)}
              />
              {targeted && (
                <button
                  data-hold
                  type="button"
                  aria-label={`Run ${armedThread?.name || 'this thread'} through ${piece.title || 'this piece'}`}
                  onClick={() => connectTo(piece)}
                  style={{
                    position: 'absolute', inset: 0, borderRadius: radius.card,
                    background: alpha(t.tide, 0.06), border: 'none', cursor: 'pointer',
                  }}
                />
              )}
              {/* the connection points along this card's own bottom edge */}
              {markersFor(piece.id).map(({ thread, dx }) => (
                <Marker
                  key={thread.id}
                  thread={thread}
                  left={cardW / 2 + dx}
                  note={tagFor(piece.id, thread.id)?.note ?? ''}
                  deep={!presence.get(thread.id)!.direct.has(piece.id)}
                  onOpen={() => setOpenThread(thread.id)}
                />
              ))}
            </div>
          )
        })}

        {/* the web's own blocks — one per thread, wherever it sits */}
        {hubs.map((th) => {
          const at = hubAt(th)
          return (
            <div
              key={th.id}
              onPointerDown={beginDrag('hub', th.id, at, (landed) => actions.moveThread(th.id, landed))}
              style={{
                position: 'absolute', left: at.x, top: at.y, cursor: disabled ? 'default' : 'grab', touchAction: 'none',
                userSelect: 'none', WebkitUserSelect: 'none',
                transition: drag?.kind === 'hub' && drag.id === th.id
                  ? 'none' : `left ${TIDY_MS}ms ${TIDY_EASE}, top ${TIDY_MS}ms ${TIDY_EASE}`,
              }}
            >
              <Hub
                thread={th}
                armed={arming === th.id}
                disabled={disabled}
                onOpen={() => setOpenThread(th.id)}
                onConnect={() => arm(th)}
                onRemove={() => actions.removeThread(th.id)}
              />
            </div>
          )
        })}

        {/* one more piece, and — the same size and style as a real thread
           card — one more thread right beneath it: the one spot on the
           board for adding to it, fixed in place regardless of what the
           threads or the title are currently doing. */}
        {!disabled && (
          <>
            <div style={{ position: 'absolute', left: cardX(pieces.length), top: cardTop, width: addColW }}>
              <button
                data-hold
                type="button"
                aria-label="Add a piece to this project"
                title="Add a piece"
                onClick={actions.addPiece}
                style={{
                  width: '100%', height: addPieceH,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', cursor: 'pointer',
                  border: `1px dashed ${alpha(shell.text, 0.16)}`, borderRadius: radius.card,
                  color: shell.muted,
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
              {pieces.length === 0 && (
                <p style={{ ...canvasType.small, color: shell.muted, margin: '14px 0 0', textAlign: 'center', height: addHelpH - 14, boxSizing: 'border-box' }}>
                  A piece is one whole thing — a film, a chapter, a song, an essay.
                </p>
              )}
            </div>

            <div style={{ position: 'absolute', left: cardX(pieces.length), top: cardTop + addPieceH + addHelpH + ADD_GAP, width: HUB_W, height: HUB_H }}>
              <button
                data-hold
                type="button"
                aria-label="Add a thread to this project"
                title="Add a thread"
                onClick={() => void addNewThread()}
                style={{
                  width: '100%', height: '100%', boxSizing: 'border-box',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'transparent', cursor: 'pointer',
                  border: `1px dashed ${alpha(shell.text, 0.16)}`, borderRadius: radius.widget,
                  color: shell.muted,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </>
        )}
      </Surface>

      {openThread && (
        <ThreadCard
          thread={threads.find((th) => th.id === openThread)!}
          pieces={pieces}
          on={presence.get(openThread)?.roots ?? new Set()}
          direct={presence.get(openThread)?.direct ?? new Set()}
          tagFor={tagFor}
          disabled={disabled}
          onClose={() => setOpenThread(null)}
          onEdit={(patch) => actions.editThread(openThread, patch)}
          onTag={(nodeId) => actions.tag(nodeId, openThread)}
          onNote={(nodeId, note) => actions.tag(nodeId, openThread, note)}
          onUntag={(nodeId) => actions.untag(nodeId, openThread)}
          onRemove={() => { setOpenThread(null); actions.removeThread(openThread) }}
          onRead={() => { setOpenThread(null); actions.readThread(openThread) }}
        />
      )}

      {asking && (
        <EverywhereDialog
          thread={asking.thread}
          onConstraint={() => { actions.makeConstraint(asking.thread); setAsking(null) }}
          onAnyway={() => { actions.tag(asking.toId, asking.thread.id); setAsking(null) }}
          onCancel={() => setAsking(null)}
        />
      )}
    </>
  )
}

// ── the "rearrange" tool, beside the zoom control ───────────────────────────

function RearrangeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Rearrange everything neatly"
      title="Rearrange everything neatly"
      onClick={onClick}
      style={{
        width: 30, height: 30, borderRadius: 999, padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', color: shell.muted,
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="4" width="7" height="7" rx="1.5" />
        <rect x="13" y="4" width="7" height="7" rx="1.5" />
        <rect x="4" y="13" width="7" height="7" rx="1.5" />
        <rect x="13" y="13" width="7" height="7" rx="1.5" />
      </svg>
    </button>
  )
}

// ── the block that stands for one thread ────────────────────────────────────

function Hub({
  thread, armed, disabled, onOpen, onConnect, onRemove,
}: {
  thread: Thread
  armed: boolean
  disabled: boolean
  onOpen: () => void
  onConnect: () => void
  onRemove: () => void
}) {
  const { t, theme } = useTheme()
  const colour = hueOf(t, thread.hue)
  const [hover, setHover] = useState(false)
  const ring = armed ? colour : alpha(t.textPrimary, hover ? 0.16 : 0.08)
  const liveRules = thread.rules.filter((r) => !r.retired_at).length
  // A low-alpha tint reads fine over an opaque card, but this block floats
  // straight on the canvas — blended at 10% it was mixing with the shell
  // behind it, not with paper, so light mode read as near-black text on a
  // near-black block. color-mix against the theme's own card tone keeps it
  // opaque and legible in both themes; dark mode is left exactly as it was.
  const background = theme === 'light' ? `color-mix(in srgb, ${colour} 16%, ${t.cardBg})` : t.cardBg

  return (
    <div
      data-hold
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: HUB_W, height: HUB_H, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px',
        background, borderRadius: radius.widget,
        // Separate longhands, not the `border` shorthand plus a `borderLeft`
        // override — mixing the two triggers React's "conflicting style
        // property" warning on every rerender.
        borderStyle: 'solid', borderWidth: '1px 1px 1px 3px', borderColor: `${ring} ${ring} ${ring} ${colour}`,
        boxShadow: armed ? `0 0 0 3px ${alpha(colour, 0.18)}, ${t.shadow}` : t.shadow,
        transition: 'border-color 140ms ease, box-shadow 140ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
        <button
          type="button"
          onClick={onOpen}
          title={thread.name || 'open this thread'}
          style={{
            ...canvasType.label, color: t.textPrimary, background: 'none', border: 'none',
            padding: 0, flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 600,
          }}
        >
          {thread.name || 'Untitled thread'}
        </button>
        {!disabled && (
          <div style={{ display: 'flex', gap: 1, flexShrink: 0, opacity: hover || armed ? 1 : 0, transition: 'opacity 140ms ease' }}>
            <HubAct label={armed ? 'Stop connecting' : 'Connect it to another piece'} tone={armed ? colour : t.textMuted} onClick={onConnect}>
              <circle cx="6" cy="12" r="2.6" />
              <circle cx="18" cy="12" r="2.6" />
              <line x1="8.6" y1="12" x2="15.4" y2="12" />
            </HubAct>
            <HubAct label="Delete this thread" tone={t.textMuted} onClick={onRemove}>
              <path d="M6 6l12 12M18 6L6 18" />
            </HubAct>
          </div>
        )}
      </div>
      <p
        onClick={onOpen}
        style={{
          ...canvasType.small, fontSize: 12, lineHeight: 1.35, margin: 0, cursor: 'pointer',
          color: thread.intent ? t.textSecondary : t.textMuted,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}
      >
        {thread.intent || 'What does it hold across the work?'}
      </p>
      <span style={{ ...canvasType.chip, color: t.textMuted, marginTop: 'auto' }}>
        {liveRules || 'no'} {liveRules === 1 ? 'rule' : 'rules'}
      </span>
    </div>
  )
}

function HubAct({ label, tone, onClick, children }: { label: string; tone: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        width: 20, height: 20, borderRadius: 6, padding: 0, border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', color: tone, cursor: 'pointer',
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
        {children}
      </svg>
    </button>
  )
}

// ── where a thread's line touches down on a piece ───────────────────────────

function Marker({
  thread, left, note, deep, onOpen,
}: {
  thread: Thread
  left: number
  note: string
  deep: boolean
  onOpen: () => void
}) {
  const { t } = useTheme()
  const colour = hueOf(t, thread.hue)
  const title = note
    ? `${thread.name || 'a thread'}: ${note}`
    : deep
      ? `${thread.name || 'a thread'} — inside this piece`
      : thread.name || 'a thread'
  return (
    <button
      data-hold
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen() }}
      onPointerDown={(e) => e.stopPropagation()}
      title={title}
      aria-label={title}
      style={{
        position: 'absolute', left, bottom: -6, width: 12, height: 12, marginLeft: -6,
        borderRadius: '50%', padding: 0, cursor: 'pointer',
        background: deep ? t.cardBg : colour,
        border: `1.5px solid ${colour}`,
      }}
    />
  )
}

// ── what the board says while you are connecting ────────────────────────────

function ConnectBanner({ thread, onCancel }: { thread: Thread; onCancel: () => void }) {
  const { t } = useTheme()
  const colour = hueOf(t, thread.hue)
  return (
    <div
      data-hold
      style={{
        position: 'absolute', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 7,
        display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap',
        padding: '8px 10px 8px 14px', borderRadius: 999,
        background: 'rgba(13,12,11,0.84)', backdropFilter: 'blur(18px) saturate(1.1)',
        border: `1px solid ${alpha(colour, 0.5)}`,
      }}
    >
      <i aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: colour }} />
      <span style={{ ...canvasType.small, fontSize: 12.5, color: shell.text }}>
        Pick the piece <strong style={{ color: colour, fontWeight: 600 }}>{thread.name || 'this thread'}</strong> runs through next
      </span>
      <button
        type="button"
        onClick={onCancel}
        style={{ ...canvasType.chip, color: shell.muted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px' }}
      >
        esc
      </button>
    </div>
  )
}

/** The one place the board argues with you. */
function EverywhereDialog({
  thread, onConstraint, onAnyway, onCancel,
}: {
  thread: Thread
  onConstraint: () => void
  onAnyway: () => void
  onCancel: () => void
}) {
  const { t } = useTheme()
  const name = thread.name || 'this thread'
  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, background: 'rgba(10,9,8,0.78)', backdropFilter: 'blur(6px)',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={`${name} would run through everything`}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 440, padding: 24, borderRadius: radius.card,
          background: t.containerBg, boxShadow: t.containerShadow,
        }}
      >
        <h2 style={{ ...canvasType.headingMd, fontSize: 20, color: t.textPrimary, margin: 0 }}>
          That is every piece.
        </h2>
        <p style={{ ...canvasType.small, color: t.textSecondary, margin: '10px 0 0' }}>
          A thread is something that runs through <em>some</em> of the work — the gaps are what make it
          worth drawing. <strong style={{ color: t.textPrimary, fontWeight: 600 }}>{name}</strong> would now
          be on all of it, which usually means it is not a thread at all but a rule the whole project is
          working under.
        </p>
        <p style={{ ...canvasType.small, color: t.textMuted, margin: '10px 0 0' }}>
          As a constraint it is checked at every boundary, instead of being drawn under every piece.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
          <Choice onClick={onCancel} quiet>Leave it</Choice>
          <Choice onClick={onAnyway} quiet>Connect it anyway</Choice>
          <Choice onClick={onConstraint}>Make it a constraint</Choice>
        </div>
      </div>
    </div>
  )
}

function Choice({ onClick, quiet = false, children }: { onClick: () => void; quiet?: boolean; children: React.ReactNode }) {
  const { t } = useTheme()
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...canvasType.small, fontSize: 13, padding: '9px 14px', borderRadius: radius.field, cursor: 'pointer',
        border: quiet ? `1px solid ${alpha(t.textPrimary, 0.16)}` : 'none',
        background: quiet ? 'transparent' : t.inverseBg,
        color: quiet ? t.textSecondary : t.inverseText,
      }}
    >
      {children}
    </button>
  )
}
