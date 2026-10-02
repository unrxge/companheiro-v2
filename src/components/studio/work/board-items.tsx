'use client'

// What a piece's "+" can put on the board besides a thread: an image, a
// recording, a task list. The board (board.tsx) decides where each one sits
// and draws the line back to its pieces; this file is what they look like
// and how they are used once they are there.
//
// Nothing here is read by the companion. A picture and a recording are for
// the person's own eyes and ears.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { GhostButton, PrimaryButton, QuietButton } from '@/components/ui/buttons'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import {
  canResize, isWritingTask, RECORDING_H,
  type BoardItem, type BoardItemContent, type BoardItemKind, type OwnTask, type ProjectTask,
} from '@/lib/studio/board-items'
import type { AssetView } from '@/lib/studio/types'
import { OTHER, categoryOf, groupTasks } from '@/lib/studio/task-groups'

// ── the menu a piece's "+" opens ────────────────────────────────────────────

export type PlusChoice = 'thread' | BoardItemKind

interface PlusOption { key: PlusChoice; label: string; hint: string; icon: ReactNode }

const stroke = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)

const PLUS_OPTIONS: PlusOption[] = [
  { key: 'thread', label: 'A thread', hint: 'Something that runs through some of the pieces', icon: stroke(<><circle cx="6" cy="6" r="2.4" /><circle cx="18" cy="18" r="2.4" /><path d="M8 8c6 0 2 8 8 8" /></>) },
  { key: 'tasks', label: 'A task list', hint: 'The writing tasks, and anything else to do', icon: stroke(<><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8.5 12l2.2 2.2L15.5 9.5" /></>) },
  { key: 'image', label: 'An image', hint: 'A picture beside the words', icon: stroke(<><rect x="3.5" y="5" width="17" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l5-4.5 3.5 3 3-2.5 4.5 4" /></>) },
  { key: 'recording', label: 'A recording', hint: 'Your voice, or a sound you already have', icon: stroke(<><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></>) },
]

/**
 * Opens under the "+" it came from. `available` are the kinds this canvas
 * can make at all; `locked` are the ones the plan does not carry, shown with
 * the plan that does and answered by `onLocked` instead of `onPick`.
 */
export function PlusMenu({
  available, locked, onPick, onLocked, onClose,
}: {
  available: PlusChoice[]
  locked: PlusChoice[]
  onPick: (choice: PlusChoice) => void
  onLocked: (choice: PlusChoice) => void
  onClose: () => void
}) {
  const { t } = useTheme()
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // After this click has finished, or the press that opened it closes it.
    const id = window.setTimeout(() => window.addEventListener('pointerdown', away), 0)
    window.addEventListener('keydown', key)
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      data-hold
      role="menu"
      aria-label="Add to this piece"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', left: '50%', top: 'calc(100% + 24px)', transform: 'translateX(-50%)', zIndex: 5,
        width: 276, padding: 6, borderRadius: radius.widget,
        background: t.containerBg, boxShadow: t.containerShadow, border: `1px solid ${alpha(t.textPrimary, 0.08)}`,
      }}
    >
      {PLUS_OPTIONS.filter((o) => available.includes(o.key)).map((o) => {
        const isLocked = locked.includes(o.key)
        return (
          <button
            key={o.key}
            type="button"
            role="menuitem"
            onClick={() => (isLocked ? onLocked(o.key) : onPick(o.key))}
            className="plus-menu-row"
            style={{
              display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '9px 10px',
              background: 'none', border: 'none', borderRadius: radius.field, cursor: 'pointer', textAlign: 'left',
              color: isLocked ? t.textMuted : t.textPrimary,
            }}
          >
            <span style={{ flexShrink: 0, display: 'flex', color: isLocked ? t.textMuted : t.textSecondary }}>{o.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...canvasType.small, fontSize: 13.5, fontWeight: 600, display: 'block', color: 'inherit' }}>{o.label}</span>
              <span style={{ ...canvasType.small, fontSize: 12, lineHeight: 1.35, display: 'block', color: t.textMuted }}>{o.hint}</span>
            </span>
            {isLocked && (
              <span style={{ ...canvasType.chip, flexShrink: 0, padding: '2px 8px', borderRadius: 999, border: `1px solid ${alpha(t.textPrimary, 0.16)}`, color: t.textSecondary }}>
                Direction
              </span>
            )}
          </button>
        )
      })}
      <style>{`.plus-menu-row:hover, .plus-menu-row:focus-visible { background: ${alpha(t.textPrimary, 0.06)} !important; outline: none; }`}</style>
    </div>
  )
}

