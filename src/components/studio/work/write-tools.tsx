'use client'

// The Write page's own tools, on the writing page: the core concept, the
// tasks, and what comes after the draft.
// They read and write through the same routes the Write page uses.

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { JourneyCurve, JourneyNavNode } from '@/components/widgets'
import { Card, Divider, Eyebrow } from '@/components/shell/page-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { Label } from '@/components/studio/work/bits'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, type as typeRoles, widths } from '@/lib/design-tokens'
import type { TreeNode } from '@/lib/studio/node-types'
import { TaskGroups } from '@/components/studio/work/task-groups'
import { WRITING, categoryOf } from '@/lib/studio/task-groups'
import { ConversationLogModal, type ConversationLogMessage } from '@/components/conversation/conversation-log-modal'
import { changeConcept, ConceptMirror } from '@/components/studio/work/concept-mirror'
import { EMPTY_VISION, type VisionState } from '@/lib/studio/vision/types'

export interface PieceTask {
  id: string
  title: string
  type: 'creation' | 'execution'
  status: 'pending' | 'complete'
  is_writing_related: boolean | null
  /** The group it sits under (migration 029). null: read from the older flag. */
  category?: string | null
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

/** Under Writing: generated tasks, and anything the person added there. */
export const isWritingTask = (task: PieceTask) => categoryOf(task) === WRITING

/** A piece's tasks, loaded once for the piece on screen. */
export function usePieceTools(nodeId: string | null) {
  const [tasks, setTasks] = useState<PieceTask[]>([])

  useEffect(() => {
    setTasks([])
    if (!nodeId) return
    let live = true
    fetch(`/api/studio/nodes/${nodeId}/tasks`)
      .then((r) => r.json())
      .then((d) => { if (live && Array.isArray(d.tasks)) setTasks(d.tasks) })
      .catch((err) => console.error('Failed to load tasks:', err))
    return () => { live = false }
  }, [nodeId])

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

  const renameTask = useCallback(async (task: PieceTask, title: string) => {
    if (!nodeId) return
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, title } : x)))
    try {
      await fetch(`/api/studio/nodes/${nodeId}/tasks`, { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ task_id: task.id, title }) })
    } catch (err) {
      console.error('Failed to rename task:', err)
    }
  }, [nodeId])

  const removeTask = useCallback(async (task: PieceTask) => {
    if (!nodeId) return
    setTasks((prev) => prev.filter((x) => x.id !== task.id))
    try {
      await fetch(`/api/studio/nodes/${nodeId}/tasks`, { method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify({ task_id: task.id }) })
    } catch (err) {
      console.error('Failed to remove task:', err)
    }
  }, [nodeId])

  const addTask = useCallback(async (title: string, category: string = WRITING) => {
    if (!nodeId || !title.trim()) return
    try {
      const res = await fetch(`/api/studio/nodes/${nodeId}/tasks`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ title: title.trim(), type: 'creation', category }) })
      const data = await res.json()
      if (data.task) setTasks((prev) => [...prev, data.task])
    } catch (err) {
      console.error('Failed to add task:', err)
    }
  }, [nodeId])

  return { tasks, toggleTask, addTask, removeTask, renameTask }
}

// ── the core concept ─────────────────────────────────────────────────────────

