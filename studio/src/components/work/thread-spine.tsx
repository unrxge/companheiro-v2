'use client'

// studio/src/components/work/thread-spine.tsx — a thread, drawn as what it is.
//
// A trunk running down, with a branch out to every place the thread surfaces,
// in reading order. The gaps are the point: where the trunk runs on with no
// branch off it, the thread has gone quiet, and that is the failure nobody
// catches until it is too late.
//
// It lives in the drawer, so vertical is also simply the right shape.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton } from '@/components/ui/buttons'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import type { Appearance, Thread, ThreadTag, TreeNode } from '@/lib/studio/node-types'
import { InlineField, Label, hueOf } from '@/components/work/bits'

const TRUNK = 9   // where the trunk sits, from the left edge
const BRANCH = 18 // how far a branch reaches out

export function ThreadSpines({
  threads,
  pieces,
  appearancesFor,
  tagFor,
  onOpenNode,
  onOpenThread,
  onToggle,
  onEditNote,
  onEditThread,
  onAddThread,
  onRemoveThread,
  disabled = false,
}: {
  threads: Thread[]
  /** The pieces, so a thread can be put on one without leaving the drawer. */
  pieces: TreeNode[]
  appearancesFor: (threadId: string) => Appearance[]
  tagFor: (nodeId: string, threadId: string) => ThreadTag | undefined
  onOpenNode: (id: string) => void
  onOpenThread: (id: string) => void
  onToggle: (nodeId: string, threadId: string, on: boolean) => void
  onEditNote: (nodeId: string, threadId: string, note: string) => void
  onEditThread: (id: string, patch: Partial<Thread>) => void
  onAddThread: () => void
  onRemoveThread: (id: string) => void
  disabled?: boolean
}) {
  const { t } = useTheme()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {threads.length === 0 && (
        <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>
          No threads yet. A thread is something that runs across the whole work — a person&rsquo;s
          arc, a question you keep seeding, an argument being built.
        </p>
      )}

      {threads.map((thread) => (
        <Spine
          key={thread.id}
          thread={thread}
          pieces={pieces}
          appearances={appearancesFor(thread.id)}
          tagFor={tagFor}
          onOpenNode={onOpenNode}
          onOpenThread={onOpenThread}
          onToggle={onToggle}
          onEditNote={onEditNote}
          onEditThread={onEditThread}
          onRemoveThread={onRemoveThread}
          disabled={disabled}
        />
      ))}

      {!disabled && (
        <GhostButton size="sm" onClick={onAddThread}>+ thread</GhostButton>
      )}
    </div>
  )
}