// ── the frame every item stands in ──────────────────────────────────────────

/**
 * The card, its two actions (connect to a piece, take off the board) and,
 * where the kind allows, the corner that resizes it. Reports its own height
 * so the board can keep room for it.
 */
export function ItemShell({
  item, width, label, born, armed, disabled, padded = true, onConnect, onRemove, onResizeStart, onHeight, children,
}: {
  item: BoardItem
  width: number
  /** What it is called in the buttons' names: "this image", "this task list". */
  label: string
  /** Just made from a piece's "+": grows out of it once. */
  born: boolean
  /** Being connected: the next piece clicked joins or leaves it. */
  armed: boolean
  disabled: boolean
  padded?: boolean
  onConnect: () => void
  onRemove: () => void
  onResizeStart?: (e: React.PointerEvent) => void
  onHeight: (h: number) => void
  children: ReactNode
}) {
  const { t } = useTheme()
  const ref = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState(false)
  const report = useRef(onHeight)
  report.current = onHeight

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => report.current(el.offsetHeight)
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const ring = armed ? t.tide : alpha(t.textPrimary, hover ? 0.16 : 0.08)
  const showTools = !disabled && (hover || armed)

  return (
    <div
      ref={ref}
      data-hold
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', width, boxSizing: 'border-box', overflow: 'hidden',
        padding: padded ? '12px 14px' : 0,
        background: t.cardBg, borderRadius: radius.widget, border: `1px solid ${ring}`,
        boxShadow: armed ? `0 0 0 3px ${alpha(t.tide, 0.18)}, ${t.shadow}` : t.shadow,
        transition: 'border-color 140ms ease, box-shadow 140ms ease',
        transformOrigin: 'top center',
        animation: born ? 'threadBorn 320ms cubic-bezier(0.16, 1, 0.3, 1) both' : undefined,
      }}
    >
      {children}

      <div
        style={{
          position: 'absolute', top: 6, right: 6, display: 'flex', gap: 2, padding: 2, borderRadius: 8,
          background: alpha(t.cardBg, 0.92), opacity: showTools ? 1 : 0, pointerEvents: showTools ? 'auto' : 'none',
          transition: 'opacity 140ms ease',
        }}
      >
        <ShellAct label={armed ? 'Stop connecting' : `Connect ${label} to a piece, or take it off one`} tone={armed ? t.tide : t.textMuted} onClick={onConnect}>
          <circle cx="6" cy="12" r="2.6" />
          <circle cx="18" cy="12" r="2.6" />
          <line x1="8.6" y1="12" x2="15.4" y2="12" />
        </ShellAct>
        <ShellAct label={`Remove ${label}`} tone={t.textMuted} onClick={onRemove}>
          <path d="M6 6l12 12M18 6L6 18" />
        </ShellAct>
      </div>

      {!disabled && onResizeStart && canResize(item.kind) && (
        <div
          role="separator"
          aria-label={`Resize ${label}`}
          title="Drag to resize"
          onPointerDown={onResizeStart}
          style={{
            position: 'absolute', right: 0, bottom: 0, width: 22, height: 22, cursor: 'nwse-resize', touchAction: 'none',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 4,
            opacity: hover ? 1 : 0.35, transition: 'opacity 140ms ease',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={item.kind === 'image' ? '#fff' : t.textMuted} strokeWidth={1.4} strokeLinecap="round" aria-hidden style={{ filter: item.kind === 'image' ? 'drop-shadow(0 0 2px rgba(0,0,0,0.7))' : undefined }}>
            <path d="M9 3L3 9M9 6.5L6.5 9" />
          </svg>
        </div>
      )}
    </div>
  )
}