export function ConceptPanel({ node, projectId, conversationLog, vision = EMPTY_VISION, onChanged, disabled = false }: {
  node: TreeNode
  projectId: string
  /** The Idea Lab back-and-forth the concept came out of, kept on the project. */
  conversationLog?: ConversationLogMessage[] | null
  /** What the project's vision room keeps: what was decided since, and every dated change. */
  vision?: VisionState
  /** A change landed; the piece on screen should be read again. */
  onChanged?: () => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [showLog, setShowLog] = useState(false)
  const hasLog = !!conversationLog && conversationLog.some((m) => m.content?.trim())

  const conviction = (node.intent ?? '').trim()
  const journey = (node.emotional_journey ?? '').trim()
  const truth = (node.core_truth ?? '').trim()
  const stillOpen = (node.open_threads ?? []).filter((x) => x && x.trim())
  const hasConcept = !!(journey || truth || stillOpen.length)

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
          It can be built any time, from a few quick questions.
        </p>
        <Link href={`/idea-lab/conceptualise?mode=brief&project=${projectId}`} style={{ ...canvasType.small, color: t.ember, textDecoration: 'none' }}>
          Build the core concept →
        </Link>
        {hasLog && conversation}
      </div>
    )
  }

  // The concept as it stands now: locked when the piece began, still allowed
  // to move. The vision room shows this same component for this same piece,
  // so a change made on either side is already on the other.
  const kept = vision.kept.filter((k) => k.state === 'kept')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ConceptMirror
        parts={['core_truth', 'intent', 'emotional_journey', 'decided']}
        node={{ id: node.id, core_truth: node.core_truth, intent: node.intent, emotional_journey: node.emotional_journey, open_threads: node.open_threads }}
        changes={vision.changes}
        decided={kept.filter((k) => k.kind === 'decision' && (k.node_id === node.id || !k.node_id)).slice().reverse()}
        raised={kept.filter((k) => k.kind === 'open' && (k.node_id === node.id || !k.node_id))}
        disabled={disabled}
        onChange={async (action) => {
          const ok = await changeConcept(projectId, action, 'concept')
          if (ok) onChanged?.()
          return ok
        }}
      />
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

export function TasksPanel({ tasks, onToggle, onAdd, onRemove, onRename, disabled = false }: {
  tasks: PieceTask[]
  onRename?: (task: PieceTask, title: string) => void
  onToggle: (task: PieceTask) => void
  onAdd: (title: string, category: string) => Promise<void>
  onRemove: (task: PieceTask) => void
  /** Read, never changed: nothing can be ticked, added or removed. */
  disabled?: boolean
}) {
  const { t } = useTheme()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ ...canvasType.small, fontSize: 12.5, color: t.textMuted, margin: 0 }}>
        Ways into the work, not a list the piece has to satisfy. Keep what helps and remove the rest.
      </p>
      <TaskGroups tasks={tasks} onToggle={onToggle} onAdd={onAdd} onRemove={onRemove} onRename={onRename} disabled={disabled} />
    </div>
  )
}

// ── after the draft ──────────────────────────────────────────────────────────

/**
 * Under the writing: shaping the piece into sections, where the piece stands
 * on its way (Write · Test · Reflect).
 */
export function PieceFooter({
  projectId, nodeId, words, canShape, canPlace, busy, note, onShape, onPlace, onLeave, journey = true,
}: {
  projectId: string
  nodeId: string
  words: number
  canShape: boolean
  canPlace: boolean
  busy: 'shape' | 'place' | null
  note: string | null
  onShape: () => void
  onPlace: () => void
  /** Saves what's been typed; awaited before the ribbon carries you to another step. */
  onLeave: () => Promise<void>
  /** The Write · Test · Reflect ribbon. Off for an example, whose later steps have nothing behind them. */
  journey?: boolean
}) {
  const { t } = useTheme()
  return (
    <div style={{ maxWidth: widths.reading, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      {(canShape || canPlace) && (
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
        </div>
      )}
      {note && <p role="status" style={{ ...canvasType.small, color: t.textMuted, margin: 0, padding: '0 16px' }}>{note}</p>}

      <div style={{ borderTop: `1px solid ${alpha(t.textPrimary, 0.1)}`, padding: '20px 16px 0', display: 'flex', flexDirection: 'column', gap: 18 }}>
        {journey && <JourneyNavNode projectId={projectId} nodeId={nodeId} step="write" beforeNavigate={onLeave} />}
        <span style={{ ...canvasType.small, color: t.textMuted }}>
          {words} {words === 1 ? 'word' : 'words'}
        </span>
      </div>
    </div>
  )
}
