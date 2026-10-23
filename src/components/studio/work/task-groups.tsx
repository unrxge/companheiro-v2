'use client'

// A piece's tasks, folded into categories: the generated ones under Writing,
// the person's own under whatever they name. Used by the writing page's Tasks
// tool and by the review screen after a core concept is locked.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { OTHER, WRITING, cleanCategory, groupTasks, type Categorised } from '@/lib/studio/task-groups'
import { SortableList } from '@/components/studio/work/sortable'

export interface GroupTask extends Categorised {
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

/** One task in the larger view: a roomy row with a round tick, softly lit when pointed at. */
export function RoomyRow({ title, done, disabled, onToggle, onRemove, onMove, moving }: {
  title: string
  done: boolean
  disabled: boolean
  onToggle: () => void
  onRemove?: () => void
  /** Offers to move the task to another place; `moving` shows it is being offered. */
  onMove?: () => void
  moving?: boolean
}) {
  const { t } = useTheme()
  return (
    <div className="tg-row" style={{ display: 'flex', alignItems: 'flex-start', gap: 4, borderRadius: 10 }}>
      <button
        type="button"
        aria-pressed={done}
        disabled={disabled}
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0, padding: '10px 10px', background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', textAlign: 'left', font: 'inherit' }}
      >
        <span
          aria-hidden
          style={{
            flexShrink: 0, width: 18, height: 18, marginTop: 1, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `1.5px solid ${done ? t.verdant : alpha(t.textPrimary, 0.35)}`, background: done ? t.verdant : 'transparent', transition: 'background 160ms ease, border-color 160ms ease',
          }}
        >
          {done && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={t.containerBg} strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          )}
        </span>
        <span style={{ ...canvasType.small, fontSize: 15, lineHeight: 1.45, color: done ? t.textMuted : t.textPrimary, textDecoration: done ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>
          {title}
        </span>
      </button>
      {onMove && !disabled && (
        <button
          type="button"
          className={moving ? undefined : 'tg-x'}
          aria-label={`Move “${title}”`}
          aria-expanded={!!moving}
          title="Move to…"
          onClick={onMove}
          style={{ flexShrink: 0, width: 28, height: 28, marginTop: 5, padding: 0, border: 'none', borderRadius: 8, background: moving ? alpha(t.textPrimary, 0.1) : 'transparent', color: moving ? t.textPrimary : t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
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
          style={{ flexShrink: 0, width: 28, height: 28, marginTop: 5, marginRight: 4, padding: 0, border: 'none', borderRadius: 8, background: 'transparent', color: t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
    </div>
  )
}

/** The hover light on a roomy row, and the remove mark that appears with it (always there where nothing can hover). */
export const ROOMY_CSS = `
  .tg-row:hover { background: rgba(232,230,224,0.05); }
  .tg-row .tg-x { opacity: 0; transition: opacity 140ms ease; }
  .tg-row:hover .tg-x, .tg-row:focus-within .tg-x { opacity: 1; }
  @media (hover: none) { .tg-row .tg-x { opacity: 1; } }
`

export function TaskGroups<T extends GroupTask>({
  tasks, onToggle, onAdd, onRemove, onReorder, disabled = false, roomy = false, hideDone = false,
}: {
  tasks: T[]
  onToggle: (task: T) => void
  onAdd: (title: string, category: string) => Promise<void> | void
  onRemove?: (task: T) => void
  /**
   * Given, the rows in each group can be dragged into another order — passed
   * only by the larger task list, where the list is the whole screen. Without
   * it the rows behave exactly as they always have.
   */
  onReorder?: (ids: string[]) => void
  disabled?: boolean
  /** The larger view: roomier rows, and each group's progress in its header. */
  roomy?: boolean
  /** Finished tasks are tucked away (the counts still include them). */
  hideDone?: boolean
}) {
  const { t } = useTheme()
  // Categories named here that have no task yet. They are kept once a task goes in.
  const [extra, setExtra] = useState<string[]>([])
  // Older tasks that aren't the writing start folded; everything else open.
  const [closed, setClosed] = useState<Record<string, boolean>>({ [OTHER]: true })
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')

  const groups = groupTasks(tasks, [WRITING, ...extra])
  const rule = `1px solid ${alpha(t.textPrimary, 0.08)}`
  const field: React.CSSProperties = {
    ...canvasType.small, fontSize: 13, width: '100%', boxSizing: 'border-box', color: t.textPrimary, background: t.inputBg,
    border: `1px solid ${t.inputBorder}`, borderRadius: radius.field, padding: '7px 10px', outline: 'none', fontFamily: 'inherit',
  }

  const add = async (category: string) => {
    const title = (drafts[category] ?? '').trim()
    if (!title) return
    setDrafts((d) => ({ ...d, [category]: '' }))
    await onAdd(title, category)
  }

  const create = () => {
    const next = cleanCategory(name)
    setNaming(false)
    setName('')
    if (!next) return
    const existing = groups.find((g) => g.name.toLowerCase() === next.toLowerCase())
    if (!existing) setExtra((e) => [...e, next])
    setClosed((c) => ({ ...c, [existing?.name ?? next]: false }))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {roomy && <style>{ROOMY_CSS}</style>}
      {groups.map((group, gi) => {
        const open = !closed[group.name]
        const left = group.tasks.filter((x) => x.status === 'pending').length
        // Finished tasks sink to the bottom but stay in view.
        const rows = [...group.tasks].filter((x) => !hideDone || x.status !== 'complete').sort((a, b) => (a.status === b.status ? 0 : a.status === 'complete' ? 1 : -1))
        return (
          <section key={group.name} style={{ borderTop: gi ? rule : 'none', padding: gi ? '12px 0' : '0 0 12px' }}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setClosed((c) => ({ ...c, [group.name]: open }))}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '2px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: t.textSecondary }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform 160ms ease', flexShrink: 0 }}>
                <path d="M9 6l6 6-6 6" />
              </svg>
              <span style={{ ...canvasType.label, color: t.textPrimary }}>{group.name}</span>
              <span style={{ ...canvasType.chip, color: t.textMuted, marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {roomy && group.tasks.length > 0 && <Progress done={group.tasks.length - left} total={group.tasks.length} width={48} />}
                {group.tasks.length === 0 ? 'empty' : left === 0 ? 'all done' : `${left} to do`}
              </span>
            </button>

            {open && (
              <div style={{ marginTop: 6 }}>
                <SortableList
                  disabled={disabled || !onReorder}
                  label="this task"
                  onReorder={(ids) => onReorder?.(ids)}
                  rows={rows.map((task) => {
                    const done = task.status === 'complete'
                    if (roomy) return {
                      id: task.id,
                      node: <RoomyRow title={task.title} done={done} disabled={disabled} onToggle={() => onToggle(task)} onRemove={onRemove ? () => onRemove(task) : undefined} />,
                    }
                    return {
                      id: task.id,
                      node: (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <button
                          type="button"
                          aria-pressed={done}
                          disabled={disabled}
                          onClick={() => onToggle(task)}
                          style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, minWidth: 0, padding: '8px 0', background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer', textAlign: 'left', font: 'inherit' }}
                        >
                          <span
                            aria-hidden
                            style={{
                              flexShrink: 0, width: 14, height: 14, marginTop: 3, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              border: `1px solid ${done ? alpha(t.verdant, 0.5) : t.textMuted}`, background: done ? alpha(t.verdant, 0.14) : 'transparent',
                            }}
                          >
                            {done && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.verdant }} />}
                          </span>
                          <span style={{ ...canvasType.small, fontSize: 14, lineHeight: 1.45, color: done ? t.textMuted : t.textSecondary, textDecoration: done ? 'line-through' : 'none' }}>
                            {task.title}
                          </span>
                        </button>
                        {onRemove && !disabled && (
                          <button
                            type="button"
                            aria-label={`Remove “${task.title}”`}
                            title="Remove"
                            onClick={() => onRemove(task)}
                            style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '9px 4px', flexShrink: 0 }}
                          >
                            ✕
                          </button>
                        )}
                        </div>
                      ),
                    }
                  })}
                />
                {!disabled && (
                  <input
                    aria-label={`A new task under ${group.name}`}
                    value={drafts[group.name] ?? ''}
                    placeholder={group.name === WRITING ? 'Add a writing task…' : `Add to ${group.name}…`}
                    onChange={(e) => setDrafts((d) => ({ ...d, [group.name]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(group.name) } }}
                    style={{ ...field, marginTop: rows.length ? 6 : 0 }}
                  />
                )}
              </div>
            )}
          </section>
        )
      })}

      {!disabled && (
        <div style={{ borderTop: rule, paddingTop: 12 }}>
          {naming ? (
            <input
              autoFocus
              aria-label="Name the new category"
              value={name}
              placeholder="Name it: Research, Artwork, Release…"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); create() }
                if (e.key === 'Escape') { setNaming(false); setName('') }
              }}
              onBlur={create}
              style={field}
            />
          ) : (
            <button
              type="button"
              onClick={() => setNaming(true)}
              style={{ ...canvasType.small, color: t.textSecondary, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
            >
              + New category
            </button>
          )}
        </div>
      )}
    </div>
  )
}
