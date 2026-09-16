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
import { VisionBlock, VISION_COLLAPSED_H, VISION_EXPANDED_H, VISION_W } from '@/components/work/vision-block'
import { hueOf } from '@/components/work/bits'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'
import type { Appearance, Rule, Thread, ThreadTag, TreeNode } from '@/lib/studio/node-types'
import {
  MARGIN, growWorld, laneCardWidth, laneSlot, packRow, smoothPath, toWorld, type Point,
} from '@/lib/studio/surface'

const GAP = 44
const BASE_CARD_TOP = 108
const WEB_GAP = 46      // space between the cards and the web below them
const HUB_W = 208
const HUB_H = 68
const HUB_GAP = 30
const MARKER_SPACING = 16  // how far apart two connection points sit on one card's edge

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

type Drag = { kind: 'piece' | 'hub' | 'vision'; id: string; at: Point }

export function Board({
  project,
  pieces,
  threads,
  tagFor,
  appearancesFor,
  actions,
  disabled = false,
}: {
  project: BoardProject
  pieces: TreeNode[]
  threads: Thread[]
  tagFor: (nodeId: string, threadId: string) => ThreadTag | undefined
  appearancesFor: (threadId: string) => Appearance[]
  actions: BoardActions
  disabled?: boolean
}) {
  const { t } = useTheme()
  const ref = useRef<HTMLDivElement | null>(null)
  const frame = useFrame(ref)

  const [drag, setDrag] = useState<Drag | null>(null)
  const [arming, setArming] = useState<string | null>(null)
  const [asking, setAsking] = useState<{ thread: Thread; toId: string } | null>(null)
  const [openThread, setOpenThread] = useState<string | null>(null)
  const [visionOpen, setVisionOpen] = useState(false)

  const cardW = frame.w ? laneCardWidth(frame.w, GAP) : 520
  const cardH = frame.h ? Math.round(Math.min(560, Math.max(340, frame.h * 0.5))) : 420

  const visionH = visionOpen ? VISION_EXPANDED_H : VISION_COLLAPSED_H
  const visionMoved = project.vision_x !== null || project.vision_y !== null
  // Pieces clear the vision block's default spot only while it is still
  // sitting there — drag it away and the lane is free to sit higher again.
  const cardTop = visionMoved ? BASE_CARD_TOP : Math.max(BASE_CARD_TOP, MARGIN + visionH + GAP)
  const cardX = useCallback((i: number) => laneSlot(i, cardW, GAP), [cardW])

  /** Where a piece actually is right now: hand-placed, mid-drag, or in lane. */
  const pieceAt = useCallback((piece: TreeNode, i: number): Point => {
    if (drag?.kind === 'piece' && drag.id === piece.id) return drag.at
    return { x: piece.board_x ?? cardX(i), y: piece.board_y ?? cardTop }
  }, [drag, cardX, cardTop])

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
    w = growWorld(w, visionAt.x, visionAt.y, VISION_W, visionH)
    for (const [i, piece] of pieces.entries()) {
      const at = pieceAt(piece, i)
      w = growWorld(w, at.x, at.y, cardW, cardH)
    }
    for (const th of hubs) {
      const at = hubAt(th)
      w = growWorld(w, at.x, at.y, HUB_W, HUB_H)
    }
    return w
  }, [frame, pieces, cardW, cardH, hubs, hubAt, hubRight, pieceAt, visionAt, visionH])

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
        ariaLabel="the board — the pieces of this project and the threads under them"
        chrome={
          <>
            <ZoomPill canvas={canvas} after={!disabled && <RearrangeButton onClick={rearrange} />} />
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
          onPointerDown={beginDrag('vision', 'vision', visionAt, (at) => actions.moveVision(at))}
          style={{ position: 'absolute', left: visionAt.x, top: visionAt.y, cursor: disabled ? 'default' : 'grab', touchAction: 'none' }}
        >
          <VisionBlock
            title={project.title}
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

        {/* the pieces */}
        {pieces.map((piece, i) => {
          const targeted = Boolean(armedOn && !armedOn.has(piece.id))
          const at = pieceAt(piece, i)
          return (
            <div
              key={piece.id}
              onPointerDown={beginDrag('piece', piece.id, at, (landed) => actions.movePiece(piece.id, landed))}
              style={{
                position: 'absolute', left: at.x, top: at.y, width: cardW, height: cardH,
                cursor: disabled ? 'default' : 'grab', touchAction: 'none',
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
                  aria-label={`run ${armedThread?.name || 'this thread'} through ${piece.title || 'this piece'}`}
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
              style={{ position: 'absolute', left: at.x, top: at.y, cursor: disabled ? 'default' : 'grab', touchAction: 'none' }}
            >
              <Hub
                thread={th}
                count={presence.get(th.id)?.roots.size ?? 0}
                total={pieces.length}
                armed={arming === th.id}
                disabled={disabled}
                onOpen={() => setOpenThread(th.id)}
                onConnect={() => arm(th)}
                onRemove={() => actions.removeThread(th.id)}
              />
            </div>
          )
        })}

        {!disabled && (
          <button
            data-hold
            type="button"
            aria-label="add a thread to this project"
            title="add a thread"
            onClick={() => void addNewThread()}
            style={{
              position: 'absolute', left: hubRight + GAP, top: webTop, width: HUB_W, height: HUB_H,
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
        )}

        {/* one more piece */}
        {!disabled && (
          <div style={{ position: 'absolute', left: cardX(pieces.length), top: cardTop, width: Math.min(cardW, 260) }}>
            <button
              data-hold
              type="button"
              aria-label="add a piece to this project"
              title="add a piece"
              onClick={actions.addPiece}
              style={{
                width: '100%', height: cardH,
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
              <p style={{ ...canvasType.small, color: shell.muted, margin: '14px 0 0', textAlign: 'center' }}>
                A piece is one whole thing — a film, a chapter, a song, an essay.
              </p>
            )}
          </div>
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
      aria-label="rearrange everything neatly"
      title="rearrange everything neatly"
      onClick={onClick}
      style={{
        width: 26, height: 26, borderRadius: 999, padding: 0, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', border: 'none', color: shell.muted,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
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
  thread, count, total, armed, disabled, onOpen, onConnect, onRemove,
}: {
  thread: Thread
  count: number
  total: number
  armed: boolean
  disabled: boolean
  onOpen: () => void
  onConnect: () => void
  onRemove: () => void
}) {
  const { t } = useTheme()
  const colour = hueOf(t, thread.hue)
  const [hover, setHover] = useState(false)
  const ring = armed ? colour : alpha(t.textPrimary, hover ? 0.16 : 0.08)

  return (
    <div
      data-hold
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: HUB_W, height: HUB_H, boxSizing: 'border-box',
        display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px',
        background: t.cardBg, borderRadius: radius.widget,
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
          title={thread.intent || 'open this thread'}
          style={{
            ...canvasType.label, color: t.textPrimary, background: 'none', border: 'none',
            padding: 0, flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 600,
          }}
        >
          {thread.name || 'untitled thread'}
        </button>
        {!disabled && (
          <div style={{ display: 'flex', gap: 1, flexShrink: 0, opacity: hover || armed ? 1 : 0, transition: 'opacity 140ms ease' }}>
            <HubAct label={armed ? 'stop connecting' : 'connect it to another piece'} tone={armed ? colour : t.textMuted} onClick={onConnect}>
              <circle cx="6" cy="12" r="2.6" />
              <circle cx="18" cy="12" r="2.6" />
              <line x1="8.6" y1="12" x2="15.4" y2="12" />
            </HubAct>
            <HubAct label="delete this thread" tone={t.textMuted} onClick={onRemove}>
              <path d="M6 6l12 12M18 6L6 18" />
            </HubAct>
          </div>
        )}
      </div>
      <span style={{ ...canvasType.chip, color: t.textMuted }}>
        {count} of {total} {total === 1 ? 'piece' : 'pieces'}
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
        pick the piece <strong style={{ color: colour, fontWeight: 600 }}>{thread.name || 'this thread'}</strong> runs through next
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
          <Choice onClick={onCancel} quiet>leave it</Choice>
          <Choice onClick={onAnyway} quiet>connect it anyway</Choice>
          <Choice onClick={onConstraint}>make it a constraint</Choice>
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
