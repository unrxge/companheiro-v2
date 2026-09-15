'use client'

// studio/src/components/work/board.tsx — level 2, the board.
//
// The pieces of one project, laid across a bounded canvas in reading order,
// and under each one its spine: a line dropping from the piece with a branch
// for every thread hanging off it — the anchor lines, the constraints, the
// things not to forget.
//
// A thread keeps the same row on every spine, so when it runs from one piece
// to the next you see the line actually cross the gap, and where it stops you
// see it stop. That gap is the whole reason this view exists.
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
import { MARGIN, laneCardWidth, laneSlot } from '@/lib/studio/surface'

const GAP = 44
const CARD_TOP = 108
const SPINE_GAP = 26
const SPINE_HEAD = 20
const ROW_H = 44
const TRUNK_DX = 28
const BRANCH = 22
const SPINE_TAIL = 44

export interface BoardActions {
  openPiece: (id: string, from: HTMLElement | null) => void
  addPiece: () => void
  removePiece: (piece: TreeNode) => void
  renamePiece: (id: string, title: string) => void
  reorder: (ids: string[]) => void
  /** Makes one and hangs it here; returns its id so the board can open it. */
  addThread: (onNode: string) => Promise<string | null>
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

  const [arming, setArming] = useState<{ threadId: string; fromId: string } | null>(null)
  const [asking, setAsking] = useState<{ thread: Thread; toId: string } | null>(null)
  const [openThread, setOpenThread] = useState<string | null>(null)

  const cardW = frame.w ? laneCardWidth(frame.w, GAP) : 520
  const cardH = frame.h ? Math.round(Math.min(560, Math.max(340, frame.h * 0.5))) : 420

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

  /** One row per thread that is actually on the board, in thread order, so a
   *  thread sits at the same height above every piece it touches. */
  const rows = useMemo(
    () => threads.filter((th) => (presence.get(th.id)?.roots.size ?? 0) > 0),
    [threads, presence],
  )
  const rowOf = useMemo(() => new Map(rows.map((th, i) => [th.id, i])), [rows])

  const spineH = SPINE_HEAD + rows.length * ROW_H + SPINE_TAIL
  const world = useMemo(() => ({
    w: Math.max(frame.w || 0, MARGIN * 2 + (pieces.length + 1) * (cardW + GAP)),
    h: Math.max(frame.h || 0, CARD_TOP + cardH + SPINE_GAP + spineH + MARGIN),
  }), [frame, pieces.length, cardW, cardH, spineH])

  const canvas = useCanvas(ref, frame, world)

  const rowY = useCallback(
    (threadId: string) => CARD_TOP + cardH + SPINE_GAP + SPINE_HEAD + (rowOf.get(threadId) ?? 0) * ROW_H + ROW_H / 2,
    [cardH, rowOf],
  )
  const cardX = useCallback((i: number) => laneSlot(i, cardW, GAP), [cardW])

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

  /** Arming a connection carries the view to the nearest piece that could take
   *  it — otherwise the only thing you can click is off the side of the glass. */
  const arm = useCallback((th: Thread, fromId: string) => {
    if (arming?.threadId === th.id) { setArming(null); return }
    setArming({ threadId: th.id, fromId })
    const on = presence.get(th.id)?.roots ?? new Set<string>()
    const here = pieces.findIndex((p) => p.id === fromId)
    const open = pieces.map((p, i) => (on.has(p.id) ? -1 : i)).filter((i) => i >= 0)
    if (open.length === 0) return
    const nearest = open.reduce((best, i) => (Math.abs(i - here) < Math.abs(best - here) ? i : best), open[0])
    // Sideways only: the spines must not jump up and down while you are aiming.
    const holdY = (canvas.frame.h / 2 - canvas.pan.y) / canvas.zoom
    canvas.glideTo({ x: cardX(nearest) + cardW / 2, y: holdY })
  }, [arming, canvas, cardW, cardX, pieces, presence])

