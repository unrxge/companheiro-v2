'use client'

// The pieces a task list is built from, shared by the canvas's opened task
// list and the writing page's Tasks tool:
//
//   · RoomyRow    one task. Only its round tick completes it; its words are
//                 the person's to click into and rewrite, however long they run.
//   · AutoInput   the box a new task is typed into. It wraps and grows, so a
//                 long task never scrolls out of sight as it is written.
//   · Progress    a thin bar for how far along something is.
//   · TaskGroups  a piece's tasks as one plain list, with a box to add to it.
//                 (There are no categories any more, by the person's decision.)

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { MAX_TASK_TITLE } from '@/lib/studio/task-groups'
import { SortableList } from '@/components/studio/work/sortable'

export interface GroupTask {
  id: string
  title: string
  status: 'pending' | 'complete'
}

/** A thin bar for how far along something is. */
export function Progress({ done, total, width = 72 }: { done: number; total: number; width?: number }) {
  const { t } = useTheme()
  return (
    <span aria-hidden style={{ display: 'inline-block', width, height: 4, borderRadius: 999, background: alpha(t.textPrimary, 0.1), overflow: 'hidden', flexShrink: 0 }}>
      <span style={{ display: 'block', height: '100%', width: `${total ? Math.round((done / total) * 100) : 0}%`, borderRadius: 999, background: t.verdant, transition: 'width 260ms ease' }} />
    </span>
  )
}

/** Grows a text box to its words, as they are typed. */
function useGrow(ref: React.RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [ref, value])
}

/** The box a new task is typed into: wraps, grows, and Enter adds it (Shift+Enter is a new line). */
export function AutoInput({ value, onChange, onSubmit, placeholder, label, style, onBlurSubmit = false }: {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder: string
  label: string
  style?: React.CSSProperties
  onBlurSubmit?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  useGrow(ref, value)
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={label}
      value={value}
      placeholder={placeholder}
      maxLength={MAX_TASK_TITLE}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit() } }}
      onBlur={onBlurSubmit ? onSubmit : undefined}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ resize: 'none', overflow: 'hidden', display: 'block', lineHeight: 1.45, ...style }}
    />
  )
}

/** A task's words, written over in place: click into them and type. */
function TaskText({ title, done, size, onRename }: { title: string; done: boolean; size: number; onRename: (title: string) => void }) {
  const { t } = useTheme()
  const [draft, setDraft] = useState(title)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  // What was changed elsewhere (a move, an undo) replaces what is shown, unless it is being written now.
  useEffect(() => { if (document.activeElement !== ref.current) setDraft(title) }, [title])
  useGrow(ref, draft)
  const commit = () => {
    const next = draft.replace(/\s+/g, ' ').trim()
    if (!next) { setDraft(title); return }
    if (next !== title) onRename(next)
    setDraft(next)
  }
  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label="The task"
      value={draft}
      maxLength={MAX_TASK_TITLE}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
        if (e.key === 'Escape') { setDraft(title); e.currentTarget.blur() }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        ...canvasType.small, flex: 1, minWidth: 0, fontSize: size, lineHeight: 1.45, resize: 'none', overflow: 'hidden', display: 'block',
        padding: '0 2px', margin: 0, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'inherit', cursor: 'text',
        color: done ? t.textMuted : t.textPrimary, textDecoration: done ? 'line-through' : 'none', overflowWrap: 'anywhere',
      }}
    />
  )
}

