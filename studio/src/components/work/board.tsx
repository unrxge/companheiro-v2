'use client'

// studio/src/components/work/board.tsx — level 2, the board.
//
// The pieces of one project, laid across a bounded canvas in reading order.
// What runs across them is drawn underneath as a web: one block per thread,
// with a line running from it to every piece it touches. A thread that
// appears on three pieces is one block, not three copies of the same branch —
// the repetition that used to sit under every card is gone.
//
// One rule has teeth here: a thread connected to every single piece is not a
// thread any more, it is a constraint on the project, and the board says so
// before it lets you finish the last connection.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { Surface, ZoomPill, useCanvas, useFrame } from '@/components/surface/surface'
import { PieceCard } from '@/components/work/piece-card'
import { ThreadCard } from '@/components/work/thread-card'
import { hueOf } from '@/components/work/bits'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'
import type { Appearance, Thread, ThreadTag, TreeNode } from '@/lib/studio/node-types'
import { MARGIN, laneCardWidth, laneSlot, packRow } from '@/lib/studio/surface'

const GAP = 44
const CARD_TOP = 108
const WEB_GAP = 46      // space between the cards and the web below them
const HUB_W = 208
const HUB_H = 68
const HUB_GAP = 30
const MARKER_SPACING = 16  // how far apart two connection points sit on one card's edge

export interface BoardActions {
  openPiece: (id: string, from: HTMLElement | null) => void
  addPiece: () => void
  removePiece: (piece: TreeNode) => void
  renamePiece: (id: string, title: string) => void
  reorder: (ids: string[]) => void
  /** Makes a new, unattached thread. Opened straight away so it can be named
   *  and connected to its first pieces from the checklist. */
  addThread: () => Promise<Thread | null>
  editThread: (id: string, patch: Partial<Thread>) => void
  removeThread: (id: string) => void
  tag: (nodeId: string, threadId: string, note?: string) => void
  untag: (nodeId: string, threadId: string) => void
  /** The thread runs through everything; keep it as a rule on the project. */
  makeConstraint: (thread: Thread) => void
  /** Read every appearance of the thread in order, one level down. */
  readThread: (id: string) => void
}

