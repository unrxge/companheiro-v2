'use client'

// The Write page's own tools, on the writing page: the core concept, the
// tasks, the lines a writer wants placed, and what comes after the draft.
// They read and write through the same routes the Write page uses.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { JourneyCurve, JourneyNavNode } from '@/components/widgets'
import { Card, Divider, Eyebrow } from '@/components/shell/page-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { Label } from '@/components/studio/work/bits'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, type as typeRoles, widths } from '@/lib/design-tokens'
import type { TreeNode } from '@/lib/studio/node-types'
import { ConversationLogModal, type ConversationLogMessage } from '@/components/conversation/conversation-log-modal'

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

export function ConceptPanel({ node, projectId, theme, conversationLog }: {
  node: TreeNode
  projectId: string
  /** The project's theme, from the core concept's first phase. */
  theme?: string | null
  /** The Idea Lab back-and-forth the concept came out of, kept on the project. */
  conversationLog?: ConversationLogMessage[] | null
}) {
  const { t } = useTheme()
  const [showLog, setShowLog] = useState(false)
  const hasLog = !!conversationLog && conversationLog.some((m) => m.content?.trim())

  const conviction = (node.intent ?? '').trim()
  const journey = (node.emotional_journey ?? '').trim()
  const truth = (node.core_truth ?? '').trim()
  const suggestions = (node.substack_goals ?? '').trim()
  const visuals = (node.short_form_goals ?? '').trim()
  const stillOpen = (node.open_threads ?? []).filter((x) => x && x.trim())
  const hasConcept = !!(journey || truth || suggestions || visuals || stillOpen.length)

  const conversation = (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      {hasLog ? (
        <button
          type="button"
          onClick={() => setShowLog(true)}
          style={{
            ...canvasType.small, padding: 0, background: 'none', border: 'none',
            color: t.ember, cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3,
          }}
        >
          Read the conversation that shaped this
        </button>
      ) : (
        <span style={{ ...canvasType.chip, color: t.textMuted, textAlign: 'center' }}>
          No Idea Lab conversation was kept for this piece.
        </span>
      )}
      {showLog && conversationLog && (
        <ConversationLogModal messages={conversationLog} onClose={() => setShowLog(false)} title="How this idea took shape" />
      )}
    </div>
  )

  if (!hasConcept) {
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
        {hasLog && conversation}
      </div>
    )
  }

  const body: React.CSSProperties = { ...typeRoles.ui, fontSize: 14, lineHeight: 1.65, color: t.textSecondary, margin: 0 }

  // The same document the core concept page locks, read-only: cards per phase,
  // the journey drawn as a curve, the lists dashed.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {(conviction || theme) && (
        <Card inner padding={18}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {theme && (
              <div>
                <Eyebrow style={{ marginBottom: 8 }}>Theme</Eyebrow>
                <p style={{ ...typeRoles.ui, fontSize: 15, color: t.textPrimary, margin: 0 }}>{theme}</p>
              </div>
            )}
            {conviction && (
              <div>
                <Eyebrow style={{ marginBottom: 10 }}>Conviction</Eyebrow>
                <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
                  <div style={{ width: 3, borderRadius: 2, background: t.ember, flexShrink: 0, opacity: 0.6 }} />
                  <p style={{ ...typeRoles.ui, fontSize: 15, lineHeight: 1.65, fontWeight: 500, color: t.textPrimary, margin: 0, whiteSpace: 'pre-line' }}>{conviction}</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {journey && (
        <Card inner padding={18}>
          <Eyebrow style={{ marginBottom: 10 }}>Emotional journey</Eyebrow>
          <JourneyCurve text={journey} />
          <p style={{ ...body, marginTop: 12, whiteSpace: 'pre-line' }}>{journey}</p>
        </Card>
      )}

      {truth && (
        <Card inner padding="26px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center' }}>
            <Eyebrow>Core truth</Eyebrow>
            <p style={{ ...typeRoles.ui, fontSize: 18, fontWeight: 500, lineHeight: 1.5, letterSpacing: '-0.02em', color: t.textPrimary, margin: 0 }}>{truth}</p>
          </div>
        </Card>
      )}

      {suggestions && (
        <Card inner padding={18}>
          <Eyebrow style={{ marginBottom: 4 }}>Writing suggestions</Eyebrow>
          <DashedList lines={suggestions.split('\n')} />
        </Card>
      )}

      {stillOpen.length > 0 && (
        <Card inner padding={18}>
          <Eyebrow style={{ marginBottom: 4 }}>Open threads</Eyebrow>
          <DashedList lines={stillOpen} />
        </Card>
      )}

      {visuals && (
        <Card inner padding={18}>
          <Eyebrow style={{ marginBottom: 8 }}>Visuals suggestions</Eyebrow>
          <p style={{ ...body, whiteSpace: 'pre-line' }}>{visuals}</p>
        </Card>
      )}

      <div style={{ paddingTop: 8 }}>{conversation}</div>
    </div>
  )
}

function DashedList({ lines }: { lines: string[] }) {
  const { t } = useTheme()
  const items = lines.map((l) => l.replace(/^[\-\*•]\s*/, '').trim()).filter(Boolean)
  return (
    <div>
      {items.map((line, i) => (
        <div key={i}>
          <div style={{ display: 'flex', gap: 10, ...typeRoles.ui, fontSize: 14, lineHeight: 1.55, color: t.textPrimary, padding: '9px 0' }}>
            <span style={{ color: t.ember, flexShrink: 0 }}>—</span>
            <span>{line}</span>
          </div>
          {i < items.length - 1 && <Divider />}
        </div>
      ))}
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
          aria-label="A fragment"
          value={draft}
          rows={5}
          placeholder="A line, an image, a half-thought you don’t want to lose. Drop it here, however unfinished. We’ll find the section it belongs in, and the writing assistant will help you work it into the prose."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void add() } }}
          style={{ ...field, width: '100%', resize: 'none' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...canvasType.chip, color: t.textMuted }}>⌘↵ to add</span>
          <GhostButton size="sm" onClick={() => void add()} disabled={!draft.trim()} loading={placing} loadingLabel="Placing…">
            Add
          </GhostButton>
        </div>
      </div>
      {lines.length === 0 ? (
        <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>No fragments yet.</p>
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
        <span style={{ ...canvasType.chip, color: t.textMuted }}>No fragments placed here yet.</span>
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
 * on its way (Write · Reimagine · Test · Post · Reflect).
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
