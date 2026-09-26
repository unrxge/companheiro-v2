'use client'

// The Write page's own tools, on the writing page: the core concept, the
// tasks, the lines a writer wants placed, and what comes after the draft.
// They read and write through the same routes the Write page uses.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { JourneyNavNode } from '@/components/widgets'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { Label } from '@/components/studio/work/bits'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, widths } from '@/lib/design-tokens'
import type { TreeNode } from '@/lib/studio/node-types'

export interface AnchorLine { id: string; section_id: string | null; text: string }
export interface PieceTask {
  id: string
  title: string
  type: 'creation' | 'execution'
  status: 'pending' | 'complete'
  is_writing_related: boolean | null
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export const isWritingTask = (task: PieceTask) => task.type === 'creation' && task.is_writing_related !== false

/** A piece's tasks and anchor lines, loaded once for the piece on screen. */
export function usePieceTools(nodeId: string | null) {
  const [tasks, setTasks] = useState<PieceTask[]>([])
  const [lines, setLines] = useState<AnchorLine[]>([])

  const reloadLines = useCallback(async () => {
    if (!nodeId) return
    try {
      const res = await fetch(`/api/write/anchor-lines?node_id=${nodeId}`)
      const data = await res.json()
      if (Array.isArray(data.anchorLines)) setLines(data.anchorLines)
    } catch (err) {
      console.error('Failed to load anchor lines:', err)
    }
  }, [nodeId])

  useEffect(() => {
    setTasks([])
    setLines([])
    if (!nodeId) return
    let live = true
    fetch(`/api/studio/nodes/${nodeId}/tasks`)
      .then((r) => r.json())
      .then((d) => { if (live && Array.isArray(d.tasks)) setTasks(d.tasks) })
      .catch((err) => console.error('Failed to load tasks:', err))
    void reloadLines()
    return () => { live = false }
  }, [nodeId, reloadLines])

  const toggleTask = useCallback(async (task: PieceTask) => {
    if (!nodeId) return
    const status = task.status === 'complete' ? 'pending' : 'complete'
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, status } : x)))
    try {
      await fetch(`/api/studio/nodes/${nodeId}/tasks`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ task_id: task.id, status }) })
    } catch (err) {
      console.error('Failed to toggle task:', err)
    }
  }, [nodeId])

  const addTask = useCallback(async (title: string) => {
    if (!nodeId || !title.trim()) return
    try {
      const res = await fetch(`/api/studio/nodes/${nodeId}/tasks`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ title: title.trim(), type: 'creation' }) })
      const data = await res.json()
      if (data.task) setTasks((prev) => [...prev, data.task])
    } catch (err) {
      console.error('Failed to add task:', err)
    }
  }, [nodeId])

  const addLine = useCallback(async (text: string, sectionId?: string) => {
    if (!nodeId || !text.trim()) return
    try {
      const res = await fetch('/api/write/anchor-lines', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ node_id: nodeId, text: text.trim(), section_id: sectionId }) })
      const data = await res.json()
      if (data.anchorLine) setLines((prev) => [...prev, data.anchorLine])
    } catch (err) {
      console.error('Failed to add anchor line:', err)
    }
  }, [nodeId])

  const removeLine = useCallback(async (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id))
    try {
      await fetch('/api/write/anchor-lines', { method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify({ id }) })
    } catch (err) {
      console.error('Failed to delete anchor line:', err)
    }
  }, [])

  return { tasks, lines, toggleTask, addTask, addLine, removeLine, reloadLines }
}

function useFieldStyle(): React.CSSProperties {
  const { t } = useTheme()
  return {
    ...canvasType.small, color: t.textPrimary, background: t.inputBg, border: `1px solid ${t.inputBorder}`,
    borderRadius: radius.field, padding: '8px 10px', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  }
}

// ── the core concept ─────────────────────────────────────────────────────────