export function Board({
  pieces,
  threads,
  tagFor,
  appearancesFor,
  actions,
  disabled = false,
}: {
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

  const [arming, setArming] = useState<string | null>(null)
  const [asking, setAsking] = useState<{ thread: Thread; toId: string } | null>(null)
  const [openThread, setOpenThread] = useState<string | null>(null)

  const cardW = frame.w ? laneCardWidth(frame.w, GAP) : 520
  const cardH = frame.h ? Math.round(Math.min(560, Math.max(340, frame.h * 0.5))) : 420
  const cardX = useCallback((i: number) => laneSlot(i, cardW, GAP), [cardW])
  const cardCenterX = useCallback((i: number) => cardX(i) + cardW / 2, [cardX, cardW])

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

  /** Each hub sits near the average position of the pieces it touches, so the
   *  web reads as threads reaching toward their pieces rather than a legend
   *  with no relationship to what is on screen. packRow keeps them from
   *  landing on top of one another when their pieces overlap. */
  const hubX = useMemo(() => {
    const preferred = hubs.map((th) => {
      const on = presence.get(th.id)?.roots ?? new Set<string>()
      const xs = pieces.map((p, i) => (on.has(p.id) ? cardCenterX(i) : null)).filter((x): x is number => x !== null)
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : MARGIN + HUB_W / 2
    })
    const packed = packRow(preferred, HUB_W + HUB_GAP)
    const map = new Map<string, number>()
    hubs.forEach((th, i) => map.set(th.id, Math.max(MARGIN, packed[i] - HUB_W / 2)))
    return map
  }, [hubs, presence, pieces, cardCenterX])

  const hubRight = hubs.length ? Math.max(...hubs.map((th) => (hubX.get(th.id) ?? 0) + HUB_W)) : MARGIN
  const webTop = CARD_TOP + cardH + WEB_GAP

  const world = useMemo(() => ({
    w: Math.max(frame.w || 0, MARGIN * 2 + (pieces.length + 1) * (cardW + GAP), hubRight + HUB_W + GAP + MARGIN),
    h: Math.max(frame.h || 0, webTop + HUB_H + MARGIN),
  }), [frame, pieces.length, cardW, hubRight, webTop])

  const canvas = useCanvas(ref, frame, world)

  /** Where each piece's connection points land along its own bottom edge —
   *  one per thread touching it, ordered the same as the hubs across the
   *  board, fanned out so two threads on one card do not draw on top of
   *  each other. */
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

  /** Arming a connection carries the view toward the nearest piece that could
   *  take it — otherwise the only thing you can click is off the side of the
   *  glass. */
  const arm = useCallback((th: Thread) => {
    if (arming === th.id) { setArming(null); return }
    setArming(th.id)
    const on = presence.get(th.id)?.roots ?? new Set<string>()
    const open = pieces.map((p, i) => (on.has(p.id) ? -1 : i)).filter((i) => i >= 0)
    const anchorX = hubX.get(th.id)
    if (open.length === 0 || anchorX === undefined) return
    const hubCenter = anchorX + HUB_W / 2
    const nearest = open.reduce(
      (best, i) => (Math.abs(cardCenterX(i) - hubCenter) < Math.abs(cardCenterX(best) - hubCenter) ? i : best),
      open[0],
    )
    // Sideways only: the web must not jump up and down while you are aiming.
    const holdY = (canvas.frame.h / 2 - canvas.pan.y) / canvas.zoom
    canvas.glideTo({ x: cardCenterX(nearest), y: holdY })
  }, [arming, canvas, cardCenterX, hubX, pieces, presence])

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
            <ZoomPill canvas={canvas} />
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
            const hx = (hubX.get(th.id) ?? 0) + HUB_W / 2
            const hy = webTop
            const colour = hueOf(t, th.hue)
            const here = presence.get(th.id)!
            return pieces.map((piece, i) => {
              if (!here.roots.has(piece.id)) return null
              const marker = markersFor(piece.id).find((m) => m.thread.id === th.id)
              const ex = cardCenterX(i) + (marker?.dx ?? 0)
              const ey = CARD_TOP + cardH
              const midY = (ey + hy) / 2
              const deep = !here.direct.has(piece.id)
              return (
                <path
                  key={`${th.id}-${piece.id}`}
                  d={`M ${ex} ${ey} C ${ex} ${midY} ${hx} ${midY} ${hx} ${hy}`}
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

        {/* the pieces */}
        {pieces.map((piece, i) => {
          const targeted = Boolean(armedOn && !armedOn.has(piece.id))
          return (
            <div
              key={piece.id}
              style={{ position: 'absolute', left: cardX(i), top: CARD_TOP, width: cardW, height: cardH }}
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
        {hubs.map((th) => (
          <Hub
            key={th.id}
            thread={th}
            left={hubX.get(th.id) ?? 0}
            top={webTop}
            count={presence.get(th.id)?.roots.size ?? 0}
            total={pieces.length}
            armed={arming === th.id}
            disabled={disabled}
            onOpen={() => setOpenThread(th.id)}
            onConnect={() => arm(th)}
            onRemove={() => actions.removeThread(th.id)}
          />
        ))}

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
          <button
            data-hold
            type="button"
            aria-label="add a piece to this project"
            title="add a piece"
            onClick={actions.addPiece}
            style={{
              position: 'absolute', left: cardX(pieces.length), top: CARD_TOP,
              width: Math.min(cardW, 260), height: cardH,
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

// ── the block that stands for one thread ────────────────────────────────────

function Hub({
  thread, left, top, count, total, armed, disabled, onOpen, onConnect, onRemove,
}: {
  thread: Thread
  left: number
  top: number
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
        position: 'absolute', left, top, width: HUB_W, height: HUB_H, boxSizing: 'border-box',
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
      onClick={onClick}
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
      onClick={onOpen}
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