function ShellAct({ label, tone, onClick, children }: { label: string; tone: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: 22, height: 22, borderRadius: 6, padding: 0, border: 'none',
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

/** A line of text that is typed straight on the card and kept when left. */
function CardField({
  value, placeholder, ariaLabel, disabled, onCommit, style,
}: {
  value: string
  placeholder: string
  ariaLabel: string
  disabled: boolean
  onCommit: (next: string) => void
  style?: React.CSSProperties
}) {
  const { t } = useTheme()
  const [draft, setDraft] = useState(value)
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setDraft(value) }, [value, focused])
  if (disabled) {
    return value ? <span style={{ ...canvasType.small, color: t.textSecondary, ...style }}>{value}</span> : null
  }
  return (
    <input
      aria-label={ariaLabel}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => { setFocused(false); if (draft.trim() !== value) onCommit(draft.trim()) }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      // Its own presses stay its own: the card around it is something you drag.
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        ...canvasType.small, width: '100%', minWidth: 0, boxSizing: 'border-box', color: t.textPrimary,
        background: 'transparent', border: 'none', outline: 'none', padding: 0, fontFamily: 'inherit', ...style,
      }}
    />
  )
}

// ── an image ────────────────────────────────────────────────────────────────

export function ImageBlock({
  item, asset, width, disabled, onCaption, onStale,
}: {
  item: BoardItem
  asset: AssetView | undefined
  width: number
  disabled: boolean
  onCaption: (caption: string) => void
  /** The address has run out (they last an hour): ask for a fresh one. */
  onStale: () => void
}) {
  const { t } = useTheme()
  const retried = useRef<string | null>(null)
  const ratio = asset?.width && asset?.height ? Math.min(2.5, Math.max(0.25, asset.height / asset.width)) : 0.75
  const caption = item.content.caption ?? ''
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width, height: Math.round(width * ratio), background: alpha(t.textPrimary, 0.06) }}>
        {asset?.url ? (
          // eslint-disable-next-line @next/next/no-img-element -- a private, signed address; nothing for the image optimiser to fetch
          <img
            src={asset.url}
            alt={caption || 'An image on this canvas'}
            draggable={false}
            onError={() => { if (retried.current !== asset.url) { retried.current = asset.url; onStale() } }}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', userSelect: 'none' }}
          />
        ) : (
          <div style={{ ...canvasType.small, color: t.textMuted, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            The image is no longer here.
          </div>
        )}
      </div>
      {(caption || !disabled) && (
        <figcaption style={{ padding: '8px 12px 9px' }}>
          <CardField value={caption} placeholder="Add a caption" ariaLabel="Caption" disabled={disabled} onCommit={onCaption} style={{ fontSize: 12.5 }} />
        </figcaption>
      )}
    </figure>
  )
}

