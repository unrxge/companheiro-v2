'use client'

// ── a task list, opened ─────────────────────────────────────────────────────
//
// What a task list is when it is opened, and the only way it is made: pressing
// "Task list" in the "+" puts one on the canvas and opens it here, with nothing
// asked first. It reads in tabs:
//
//   · Project: the project's own tasks first (the ones that belong to no
//     piece), then each piece's tasks, in the order the pieces stand
//   · one tab for each piece: just that piece's tasks, and a button that puts
//     this list on that piece (a list on one piece is that piece's own)
//
// Only the round tick completes a task; its words are rewritten by clicking
// into them. A task done in this sitting drops to the bottom of its place and
// stays in view until the list is closed; the next time it is opened, what
// was already done is out of the way until "Show done" is pressed.
//
// Any task can be moved to another place with the arrows beside it.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import { AutoInput, Progress, ROOMY_CSS, RoomyRow } from '@/components/studio/work/task-groups'
import { UnderlineLink } from '@/components/ui/underline-link'
import { SortableList } from '@/components/studio/work/sortable'
import type { BoardItem, BoardItemContent, OwnTask, ProjectTask } from '@/lib/studio/board-items'

/** What a task made here is filed under: there are no categories to choose from. */
const GENERAL = 'Tasks'
const ALL = 'all'

interface PieceRef { id: string; title: string }