export function ConceptPanel({ node, projectId }: { node: TreeNode; projectId: string }) {
  const { t } = useTheme()
  const fields = [
    { label: 'Emotional journey', text: node.emotional_journey ?? '', strong: false },
    { label: 'Core truth', text: node.core_truth ?? '', strong: true },
    { label: 'Writing suggestions', text: node.substack_goals ?? '', strong: false },
    { label: 'Visuals suggestions', text: node.short_form_goals ?? '', strong: false },
  ].filter((f) => f.text.trim())
  const stillOpen = (node.open_threads ?? []).filter((x) => x && x.trim())

  if (fields.length === 0 && stillOpen.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ ...canvasType.body, color: t.textPrimary, margin: 0 }}>This piece started without a core concept.</p>
        <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>
          The concept is what a piece is shaped into sections from, and what Test reads the draft against.
          It can be built any time, from what you already have.
        </p>
        <Link href={`/idea-lab/core-concept?project=${projectId}`} style={{ ...canvasType.small, color: t.ember, textDecoration: 'none' }}>
          Build the core concept →
        </Link>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {fields.map((f) => (
        <div key={f.label}>
          <Label style={{ marginBottom: 8 }}>{f.label}</Label>
          <p style={{ ...canvasType.small, fontSize: 14, lineHeight: 1.65, margin: 0, whiteSpace: 'pre-line', color: f.strong ? t.textPrimary : t.textSecondary, fontWeight: f.strong ? 500 : 400 }}>
            {f.text}
          </p>
        </div>
      ))}
      {stillOpen.length > 0 && (
        <div>
          <Label style={{ marginBottom: 8 }}>Still open</Label>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stillOpen.map((line, i) => (
              <li key={i} style={{ ...canvasType.small, color: t.textSecondary, display: 'flex', gap: 10 }}>
                <span aria-hidden style={{ color: t.textMuted }}>—</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ── tasks ────────────────────────────────────────────────────────────────────

export function TasksPanel({ tasks, onToggle, onAdd }: {
  tasks: PieceTask[]
  onToggle: (task: PieceTask) => void
  onAdd: (title: string) => Promise<void>
}) {
  const { t } = useTheme()
  const field = useFieldStyle()
  const [draft, setDraft] = useState('')
  const [adding, setAdding] = useState(false)
  // Finished tasks sink to the bottom but stay in view.
  const shown = tasks.filter(isWritingTask).sort((a, b) => (a.status === b.status ? 0 : a.status === 'complete' ? 1 : -1))

  const add = async () => {
    const title = draft.trim()
    if (!title || adding) return
    setAdding(true)
    await onAdd(title)
    setDraft('')
    setAdding(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          aria-label="A new task"
          value={draft}
          placeholder="Add a task…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }}
          style={{ ...field, flex: 1, minWidth: 0 }}
        />
        <QuietButton size="sm" onClick={() => void add()} disabled={!draft.trim() || adding}>Add</QuietButton>
      </div>
      {shown.length === 0 ? (
        <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>No writing tasks yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {shown.map((task, i) => {
            const done = task.status === 'complete'
            return (
              <li key={task.id} style={{ borderBottom: i < shown.length - 1 ? `1px solid ${alpha(t.textPrimary, 0.08)}` : 'none' }}>
                <button
                  type="button"
                  aria-pressed={done}
                  onClick={() => onToggle(task)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}
                >
                  <span
                    aria-hidden
                    style={{
                      flexShrink: 0, width: 14, height: 14, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${done ? alpha(t.verdant, 0.5) : t.textMuted}`, background: done ? alpha(t.verdant, 0.14) : 'transparent',
                    }}
                  >
                    {done && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.verdant }} />}
                  </span>
                  <span style={{ ...canvasType.small, fontSize: 14, color: done ? t.textMuted : t.textSecondary, textDecoration: done ? 'line-through' : 'none' }}>
                    {task.title}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── anchor lines ─────────────────────────────────────────────────────────────

export function AnchorsPanel({ lines, parts, onAdd, onRemove }: {
  lines: AnchorLine[]
  parts: Array<{ id: string; label: string }>
  onAdd: (text: string) => Promise<void>
  onRemove: (id: string) => void
}) {
  const { t } = useTheme()
  const field = useFieldStyle()
  const [draft, setDraft] = useState('')
  const [placing, setPlacing] = useState(false)
  const labelOf = (id: string | null) => parts.find((p) => p.id === id)?.label ?? 'Not placed yet'

  const add = async () => {
    const text = draft.trim()
    if (!text || placing) return
    setPlacing(true)
    await onAdd(text)
    setDraft('')
    setPlacing(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <textarea
          aria-label="An anchor line"
          value={draft}
          rows={3}
          placeholder="A line dear to you — we’ll place it…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void add() } }}
          style={{ ...field, width: '100%', resize: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...canvasType.chip, color: t.textMuted }}>⌘↵ to add</span>
          <GhostButton size="sm" onClick={() => void add()} disabled={!draft.trim() || placing}>
            {placing ? 'Placing…' : 'Add'}
          </GhostButton>
        </div>
      </div>
      {lines.length === 0 ? (
        <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>No anchor lines yet.</p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {lines.map((line) => (
            <li key={line.id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ ...canvasType.small, fontSize: 14, color: t.textSecondary, fontStyle: 'italic', lineHeight: 1.5 }}>“{line.text}”</span>
                <button
                  type="button"
                  aria-label="Remove this line"
                  onClick={() => onRemove(line.id)}
                  style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '2px 4px' }}
                >
                  ✕
                </button>
              </div>
              <span style={{ ...canvasType.chip, color: t.textMuted }}>{labelOf(line.section_id)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** One part's own lines, under its header: what is placed here, and a place to add another. */
export function PartLines({ lines, onAdd, onRemove }: {
  lines: AnchorLine[]
  onAdd: (text: string) => void
  onRemove: (id: string) => void
}) {
  const { t } = useTheme()
  const field = useFieldStyle()
  const [draft, setDraft] = useState('')
  const add = () => {
    const text = draft.trim()
    if (!text) return
    onAdd(text)
    setDraft('')
  }
  return (
    <div style={{ margin: '4px 0 6px 16px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, borderRadius: radius.widget, background: alpha(t.textPrimary, 0.04) }}>
      {lines.length === 0 ? (
        <span style={{ ...canvasType.chip, color: t.textMuted }}>No lines placed here yet.</span>
      ) : (
        lines.map((line) => (
          <div key={line.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ ...canvasType.small, color: t.textSecondary, fontStyle: 'italic' }}>“{line.text}”</span>
            <button type="button" aria-label="Remove this line" onClick={() => onRemove(line.id)} style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', flexShrink: 0 }}>✕</button>
          </div>
        ))
      )}
      <textarea
        aria-label="Add a line to this part"
        value={draft}
        rows={2}
        placeholder="Add a line to this part…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); add() } }}
        style={{ ...field, width: '100%', resize: 'none' }}
      />
      <span style={{ ...canvasType.chip, color: t.textMuted }}>⌘↵ to add</span>
    </div>
  )
}

// ── after the draft ──────────────────────────────────────────────────────────

/**
 * Under the writing: shaping the piece into sections, where the piece stands
 * on its way (Write · Test · Shape · Post · Reflect).
 */
export function PieceFooter({
  projectId, nodeId, words, canShape, canPlace, canDivide, sectioned, busy, note, onShape, onPlace, onDivide, onLeave,
}: {
  projectId: string
  nodeId: string
  words: number
  canShape: boolean
  canPlace: boolean
  canDivide: boolean
  sectioned: boolean
  busy: 'shape' | 'place' | 'divide' | null
  note: string | null
  onShape: () => void
  onPlace: () => void
  onDivide: () => void
  /** Saves what's been typed; awaited before the ribbon carries you to another step. */
  onLeave: () => Promise<void>
}) {
  const { t } = useTheme()
  return (
    <div style={{ maxWidth: widths.reading, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {(canShape || canPlace || canDivide) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 16px' }}>
          {canShape && (
            <GhostButton size="sm" onClick={onShape} loading={busy === 'shape'} loadingLabel="Shaping…">
              Shape into sections
            </GhostButton>
          )}
          {canPlace && (
            <GhostButton size="sm" onClick={onPlace} loading={busy === 'place'} loadingLabel="Placing…">
              Place it in the sections
            </GhostButton>
          )}
          {canDivide && (
            <GhostButton size="sm" onClick={onDivide} loading={busy === 'divide'} loadingLabel="Dividing…">
              {sectioned ? 'Redistribute across the sections' : 'Divide into sections'}
            </GhostButton>
          )}
        </div>
      )}
      {note && <p role="status" style={{ ...canvasType.small, color: t.textMuted, margin: 0, padding: '0 16px' }}>{note}</p>}

      <div style={{ borderTop: `1px solid ${alpha(t.textPrimary, 0.1)}`, padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <JourneyNavNode projectId={projectId} nodeId={nodeId} step="write" beforeNavigate={onLeave} />
        <span style={{ ...canvasType.small, color: t.textMuted }}>
          {words} {words === 1 ? 'word' : 'words'}
        </span>
      </div>
    </div>
  )
}