// ── a recording ─────────────────────────────────────────────────────────────

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export function RecordingBlock({
  item, asset, disabled, onTitle, onStale,
}: {
  item: BoardItem
  asset: AssetView | undefined
  disabled: boolean
  onTitle: (title: string) => void
  onStale: () => void
}) {
  const { t } = useTheme()
  const audio = useRef<HTMLAudioElement | null>(null)
  const retried = useRef<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const length = asset?.duration_s ?? 0
  const bars = useMemo(() => (asset?.envelope?.length === 24 ? asset.envelope : Array.from({ length: 24 }, () => 0.35)), [asset?.envelope])
  const played = length > 0 ? Math.min(1, at / length) : 0

  const toggle = () => {
    const el = audio.current
    if (!el) return
    if (el.paused) void el.play().catch(() => setPlaying(false))
    else el.pause()
  }

  return (
    <div style={{ height: RECORDING_H - 26, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ paddingRight: 48 }}>
        <CardField
          value={item.content.title ?? ''}
          placeholder="Name this recording"
          ariaLabel="The recording’s name"
          disabled={disabled}
          onCommit={onTitle}
          style={{ fontSize: 13, fontWeight: 600 }}
        />
        {disabled && !item.content.title && <span style={{ ...canvasType.small, fontSize: 13, fontWeight: 600, color: t.textPrimary }}>A recording</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
        <button
          type="button"
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={(e) => { e.stopPropagation(); toggle() }}
          onPointerDown={(e) => e.stopPropagation()}
          disabled={!asset?.url}
          style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0, border: 'none', cursor: asset?.url ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center', background: t.inverseBg, color: t.inverseText,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            {playing ? <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></> : <path d="M8 5v14l11-7z" />}
          </svg>
        </button>
        <div aria-hidden style={{ flex: 1, minWidth: 0, height: 30, display: 'flex', alignItems: 'center', gap: 2 }}>
          {bars.map((b, i) => (
            <span
              key={i}
              style={{
                flex: 1, borderRadius: 2, height: `${Math.max(12, Math.round(b * 100))}%`,
                background: (i + 0.5) / bars.length <= played ? t.textPrimary : alpha(t.textPrimary, 0.22),
              }}
            />
          ))}
        </div>
        <span style={{ ...canvasType.chip, color: t.textMuted, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {clock(playing || at > 0 ? at : length)}
        </span>
      </div>
      {asset?.url && (
        <audio
          ref={audio}
          src={asset.url}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setAt(0) }}
          onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
          onError={() => { if (retried.current !== asset.url) { retried.current = asset.url; onStale() } }}
        />
      )}
    </div>
  )
}

// ── a task list ─────────────────────────────────────────────────────────────

/**
 * Two kinds of thing to do, kept apart. The writing tasks are the ones the
 * core concept set out, the same rows the writing page's Tasks tool shows;
 * they fold away under "Writing" so everything else can have the room. The
 * rest is whatever the person adds here, plus anything the core concept set
 * out that is not writing.
 */
export function TaskListBlock({
  item, pieces, tasks, disabled, onToggleTask, onContent,
}: {
  item: BoardItem
  /** The pieces whose tasks it shows: the ones it is connected to, or every piece when it stands alone. */
  pieces: Array<{ id: string; title: string }>
  tasks: ProjectTask[]
  disabled: boolean
  onToggleTask: (task: ProjectTask) => void
  onContent: (content: BoardItemContent) => void
}) {
  const { t } = useTheme()
  const [draft, setDraft] = useState('')
  const own = item.content.tasks ?? []
  const open = !item.content.writing_closed
  const ids = useMemo(() => new Set(pieces.map((p) => p.id)), [pieces])
  const mine = tasks.filter((x) => ids.has(x.node_id))
  const writing = mine.filter(isWritingTask)
  // The person's own categories fold like Writing does; older uncategorised tasks stay loose at the top.
  const named = groupTasks(mine.filter((x) => !isWritingTask(x))).filter((g) => g.name !== OTHER)
  const other = mine.filter((x) => !isWritingTask(x) && categoryOf(x) === OTHER)
  const [shut, setShut] = useState<Record<string, boolean>>({})
  const writingLeft = writing.filter((x) => x.status === 'pending').length
  const scope = item.node_ids.length === 0
    ? 'The whole project'
    : pieces.map((p) => p.title.trim() || 'Untitled').join(', ')

  const setOwn = (next: OwnTask[]) => onContent({ tasks: next })
  const add = () => {
    const title = draft.trim()
    if (!title) return
    setOwn([...own, { id: crypto.randomUUID(), title, done: false }])
    setDraft('')
  }

  const rule = `1px solid ${alpha(t.textPrimary, 0.08)}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ paddingRight: 48 }}>
        <div style={{ ...canvasType.small, fontSize: 13, fontWeight: 600, color: t.textPrimary }}>Tasks</div>
        <div style={{ ...canvasType.chip, color: t.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={scope}>{scope}</div>
      </div>

      {/* everything that is not the writing comes first: it is what this list is for */}
      <div>
        {other.length + own.length === 0 && disabled && (
          <p style={{ ...canvasType.small, fontSize: 12.5, color: t.textMuted, margin: 0 }}>Nothing else to do here.</p>
        )}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {other.map((task) => (
            <TaskRow key={task.id} title={task.title} done={task.status === 'complete'} disabled={disabled} onToggle={() => onToggleTask(task)} />
          ))}
          {own.map((task) => (
            <TaskRow
              key={task.id}
              title={task.title}
              done={task.done}
              disabled={disabled}
              onToggle={() => setOwn(own.map((x) => (x.id === task.id ? { ...x, done: !x.done } : x)))}
              onRemove={() => setOwn(own.filter((x) => x.id !== task.id))}
            />
          ))}
        </ul>
        {!disabled && (
          <input
            aria-label="A new task"
            value={draft}
            placeholder="Add a task…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            onBlur={add}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              ...canvasType.small, fontSize: 13, width: '100%', boxSizing: 'border-box', marginTop: other.length + own.length ? 6 : 0,
              color: t.textPrimary, background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: radius.field,
              padding: '7px 10px', outline: 'none', fontFamily: 'inherit',
            }}
          />
        )}
      </div>

      {/* the writing: there when wanted, folded away when not */}
      {writing.length > 0 && (
        <div style={{ borderTop: rule, paddingTop: 8 }}>
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => { e.stopPropagation(); onContent({ writing_closed: open }) }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 0, background: 'none', border: 'none',
              cursor: 'pointer', textAlign: 'left', color: t.textSecondary,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 160ms ease' }}>
              <path d="M9 6l6 6-6 6" />
            </svg>
            <span style={{ ...canvasType.label, color: t.textSecondary }}>Writing</span>
            <span style={{ ...canvasType.chip, color: t.textMuted, marginLeft: 'auto' }}>
              {writingLeft === 0 ? 'all done' : `${writingLeft} to do`}
            </span>
          </button>
          {open && (
            <div style={{ marginTop: 4 }}>
              {pieces.map((piece) => {
                const rows = writing.filter((x) => x.node_id === piece.id)
                if (rows.length === 0) return null
                return (
                  <div key={piece.id}>
                    {pieces.length > 1 && (
                      <div style={{ ...canvasType.chip, color: t.textMuted, margin: '8px 0 2px' }}>{piece.title.trim() || 'Untitled'}</div>
                    )}
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                      {rows.map((task) => (
                        <TaskRow key={task.id} title={task.title} done={task.status === 'complete'} disabled={disabled} onToggle={() => onToggleTask(task)} />
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {named.map((group) => {
        const isOpen = !shut[group.name]
        const left = group.tasks.filter((x) => x.status === 'pending').length
        return (
          <div key={group.name} style={{ borderTop: rule, paddingTop: 8 }}>
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={(e) => { e.stopPropagation(); setShut((c) => ({ ...c, [group.name]: isOpen })) }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: 0, background: 'none', border: 'none',
                cursor: 'pointer', textAlign: 'left', color: t.textSecondary,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: isOpen ? 'rotate(90deg)' : undefined, transition: 'transform 160ms ease' }}>
                <path d="M9 6l6 6-6 6" />
              </svg>
              <span style={{ ...canvasType.label, color: t.textSecondary }}>{group.name}</span>
              <span style={{ ...canvasType.chip, color: t.textMuted, marginLeft: 'auto' }}>
                {left === 0 ? 'all done' : `${left} to do`}
              </span>
            </button>
            {isOpen && (
              <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
                {group.tasks.map((task) => (
                  <TaskRow key={task.id} title={task.title} done={task.status === 'complete'} disabled={disabled} onToggle={() => onToggleTask(task)} />
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TaskRow({ title, done, disabled, onToggle, onRemove }: {
  title: string
  done: boolean
  disabled: boolean
  onToggle: () => void
  /** Only the list's own tasks can be taken off it. */
  onRemove?: () => void
}) {
  const { t } = useTheme()
  const [hover, setHover] = useState(false)
  return (
    <li
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}
    >
      <button
        type="button"
        aria-pressed={done}
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onToggle() }}
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', background: 'none', border: 'none',
          cursor: disabled ? 'default' : 'pointer', textAlign: 'left', font: 'inherit',
        }}
      >
        <span
          aria-hidden
          style={{
            flexShrink: 0, width: 14, height: 14, marginTop: 2, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1px solid ${done ? alpha(t.verdant, 0.5) : t.textMuted}`, background: done ? alpha(t.verdant, 0.14) : 'transparent',
          }}
        >
          {done && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.verdant }} />}
        </span>
        <span style={{ ...canvasType.small, fontSize: 13, lineHeight: 1.4, color: done ? t.textMuted : t.textPrimary, textDecoration: done ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>
          {title}
        </span>
      </button>
      {onRemove && !disabled && (
        <button
          type="button"
          aria-label={`Remove “${title}”`}
          title="Remove"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            flexShrink: 0, width: 20, height: 20, marginTop: 5, padding: 0, border: 'none', borderRadius: 6, background: 'transparent',
            color: t.textMuted, cursor: 'pointer', opacity: hover ? 1 : 0, transition: 'opacity 140ms ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </li>
  )
}

// ── making a recording ──────────────────────────────────────────────────────

const RECORD_TYPES = ['audio/webm', 'audio/mp4', 'audio/ogg']
const MAX_RECORD_S = 15 * 60

/**
 * Record now, or bring a file. What is recorded here is marked as the
 * person's own voice; a file brought in is not, because it may be anyone's.
 */
export function RecorderDialog({
  onClose, onDone,
}: {
  onClose: () => void
  onDone: (file: Blob, opts: { ownVoice: boolean; seconds?: number }) => Promise<void>
}) {
  const { t } = useTheme()
  const [phase, setPhase] = useState<'idle' | 'recording' | 'saving'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const started = useRef(0)
  const picker = useRef<HTMLInputElement | null>(null)
  const canRecord = typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

  const release = () => {
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
  }
  // Leaving the dialog in any way lets go of the microphone.
  useEffect(() => () => {
    if (recorder.current && recorder.current.state !== 'inactive') {
      recorder.current.onstop = null
      recorder.current.stop()
    }
    release()
  }, [])

  useEffect(() => {
    if (phase !== 'recording') return
    const id = window.setInterval(() => {
      const s = (Date.now() - started.current) / 1000
      setSeconds(s)
      if (s >= MAX_RECORD_S) recorder.current?.stop()
    }, 250)
    return () => window.clearInterval(id)
  }, [phase])

  const save = async (file: Blob, opts: { ownVoice: boolean; seconds?: number }) => {
    setPhase('saving')
    setError(null)
    try {
      await onDone(file, opts)
      onClose()
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : 'That did not save. Try again.')
      setPhase('idle')
    }
  }

  const record = async () => {
    setError(null)
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setError('The microphone is not available. Allow it for this site, or add a file instead.')
      return
    }
    const mimeType = RECORD_TYPES.find((m) => MediaRecorder.isTypeSupported(m))
    const rec = new MediaRecorder(stream.current, mimeType ? { mimeType } : undefined)
    chunks.current = []
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data) }
    rec.onstop = () => {
      release()
      const type = (rec.mimeType || mimeType || 'audio/webm').split(';')[0]
      const length = (Date.now() - started.current) / 1000
      void save(new Blob(chunks.current, { type }), { ownVoice: true, seconds: length })
    }
    recorder.current = rec
    started.current = Date.now()
    setSeconds(0)
    rec.start()
    setPhase('recording')
  }

  return (
    <ModalDialog
      onClose={phase === 'saving' ? () => {} : onClose}
      title="A recording"
      maxWidth="460px"
      footer={
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
          {phase === 'recording' ? (
            <PrimaryButton size="sm" onClick={() => recorder.current?.stop()}>Stop and keep it</PrimaryButton>
          ) : (
            <>
              <GhostButton size="sm" onClick={onClose} disabled={phase === 'saving'}>Cancel</GhostButton>
              <QuietButton size="sm" onClick={() => picker.current?.click()} disabled={phase === 'saving'}>Add a file</QuietButton>
              {canRecord && (
                <PrimaryButton size="sm" onClick={() => void record()} loading={phase === 'saving'} loadingLabel="Saving…">Record</PrimaryButton>
              )}
            </>
          )}
        </div>
      }
    >
      <input
        ref={picker}
        type="file"
        accept="audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,.mp3,.m4a,.wav,.ogg,.webm"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void save(file, { ownVoice: false })
        }}
      />
      {phase === 'recording' ? (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span aria-hidden style={{ width: 10, height: 10, borderRadius: '50%', background: t.ember }} />
          <span style={{ ...canvasType.body, color: t.textPrimary, fontVariantNumeric: 'tabular-nums' }}>Recording, {clock(seconds)}</span>
        </div>
      ) : (
        <p style={{ ...canvasType.body, color: t.textSecondary, margin: 0 }}>
          {phase === 'saving'
            ? 'Putting it on the canvas…'
            : 'Record yourself now, or add a sound file you already have. It stays beside your pieces for you to play back. The companion never listens to it.'}
        </p>
      )}
      {error && <p role="alert" style={{ ...canvasType.small, color: t.ember, margin: '12px 0 0' }}>{error}</p>}
    </ModalDialog>
  )
}

/** What each kind is called where a sentence needs it. */
export const ITEM_LABEL: Record<BoardItemKind, string> = {
  image: 'this image',
  recording: 'this recording',
  tasks: 'this task list',
}