/** One task: a roomy row with a round tick, softly lit when pointed at. */
export function RoomyRow({ title, done, disabled, onToggle, onRename, onRemove, onMove, moving, dense = false }: {
  title: string
  done: boolean
  disabled: boolean
  onToggle: () => void
  /** Given, the words can be rewritten in place. */
  onRename?: (title: string) => void
  onRemove?: () => void
  /** Offers to move the task to another place; `moving` shows it is being offered. */
  onMove?: () => void
  moving?: boolean
  dense?: boolean
}) {
  const { t } = useTheme()
  const size = dense ? 14 : 15
  return (
    <div className="tg-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 4, borderRadius: 10 }}>
      <button
        type="button"
        aria-pressed={done}
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
        disabled={disabled}
        onClick={onToggle}
        style={{ flexShrink: 0, padding: '10px 4px 10px 10px', background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', display: 'flex' }}
      >
        <span
          aria-hidden
          style={{
            width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid ${done ? t.verdant : alpha(t.textPrimary, 0.35)}`, background: done ? t.verdant : 'transparent', transition: 'background 160ms ease, border-color 160ms ease',
          }}
        >
          {done && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={t.containerBg} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          )}
        </span>
      </button>
      <div style={{ flex: 1, minWidth: 0, padding: '10px 6px 10px 6px', display: 'flex' }}>
        {onRename && !disabled ? (
          <TaskText title={title} done={done} size={size} onRename={onRename} />
        ) : (
          <span style={{ ...canvasType.small, fontSize: size, lineHeight: 1.45, color: done ? t.textMuted : t.textPrimary, textDecoration: done ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>{title}</span>
        )}
      </div>
      {onMove && !disabled && (
        <button
          type="button"
          className={moving ? undefined : 'tg-x'}
          aria-label={`Move “${title}”`}
          aria-expanded={!!moving}
          title="Move to…"
          onClick={onMove}
          style={{ flexShrink: 0, width: 28, height: 28, marginTop: 6, padding: 0, border: 'none', borderRadius: 8, background: moving ? alpha(t.textPrimary, 0.1) : 'transparent', color: moving ? t.textPrimary : t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 9h14M15 5l4 4-4 4M19 15H5M9 11l-4 4 4 4" /></svg>
        </button>
      )}
      {onRemove && !disabled && (
        <button
          type="button"
          className="tg-x"
          aria-label={`Remove “${title}”`}
          title="Remove"
          onClick={onRemove}
          style={{ flexShrink: 0, width: 28, height: 28, marginTop: 6, marginRight: 4, padding: 0, border: 'none', borderRadius: 8, background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
    </div>
  )
}

/** The hover light on a roomy row, and the marks that appear with it (always there where nothing can hover). */
export const ROOMY_CSS = `
  .tg-row:hover, .tg-row:focus-within { background: rgba(232,230,224,0.05); }
  .tg-row .tg-x { opacity: 0; transition: opacity 140ms ease; }
  .tg-row:hover .tg-x, .tg-row:focus-within .tg-x { opacity: 1; }
  @media (hover: none) { .tg-row .tg-x { opacity: 1; } }
`

/** A piece's tasks as one plain list, finished ones at the bottom, with a box to add another. */
export function TaskGroups<T extends GroupTask>({
  tasks, onToggle, onAdd, onRemove, onRename, onReorder, disabled = false,
}: {
  tasks: T[]
  onToggle: (task: T) => void
  onAdd: (title: string, category: string) => Promise<void> | void
  onRemove?: (task: T) => void
  onRename?: (task: T, title: string) => void
  onReorder?: (ids: string[]) => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [draft, setDraft] = useState('')
  const rows = [...tasks].sort((a, b) => (a.status === b.status ? 0 : a.status === 'complete' ? 1 : -1))
  const add = async () => {
    const title = draft.trim()
    if (!title) return
    setDraft('')
    await onAdd(title, 'Tasks')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <style>{ROOMY_CSS}</style>
      <SortableList
        disabled={disabled || !onReorder}
        label="this task"
        onReorder={(ids) => onReorder?.(ids)}
        rows={rows.map((task) => ({
          id: task.id,
          node: (
            <RoomyRow
              dense
              title={task.title}
              done={task.status === 'complete'}
              disabled={disabled}
              onToggle={() => onToggle(task)}
              onRename={onRename ? (title) => onRename(task, title) : undefined}
              onRemove={onRemove ? () => onRemove(task) : undefined}
            />
          ),
        }))}
      />
      {!disabled && (
        <AutoInput
          label="A new task"
          value={draft}
          onChange={setDraft}
          onSubmit={() => void add()}
          placeholder="Add a task…"
          style={{
            ...canvasType.small, fontSize: 14, width: '100%', boxSizing: 'border-box', marginTop: rows.length ? 6 : 0,
            color: t.textPrimary, background: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: radius.field, padding: '9px 12px', outline: 'none', fontFamily: 'inherit',
          }}
        />
      )}
    </div>
  )
}
