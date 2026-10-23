'use client'

// ── a task list, opened ─────────────────────────────────────────────────────
//
// What a task list is when it is opened, and the only way it is made: pressing
// "Task list" in the "+" puts one on the canvas and opens it here, with nothing
// asked first. From the top:
//
//   · where it stands: the whole project, or one piece (one choice)
//   · the project's own tasks, the ones that belong to no piece
//   · then each piece's tasks, in the order the pieces stand
//
// Any task can be moved to another place with the arrows beside it: to the
// project, or to a piece. One list, one screen, no mode to be in.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { Progress, ROOMY_CSS, RoomyRow } from '@/components/studio/work/task-groups'
import { SortableList } from '@/components/studio/work/sortable'
import type { BoardItem, BoardItemContent, OwnTask, ProjectTask } from '@/lib/studio/board-items'

/** Where a task made here goes under, in a piece's own categories. */
const GENERAL = 'Tasks'

interface PieceRef { id: string; title: string }

export function TaskListRoom({
  item, scope, allPieces, tasks, disabled, onClose,
  onToggleTask, onAddTask, onRemoveTask, onReorderTasks, onContent, onScope,
}: {
  item: BoardItem
  /** The pieces this list shows: the ones it is on, or every piece when it is on the whole project. */
  scope: PieceRef[]
  allPieces: PieceRef[]
  tasks: ProjectTask[]
  disabled: boolean
  onClose: () => void
  onToggleTask: (task: ProjectTask) => void
  onAddTask: (nodeId: string, title: string, category: string) => Promise<void>
  onRemoveTask: (task: ProjectTask) => void
  onReorderTasks: (ids: string[]) => void
  onContent: (content: BoardItemContent) => void
  onScope: (ids: string[]) => void
}) {
  const { t } = useTheme()
  const [showDone, setShowDone] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [moving, setMoving] = useState<string | null>(null)
  const own = item.content.tasks ?? []
  const listName = 'Task list'
  const whole = item.node_ids.length === 0
  const scopeIds = new Set(scope.map((p) => p.id))
  const mine = tasks.filter((x) => scopeIds.has(x.node_id))
  const doneCount = mine.filter((x) => x.status === 'complete').length + own.filter((x) => x.done).length
  const allCount = mine.length + own.length

  const setOwn = (next: OwnTask[]) => onContent({ tasks: next })
  const draftOf = (key: string) => drafts[key] ?? ''
  const setDraft = (key: string, v: string) => setDrafts((d) => ({ ...d, [key]: v }))

  const addOwn = () => {
    const title = draftOf('own').trim()
    if (!title) return
    setOwn([...own, { id: crypto.randomUUID(), title, done: false }])
    setDraft('own', '')
  }
  const addTo = (piece: PieceRef) => {
    const title = draftOf(piece.id).trim()
    if (!title) return
    setDraft(piece.id, '')
    void onAddTask(piece.id, title, GENERAL)
  }

  /** Moving is making it at the new place and taking it off the old one. */
  const moveOwn = (task: OwnTask, to: string) => {
    setMoving(null)
    if (to === 'own') return
    void onAddTask(to, task.title, GENERAL)
    setOwn(own.filter((x) => x.id !== task.id))
  }
  const movePiece = (task: ProjectTask, to: string) => {
    setMoving(null)
    if (to === task.node_id) return
    if (to === 'own') setOwn([...own, { id: crypto.randomUUID(), title: task.title, done: task.status === 'complete' }])
    else void onAddTask(to, task.title, GENERAL)
    onRemoveTask(task)
  }

  const section: React.CSSProperties = { padding: '14px 16px 16px', borderRadius: 16, background: alpha(t.textPrimary, 0.035), border: `1px solid ${alpha(t.textPrimary, 0.07)}` }
  const heading: React.CSSProperties = { ...canvasType.small, fontSize: 16, fontWeight: 600, color: t.textPrimary, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const field: React.CSSProperties = {
    ...canvasType.small, fontSize: 14, width: '100%', boxSizing: 'border-box', color: t.textPrimary, background: t.inputBg,
    border: `1px solid ${t.inputBorder}`, borderRadius: radius.field, padding: '9px 12px', outline: 'none', fontFamily: 'inherit',
  }
  const chip = (on: boolean): React.CSSProperties => ({
    ...canvasType.chip, padding: '6px 12px', borderRadius: 999, cursor: 'pointer', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    color: on ? t.textPrimary : t.textSecondary, background: on ? alpha(t.textPrimary, 0.12) : 'transparent',
    border: `1px solid ${on ? alpha(t.textPrimary, 0.4) : alpha(t.textPrimary, 0.16)}`,
  })

  /** Where the arrows beside a task offer to send it. */
  const destinations = (here: string, pick: (to: string) => void) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 10px 10px 40px' }}>
      <span style={{ ...canvasType.chip, color: t.textMuted, alignSelf: 'center', marginRight: 2 }}>Move to</span>
      {here !== 'own' && <button type="button" onClick={() => pick('own')} style={chip(false)}>The project</button>}
      {allPieces.filter((p) => p.id !== here).map((p) => (
        <button key={p.id} type="button" onClick={() => pick(p.id)} style={chip(false)}>{p.title.trim() || 'Untitled'}</button>
      ))}
    </div>
  )

  const sub = whole ? 'The whole project' : scope.map((p) => p.title.trim() || 'Untitled').join(', ')

  return (
    // The dialog is drawn on the page, but its events still climb to the
    // canvas through React: stopped here so nothing underneath is dragged.
    <span onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <ModalDialog onClose={onClose} title={listName} subtitle={sub} maxWidth="720px">
        <style>{ROOMY_CSS}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* where it stands, and how far along it is */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {allPieces.length > 0 && (
              <div>
                <span style={{ ...canvasType.label, color: t.textMuted, display: 'block', margin: '0 0 7px' }}>This list is on</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button type="button" disabled={disabled} aria-pressed={whole} onClick={() => onScope([])} style={chip(whole)}>The whole project</button>
                  {allPieces.map((p) => {
                    const on = item.node_ids.includes(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={disabled}
                        aria-pressed={on}
                        onClick={() => onScope([p.id])}
                        style={chip(on)}
                      >
                        {p.title.trim() || 'Untitled'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <span style={{ ...canvasType.small, fontSize: 13, color: t.textSecondary }}>
                <b style={{ fontSize: 22, fontWeight: 600, color: t.textPrimary, marginRight: 6 }}>{allCount - doneCount}</b>
                to do{doneCount > 0 ? ` · ${doneCount} done` : ''}
              </span>
              {allCount > 0 && <Progress done={doneCount} total={allCount} width={120} />}
              {doneCount > 0 && (
                <button type="button" aria-pressed={showDone} onClick={() => setShowDone((v) => !v)} style={{ ...chip(showDone), marginLeft: 'auto' }}>
                  {showDone ? 'Hide done' : `Show ${doneCount} done`}
                </button>
              )}
            </div>
          </div>

          {/* the project's own tasks come first */}
          <section style={section}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 2 }}>
              <span style={heading}>For the whole project</span>
              <span style={{ ...canvasType.chip, color: t.textMuted, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{own.filter((x) => x.done).length} of {own.length}</span>
            </div>
            <p style={{ ...canvasType.small, fontSize: 12.5, color: t.textMuted, margin: '0 0 6px' }}>Tasks that don’t belong to one piece.</p>
            <SortableList
              disabled={disabled}
              label="this task"
              onReorder={(ids) => setOwn(ids.map((id) => own.find((x) => x.id === id)).filter((x): x is OwnTask => !!x))}
              rows={own.filter((task) => showDone || !task.done).map((task) => ({
                id: task.id,
                node: (
                  <>
                    <RoomyRow
                      title={task.title}
                      done={task.done}
                      disabled={disabled}
                      moving={moving === task.id}
                      onMove={allPieces.length > 0 ? () => setMoving(moving === task.id ? null : task.id) : undefined}
                      onToggle={() => setOwn(own.map((x) => (x.id === task.id ? { ...x, done: !x.done } : x)))}
                      onRemove={() => setOwn(own.filter((x) => x.id !== task.id))}
                    />
                    {moving === task.id && destinations('own', (to) => moveOwn(task, to))}
                  </>
                ),
              }))}
            />
            {!disabled && (
              <input
                aria-label="A new task for the whole project"
                value={draftOf('own')}
                placeholder="Add a task for the whole project…"
                onChange={(e) => setDraft('own', e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOwn() } }}
                style={{ ...field, marginTop: own.length ? 6 : 0 }}
              />
            )}
          </section>

          {/* then each piece's */}
          {scope.map((piece) => {
            const theirs = mine.filter((x) => x.node_id === piece.id)
            const theirDone = theirs.filter((x) => x.status === 'complete').length
            const rows = theirs.filter((x) => showDone || x.status !== 'complete')
            return (
              <section key={piece.id} style={section}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                  <span style={heading}>{piece.title.trim() || 'Untitled'}</span>
                  <span style={{ ...canvasType.chip, color: t.textMuted, marginLeft: 'auto', whiteSpace: 'nowrap' }}>{theirDone} of {theirs.length}</span>
                  <Progress done={theirDone} total={theirs.length} />
                </div>
                <SortableList
                  disabled={disabled}
                  label="this task"
                  onReorder={(ids) => onReorderTasks(ids)}
                  rows={rows.map((task) => ({
                    id: task.id,
                    node: (
                      <>
                        <RoomyRow
                          title={task.title}
                          done={task.status === 'complete'}
                          disabled={disabled}
                          moving={moving === task.id}
                          onMove={() => setMoving(moving === task.id ? null : task.id)}
                          onToggle={() => onToggleTask(task)}
                          onRemove={() => onRemoveTask(task)}
                        />
                        {moving === task.id && destinations(piece.id, (to) => movePiece(task, to))}
                      </>
                    ),
                  }))}
                />
                {!disabled && (
                  <input
                    aria-label={`A new task for ${piece.title.trim() || 'this piece'}`}
                    value={draftOf(piece.id)}
                    placeholder="Add a task…"
                    onChange={(e) => setDraft(piece.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTo(piece) } }}
                    style={{ ...field, marginTop: rows.length ? 6 : 0 }}
                  />
                )}
              </section>
            )
          })}
        </div>
      </ModalDialog>
    </span>
  )
}