export function TaskListRoom({
  item, allPieces, tasks, disabled, onClose,
  onToggleTask, onAddTask, onRemoveTask, onRenameTask, onReorderTasks, onContent, onScope,
}: {
  item: BoardItem
  allPieces: PieceRef[]
  tasks: ProjectTask[]
  disabled: boolean
  onClose: () => void
  onToggleTask: (task: ProjectTask) => void
  onAddTask: (nodeId: string, title: string, category: string) => Promise<void>
  onRemoveTask: (task: ProjectTask) => void
  onRenameTask: (task: ProjectTask, title: string) => void
  onReorderTasks: (ids: string[]) => void
  onContent: (content: BoardItemContent) => void
  onScope: (ids: string[]) => void
}) {
  const { t } = useTheme()
  const own = item.content.tasks ?? []
  const pieceIds = new Set(allPieces.map((p) => p.id))
  const all = tasks.filter((x) => pieceIds.has(x.node_id))

  // Opens on the piece this list is on, if it is on one; otherwise on the whole project.
  const [tab, setTab] = useState<string>(item.node_ids.length === 1 && pieceIds.has(item.node_ids[0]) ? item.node_ids[0] : ALL)
  // What was already done when this was opened is hidden until asked for;
  // what is ticked now stays, at the bottom, until the list is closed.
  const [doneOnOpen] = useState(() => new Set([...all.filter((x) => x.status === 'complete').map((x) => x.id), ...own.filter((x) => x.done).map((x) => x.id)]))
  const [showDone, setShowDone] = useState(false)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [moving, setMoving] = useState<string | null>(null)
  const shown = (id: string) => showDone || !doneOnOpen.has(id)

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
  const heading: React.CSSProperties = { ...canvasType.small, fontSize: 16, fontWeight: 600, lineHeight: 1.3, color: t.textPrimary, minWidth: 0, flex: 1, overflowWrap: 'anywhere' }
  const field: React.CSSProperties = {
    ...canvasType.small, fontSize: 14, width: '100%', boxSizing: 'border-box', color: t.textPrimary, background: t.inputBg,
    border: `1px solid ${t.inputBorder}`, borderRadius: radius.field, padding: '9px 12px', outline: 'none', fontFamily: 'inherit',
  }
  const chip = (on: boolean): React.CSSProperties => ({
    ...canvasType.chip, padding: '7px 13px', borderRadius: 999, cursor: 'pointer', maxWidth: '100%', textAlign: 'left', overflowWrap: 'anywhere',
    color: on ? t.textPrimary : t.textSecondary, background: on ? alpha(t.textPrimary, 0.12) : 'transparent',
    border: `1px solid ${on ? alpha(t.textPrimary, 0.4) : alpha(t.textPrimary, 0.16)}`,
  })

  const sorted = <T,>(rows: T[], done: (x: T) => boolean) => [...rows].sort((a, b) => Number(done(a)) - Number(done(b)))

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

  const pieceSection = (piece: PieceRef, titled: boolean) => {
    const theirs = all.filter((x) => x.node_id === piece.id)
    const theirDone = theirs.filter((x) => x.status === 'complete').length
    const rows = sorted(theirs.filter((x) => shown(x.id)), (x) => x.status === 'complete')
    return (
      <section key={piece.id} style={section}>
        {titled ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
            <span style={heading}>{piece.title.trim() || 'Untitled'}</span>
            <span style={{ ...canvasType.chip, color: t.textMuted, whiteSpace: 'nowrap', paddingTop: 4 }}>{theirDone} of {theirs.length}</span>
            <span style={{ paddingTop: 9 }}><Progress done={theirDone} total={theirs.length} /></span>
          </div>
        ) : null}
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
                  onRename={(title) => onRenameTask(task, title)}
                  onRemove={() => onRemoveTask(task)}
                />
                {moving === task.id && destinations(piece.id, (to) => movePiece(task, to))}
              </>
            ),
          }))}
        />
        {!disabled && (
          <AutoInput
            label={`A new task for ${piece.title.trim() || 'this piece'}`}
            value={draftOf(piece.id)}
            onChange={(v) => setDraft(piece.id, v)}
            onSubmit={() => addTo(piece)}
            placeholder="Add a task…"
            style={{ ...field, marginTop: rows.length ? 6 : 0 }}
          />
        )}
      </section>
    )
  }

  const current = allPieces.find((p) => p.id === tab) ?? null
  // What the tab on screen holds, for the count at the top.
  const scopeTasks = current ? all.filter((x) => x.node_id === current.id) : all
  const scopeOwn = current ? [] : own
  const doneCount = scopeTasks.filter((x) => x.status === 'complete').length + scopeOwn.filter((x) => x.done).length
  const allCount = scopeTasks.length + scopeOwn.length
  const earlierDone = [...doneOnOpen].filter((id) => (current ? scopeTasks.some((x) => x.id === id) : true)).length
  const onThisPiece = !!current && item.node_ids.length === 1 && item.node_ids[0] === current.id

  return (
    // The dialog is drawn on the page, but its events still climb to the
    // canvas through React: stopped here so nothing underneath is dragged.
    <span onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} onWheel={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <ModalDialog onClose={onClose} title="Task list" maxWidth="720px">
        <style>{ROOMY_CSS}</style>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {allPieces.length > 0 && (
            <div role="tablist" aria-label="Whose tasks" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              <button type="button" role="tab" aria-selected={tab === ALL} onClick={() => { setTab(ALL); setMoving(null) }} style={chip(tab === ALL)}>Project</button>
              {allPieces.map((p) => (
                <button key={p.id} type="button" role="tab" aria-selected={tab === p.id} onClick={() => { setTab(p.id); setMoving(null) }} style={chip(tab === p.id)}>
                  {p.title.trim() || 'Untitled'}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ ...canvasType.small, fontSize: 13, color: t.textSecondary }}>
              <b style={{ fontSize: 22, fontWeight: 600, color: t.textPrimary, marginRight: 6 }}>{allCount - doneCount}</b>
              to do{doneCount > 0 ? ` · ${doneCount} done` : ''}
            </span>
            {allCount > 0 && <Progress done={doneCount} total={allCount} width={120} />}
            {/* a piece's tab offers to make this list that piece's own */}
            {current && !disabled && (
              onThisPiece ? (
                <UnderlineLink color={t.textSecondary} onClick={() => onScope([])}>On {current.title.trim() || 'this piece'}. Put it back on the whole project</UnderlineLink>
              ) : (
                <UnderlineLink color={t.textPrimary} onClick={() => onScope([current.id])}>Add this individual task list to {current.title.trim() || 'this piece'}</UnderlineLink>
              )
            )}
            {earlierDone > 0 && (
              <button type="button" aria-pressed={showDone} onClick={() => setShowDone((v) => !v)} style={{ ...chip(showDone), marginLeft: 'auto' }}>
                {showDone ? 'Hide done' : `Show ${earlierDone} done`}
              </button>
            )}
          </div>

          {!current && item.node_ids.length > 0 && !disabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ ...canvasType.small, fontSize: 13, color: t.textSecondary, overflowWrap: 'anywhere' }}>
                This list is on {allPieces.filter((p) => item.node_ids.includes(p.id)).map((p) => p.title.trim() || 'Untitled').join(', ')}.
              </span>
              <button type="button" onClick={() => onScope([])} style={chip(false)}>Put it on the whole project</button>
            </div>
          )}

          {current ? pieceSection(current, false) : (
            <>
              {/* the project's own tasks come first */}
              <section style={section}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 2 }}>
                  <span style={heading}>For the whole project</span>
                  <span style={{ ...canvasType.chip, color: t.textMuted, whiteSpace: 'nowrap', paddingTop: 4 }}>{own.filter((x) => x.done).length} of {own.length}</span>
                </div>
                <p style={{ ...canvasType.small, fontSize: 12.5, color: t.textMuted, margin: '0 0 6px' }}>Tasks that don’t belong to one piece.</p>
                <SortableList
                  disabled={disabled}
                  label="this task"
                  onReorder={(ids) => {
                    const order = ids.map((id) => own.find((x) => x.id === id)).filter((x): x is OwnTask => !!x)
                    // Tasks tucked away stay on the list, after the ones that were moved about.
                    setOwn([...order, ...own.filter((x) => !ids.includes(x.id))])
                  }}
                  rows={sorted(own.filter((x) => shown(x.id)), (x) => x.done).map((task) => ({
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
                          onRename={(title) => setOwn(own.map((x) => (x.id === task.id ? { ...x, title } : x)))}
                          onRemove={() => setOwn(own.filter((x) => x.id !== task.id))}
                        />
                        {moving === task.id && destinations('own', (to) => moveOwn(task, to))}
                      </>
                    ),
                  }))}
                />
                {!disabled && (
                  <AutoInput
                    label="A new task for the whole project"
                    value={draftOf('own')}
                    onChange={(v) => setDraft('own', v)}
                    onSubmit={addOwn}
                    placeholder="Add a task for the whole project…"
                    style={{ ...field, marginTop: own.length ? 6 : 0 }}
                  />
                )}
              </section>

              {/* then each piece's */}
              {allPieces.map((piece) => pieceSection(piece, true))}
            </>
          )}
        </div>
      </ModalDialog>
    </span>
  )
}