  /** Finishing a connection. Everything about the "all but one" rule is here. */
  const connectTo = useCallback((piece: TreeNode) => {
    if (!arming) return
    const thread = threads.find((th) => th.id === arming.threadId)
    setArming(null)
    if (!thread) return
    const on = presence.get(thread.id)?.roots ?? new Set<string>()
    const wouldBeEverywhere = pieces.length > 1 && !on.has(piece.id) && on.size + 1 >= pieces.length
    if (wouldBeEverywhere) { setAsking({ thread, toId: piece.id }); return }
    actions.tag(piece.id, thread.id)
  }, [actions, arming, pieces.length, presence, threads])

  const armedThread = arming ? threads.find((th) => th.id === arming.threadId) ?? null : null
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
              <ConnectBanner
                thread={armedThread}
                onCancel={() => setArming(null)}
              />
            )}
          </>
        }
      >
        {/* every line on the board, drawn once, under everything */}
        <svg
          width={world.w}
          height={world.h}
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
          aria-hidden
        >
          {pieces.map((piece, i) => {
            const mine = rows.filter((th) => presence.get(th.id)?.roots.has(piece.id))
            const x = cardX(i) + TRUNK_DX
            const top = CARD_TOP + cardH + SPINE_GAP
            const last = mine.length ? rowY(mine[mine.length - 1].id) : top + SPINE_HEAD
            return (
              <g key={piece.id}>
                <line
                  x1={x} y1={top} x2={x} y2={last + 16}
                  stroke={alpha(t.textPrimary, 0.3)} strokeWidth={1.5} strokeLinecap="round"
                />
                {mine.map((th) => (
                  <line
                    key={th.id}
                    x1={x} y1={rowY(th.id)} x2={x + BRANCH} y2={rowY(th.id)}
                    stroke={alpha(hueOf(t, th.hue), 0.7)} strokeWidth={1.5} strokeLinecap="round"
                  />
                ))}
              </g>
            )
          })}

          {/* a thread crossing from one piece to the next */}
          {rows.map((th) => {
            const on = presence.get(th.id)?.roots ?? new Set<string>()
            const at = pieces.map((p, i) => (on.has(p.id) ? i : -1)).filter((i) => i >= 0)
            const y = rowY(th.id)
            const colour = hueOf(t, th.hue)
            return at.slice(0, -1).map((a, n) => {
              const b = at[n + 1]
              const x1 = cardX(a) + cardW - 18
              const x2 = cardX(b) + TRUNK_DX
              if (x2 <= x1) return null
              const dip = Math.min(18, (x2 - x1) / 8)
              return (
                <path
                  key={`${th.id}-${a}-${b}`}
                  d={`M ${x1} ${y} Q ${(x1 + x2) / 2} ${y + dip} ${x2} ${y}`}
                  fill="none"
                  stroke={alpha(colour, 0.5)}
                  strokeWidth={1.5}
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
            </div>
          )
        })}

        {/* the spines: one row per thread, at the same height on every piece */}
        {pieces.map((piece, i) => {
          const mine = rows.filter((th) => presence.get(th.id)?.roots.has(piece.id))
          const top = CARD_TOP + cardH + SPINE_GAP
          const lastY = mine.length ? rowY(mine[mine.length - 1].id) : top + SPINE_HEAD
          return (
            <div key={`spine-${piece.id}`}>
              {mine.map((th) => {
                const here = presence.get(th.id)!
                const tag = tagFor(piece.id, th.id)
                return (
                  <Branch
                    key={th.id}
                    thread={th}
                    note={tag?.note ?? ''}
                    deep={!here.direct.has(piece.id)}
                    left={cardX(i) + TRUNK_DX + BRANCH + 8}
                    top={rowY(th.id) - ROW_H / 2}
                    width={cardW - TRUNK_DX - BRANCH - 28}
                    armed={arming?.threadId === th.id}
                    disabled={disabled}
                    onOpen={() => setOpenThread(th.id)}
                    onNote={(note) => actions.tag(piece.id, th.id, note)}
                    onConnect={() => arm(th, piece.id)}
                    onDetach={() => actions.untag(piece.id, th.id)}
                  />
                )
              })}
              {!disabled && (
                <HangThread
                  left={cardX(i) + TRUNK_DX - 11}
                  top={lastY + (mine.length ? 22 : 4)}
                  onClick={() => { void actions.addThread(piece.id).then((id) => { if (id) setOpenThread(id) }) }}
                />
              )}
            </div>
          )
        })}

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
          disabled={disabled}
          onClose={() => setOpenThread(null)}
          onEdit={(patch) => actions.editThread(openThread, patch)}
          onTag={(nodeId) => actions.tag(nodeId, openThread)}
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

// ── one branch off one spine ────────────────────────────────────────────────

function Branch({
  thread, note, deep, left, top, width, armed, disabled, onOpen, onNote, onConnect, onDetach,
}: {
  thread: Thread
  note: string
  /** It is on something inside this piece, not on the piece itself. */
  deep: boolean
  left: number
  top: number
  width: number
  armed: boolean
  disabled: boolean
  onOpen: () => void
  onNote: (note: string) => void
  onConnect: () => void
  onDetach: () => void
}) {
  const { t } = useTheme()
  const colour = hueOf(t, thread.hue)
  const [hover, setHover] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(note)
  useEffect(() => { if (!editing) setDraft(note) }, [note, editing])

  const commit = () => {
    setEditing(false)
    if (draft.trim() !== note.trim()) onNote(draft.trim())
  }

  return (
    <div
      data-hold
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute', left, top, width, height: ROW_H,
        display: 'flex', alignItems: 'center', gap: 8, minWidth: 0,
      }}
    >
      <i
        aria-hidden
        style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: deep ? 'transparent' : colour,
          border: `1.5px solid ${colour}`,
        }}
      />
      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <button
          type="button"
          onClick={onOpen}
          title={thread.intent || 'open this thread'}
          style={{
            ...canvasType.label, color: colour, background: 'none', border: 'none',
            padding: 0, textAlign: 'left', cursor: 'pointer',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {thread.name || 'untitled thread'}
        </button>
        {editing ? (
          <input
            autoFocus
            aria-label={`what ${thread.name || 'this thread'} is doing here`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') { setDraft(note); setEditing(false) }
            }}
            style={{
              ...canvasType.small, fontSize: 12, color: t.textPrimary, background: 'transparent',
              border: 'none', outline: 'none', padding: 0, width: '100%',
            }}
          />
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setEditing(true)}
            style={{
              ...canvasType.small, fontSize: 12, color: note ? t.textSecondary : alpha(t.textPrimary, 0.3),
              background: 'none', border: 'none', padding: 0, textAlign: 'left',
              cursor: disabled ? 'default' : 'text',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}
          >
            {note || (deep ? 'inside this piece' : 'say what it does here…')}
          </button>
        )}
      </div>

      {!disabled && (
        <div style={{ display: 'flex', gap: 1, flexShrink: 0, opacity: hover || armed ? 1 : 0, transition: 'opacity 140ms ease' }}>
          <Nub
            label={armed ? 'stop connecting' : 'run this thread through another piece'}
            tone={armed ? colour : t.textMuted}
            onClick={onConnect}
          >
            <circle cx="6" cy="12" r="2.6" />
            <circle cx="18" cy="12" r="2.6" />
            <line x1="8.6" y1="12" x2="15.4" y2="12" />
          </Nub>
          <Nub label="take it off this piece" tone={t.textMuted} onClick={onDetach}>
            <path d="M7 7l10 10M17 7L7 17" />
          </Nub>
        </div>
      )}
    </div>
  )
}

function Nub({ label, tone, onClick, children }: { label: string; tone: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={{
        width: 22, height: 22, borderRadius: 6, padding: 0, border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'transparent', color: tone, cursor: 'pointer',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
        {children}
      </svg>
    </button>
  )
}

function HangThread({ left, top, onClick }: { left: number; top: number; onClick: () => void }) {
  const { t } = useTheme()
  const [hover, setHover] = useState(false)
  return (
    <button
      data-hold
      type="button"
      aria-label="hang a thread on this piece"
      title="hang a thread on this piece"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'absolute', left, top, width: 22, height: 22, borderRadius: 999, padding: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        border: `1px dashed ${alpha(t.textPrimary, hover ? 0.4 : 0.2)}`,
        background: hover ? alpha(t.textPrimary, 0.06) : 'transparent',
        color: hover ? t.textSecondary : t.textMuted,
        transition: 'border-color 140ms ease, background 140ms ease',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    </button>
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
