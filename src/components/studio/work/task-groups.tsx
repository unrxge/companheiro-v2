'use client'

// A piece's tasks, folded into categories: the generated ones under Writing,
// the person's own under whatever they name. Used by the writing page's Tasks
// tool and by the review screen after a core concept is locked.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { OTHER, WRITING, cleanCategory, groupTasks, type Categorised } from '@/lib/studio/task-groups'

export interface GroupTask extends Categorised {
  id: string
  title: string
  status: 'pending' | 'complete'
}

export function TaskGroups<T extends GroupTask>({
  tasks, onToggle, onAdd, onRemove, disabled = false,
}: {
  tasks: T[]
  onToggle: (task: T) => void
  onAdd: (title: string, category: string) => Promise<void> | void
  onRemove?: (task: T) => void
  disabled?: boolean
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
      {groups.map((group, gi) => {
        const open = !closed[group.name]
        const left = group.tasks.filter((x) => x.status === 'pending').length
        // Finished tasks sink to the bottom but stay in view.
        const rows = [...group.tasks].sort((a, b) => (a.status === b.status ? 0 : a.status === 'complete' ? 1 : -1))
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
              <span style={{ ...canvasType.chip, color: t.textMuted, marginLeft: 'auto' }}>
                {group.tasks.length === 0 ? 'empty' : left === 0 ? 'all done' : `${left} to do`}
              </span>
            </button>

            {open && (
              <div style={{ marginTop: 6 }}>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {rows.map((task) => {
                    const done = task.status === 'complete'
                    return (
                      <li key={task.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
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
                      </li>
                    )
                  })}
                </ul>
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