function Spine({
  thread,
  pieces,
  appearances,
  tagFor,
  onOpenNode,
  onOpenThread,
  onToggle,
  onEditNote,
  onEditThread,
  onRemoveThread,
  disabled,
}: {
  thread: Thread
  pieces: TreeNode[]
  appearances: Appearance[]
  tagFor: (nodeId: string, threadId: string) => ThreadTag | undefined
  onOpenNode: (id: string) => void
  onOpenThread: (id: string) => void
  onToggle: (nodeId: string, threadId: string, on: boolean) => void
  onEditNote: (nodeId: string, threadId: string, note: string) => void
  onEditThread: (id: string, patch: Partial<Thread>) => void
  onRemoveThread: (id: string) => void
  disabled: boolean
}) {
  const { t } = useTheme()
  const confirm = useConfirm()
  const colour = hueOf(t, thread.hue)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  // Reading order, piece by piece: a run of pieces with nothing on them is the
  // silence the trunk is there to show.
  const touched = new Set(appearances.map((a) => a.rootId))

  const remove = async () => {
    const ok = await confirm({
      title: `Remove “${thread.name || 'this thread'}”?`,
      body: 'The parts it runs through are not touched. Only the thread and its notes go.',
      confirmLabel: 'remove the thread',
      danger: true,
    })
    if (ok) onRemoveThread(thread.id)
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* the head of the trunk */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            aria-hidden
            style={{ width: 10, height: 10, borderRadius: 999, background: colour, flexShrink: 0, transform: 'translateY(1px)' }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <InlineField
              ariaLabel="thread name"
              value={thread.name}
              placeholder="name this thread…"
              disabled={disabled}
              onCommit={(name) => onEditThread(thread.id, { name })}
              style={{ ...canvasType.title, color: colour }}
            />
          </div>
        </div>
        <div style={{ paddingLeft: TRUNK + BRANCH }}>
          <InlineField
            ariaLabel="what this thread is for"
            value={thread.intent}
            placeholder="what does it have to do across the whole work?"
            multiline
            disabled={disabled}
            onCommit={(intent) => onEditThread(thread.id, { intent })}
            style={{ ...canvasType.small, color: t.textSecondary, fontStyle: 'italic' }}
          />
        </div>
      </div>

      {/* the trunk, and a branch to every place it surfaces */}
      <div style={{ position: 'relative', paddingLeft: TRUNK }}>
        <span
          aria-hidden
          style={{
            position: 'absolute', left: TRUNK, top: 2, bottom: 10, width: 2,
            background: alpha(colour, 0.35), borderRadius: 2,
          }}
        />

        {appearances.length === 0 ? (
          <p style={{ ...canvasType.small, color: t.textMuted, margin: 0, paddingLeft: BRANCH + 6 }}>
            Not anywhere yet.
          </p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {appearances.map((a) => {
              const note = tagFor(a.node.id, thread.id)?.note ?? ''
              const key = `${a.node.id}:${thread.id}`
              return (
                <li key={key} style={{ position: 'relative', paddingLeft: BRANCH + 6, paddingBottom: 12 }}>
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', left: 0, top: 9, width: BRANCH, height: 2,
                      background: alpha(colour, 0.35), borderRadius: 2,
                    }}
                  />
                  <span
                    aria-hidden
                    style={{
                      position: 'absolute', left: BRANCH - 2, top: 5, width: 8, height: 8,
                      borderRadius: 999, background: colour,
                    }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => onOpenNode(a.node.id)}
                        title={a.trail.join(' / ')}
                        style={{
                          ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none',
                          padding: 0, cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {a.trail.join(' / ')}
                      </button>
                      {!disabled && (
                        <button
                          type="button"
                          aria-label="take this part off the thread"
                          onClick={() => onToggle(a.node.id, thread.id, false)}
                          style={{
                            ...canvasType.chip, color: t.textMuted, background: 'none',
                            border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0,
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {editing === key ? (
                      <InlineField
                        ariaLabel="what this part does for this thread"
                        value={note}
                        placeholder="what it does here…"
                        multiline
                        disabled={disabled}
                        onCommit={(next) => { onEditNote(a.node.id, thread.id, next); setEditing(null) }}
                        style={{ ...canvasType.small, color: t.textPrimary }}
                      />
                    ) : (
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setEditing(key)}
                        style={{
                          ...canvasType.small, color: note ? t.textPrimary : t.textMuted,
                          background: 'none', border: 'none', padding: 0, textAlign: 'left',
                          cursor: disabled ? 'default' : 'text', width: '100%',
                        }}
                      >
                        {note || 'say what it does here'}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        {/* the foot: put it on another piece without leaving the panel */}
        {!disabled && (
          <div style={{ paddingLeft: BRANCH + 6 }}>
            {adding ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2 }}>
                <Label>put it on…</Label>
                {pieces.filter((p) => !tagFor(p.id, thread.id)).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onToggle(p.id, thread.id, true)
                      setEditing(`${p.id}:${thread.id}`)
                      setAdding(false)
                    }}
                    style={{
                      ...canvasType.small, color: t.textPrimary, background: alpha(colour, 0.08),
                      border: `1px solid ${alpha(colour, 0.25)}`, borderRadius: radius.field,
                      padding: '5px 9px', textAlign: 'left', cursor: 'pointer',
                    }}
                  >
                    {p.title || 'untitled piece'}
                    {!touched.has(p.id) && (
                      <span style={{ ...canvasType.chip, color: t.textMuted }}> · quiet here</span>
                    )}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', padding: '4px 0', cursor: 'pointer', textAlign: 'left' }}
                >
                  never mind
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  style={{ ...canvasType.chip, color: colour, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  + put it somewhere
                </button>
                <button
                  type="button"
                  onClick={() => onOpenThread(thread.id)}
                  style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  read it through
                </button>
                <button
                  type="button"
                  onClick={() => void remove()}
                  style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                >
                  remove
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
