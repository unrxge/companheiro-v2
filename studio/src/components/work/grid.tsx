'use client'

// studio/src/components/work/grid.tsx — the project altitude.
//
// Two things live here and they are not the same kind of thing, so they do not
// look alike. The pieces are the work: substantial cards, in reading order.
// A thread is a line running behind them — a spine with a thin presence strip
// showing which pieces it touches, and, when opened, the small annotations
// hanging off it. An earlier version drew both as equal cells in a matrix,
// which said a whole film and a one-line reminder were the same weight.
//
// The strip keeps the one thing the matrix was for: a thread that appears in
// the first two pieces and then vanishes is visible without looking for it.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton } from '@/components/ui/buttons'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import type { Appearance, Thread, ThreadTag, TreeNode } from '@/lib/studio/node-types'
import { extentOf } from '@/lib/studio/tree'
import { InlineField, Label, hueOf } from '@/components/work/bits'

const COL = 196
const GUTTER = 210
const GAP = 8

export function Grid({
  pieces,
  threads,
  tagFor,
  appearancesFor,
  onOpenPiece,
  onOpenThread,
  onOpenNode,
  onToggle,
  onEditNote,
  onAddPiece,
  onAddThread,
  onEditThread,
  onRemoveThread,
  disabled = false,
}: {
  pieces: TreeNode[]
  threads: Thread[]
  tagFor: (nodeId: string, threadId: string) => ThreadTag | undefined
  appearancesFor: (threadId: string) => Appearance[]
  onOpenPiece: (id: string) => void
  onOpenThread: (id: string) => void
  onOpenNode: (id: string) => void
  onToggle: (nodeId: string, threadId: string, on: boolean) => void
  onEditNote: (nodeId: string, threadId: string, note: string) => void
  onAddPiece: () => void
  onAddThread: () => void
  onEditThread: (id: string, patch: Partial<Thread>) => void
  onRemoveThread: (id: string) => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const confirm = useConfirm()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [editingNote, setEditingNote] = useState<string | null>(null)

  const toggleOpen = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const removeThread = async (thread: Thread) => {
    const ok = await confirm({
      title: `Remove “${thread.name || 'this thread'}”?`,
      body: 'The parts it runs through are not touched. Only the thread and its notes go.',
      confirmLabel: 'remove the thread',
      danger: true,
    })
    if (ok) onRemoveThread(thread.id)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── the pieces ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <Label>the pieces, in order</Label>
          {!disabled && <GhostButton size="sm" onClick={onAddPiece}>+ piece</GhostButton>}
        </div>

        <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ display: 'flex', gap: GAP, paddingLeft: GUTTER + GAP }}>
            {pieces.map((piece, i) => (
              <button
                key={piece.id}
                type="button"
                onClick={() => onOpenPiece(piece.id)}
                style={{
                  width: COL, flexShrink: 0, textAlign: 'left', cursor: 'pointer',
                  background: t.cardBg, border: `1px solid ${alpha(t.textPrimary, 0.12)}`,
                  borderRadius: radius.widget, padding: 14,
                  display: 'flex', flexDirection: 'column', gap: 7, minHeight: 104,
                }}
              >
                <span style={{ ...canvasType.chip, color: t.textMuted }}>{i + 1}</span>
                <span style={{ ...canvasType.title, color: t.textPrimary }}>
                  {piece.title || 'untitled piece'}
                </span>
                {piece.intent && (
                  <span style={{ ...canvasType.small, color: t.textSecondary }}>
                    {piece.intent.length > 96 ? `${piece.intent.slice(0, 96)}…` : piece.intent}
                  </span>
                )}
                <span style={{ ...canvasType.chip, color: t.textMuted, marginTop: 'auto' }}>
                  {piece.children.length > 0 ? `${piece.children.length} parts · ` : ''}
                  {extentOf(piece)}w
                </span>
              </button>
            ))}
            {pieces.length === 0 && (
              <p style={{ ...canvasType.small, color: t.textMuted, margin: 0, alignSelf: 'center' }}>
                No pieces yet.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── the threads ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <Label>what runs across them</Label>
          {!disabled && <GhostButton size="sm" onClick={onAddThread}>+ thread</GhostButton>}
        </div>

        {threads.length === 0 ? (
          <p style={{ ...canvasType.small, color: t.textMuted, margin: 0, maxWidth: 560 }}>
            No threads yet. A thread is something that runs across the whole work — a person&rsquo;s
            arc, a question you keep seeding, an argument being built.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {threads.map((thread) => {
              const colour = hueOf(t, thread.hue)
              const appearances = appearancesFor(thread.id)
              const expanded = open.has(thread.id)
              return (
                <div key={thread.id} style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* spine + presence strip, aligned to the pieces above */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: GAP, overflowX: 'auto' }}>
                    <div
                      style={{
                        width: GUTTER, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
                        paddingLeft: 10, borderLeft: `3px solid ${colour}`,
                        borderRadius: `${radius.field}px 0 0 ${radius.field}px`,
                        background: alpha(colour, expanded ? 0.1 : 0.05),
                        minHeight: 40,
                      }}
                    >
                      <button
                        type="button"
                        aria-expanded={expanded}
                        aria-label={expanded ? 'collapse this thread' : 'expand this thread'}
                        onClick={() => toggleOpen(thread.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          padding: 0, margin: 0, color: colour, flexShrink: 0,
                          width: 16, height: 16, lineHeight: '16px', fontSize: 11,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          transform: expanded ? 'rotate(90deg)' : 'none',
                          transition: 'transform 140ms ease',
                        }}
                      >
                        ▶
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <InlineField
                          ariaLabel="thread name"
                          value={thread.name}
                          placeholder="name this thread…"
                          disabled={disabled}
                          onCommit={(name) => onEditThread(thread.id, { name })}
                          style={{ ...canvasType.words, fontSize: 14, color: colour }}
                        />
                      </div>
                      <span style={{ ...canvasType.chip, color: alpha(colour, 0.75), flexShrink: 0, paddingRight: 8 }}>
                        {appearances.length}
                      </span>
                    </div>

                    {/* one segment per piece: solid on the piece, faint inside it */}
                    {pieces.map((piece) => {
                      // Solid when the thread is marked on the piece itself; faint
                      // when something inside the piece carries it, so tagging a
                      // scene draws the map without anyone planning it here.
                      const direct = Boolean(tagFor(piece.id, thread.id))
                      const carried = appearances.some((a) => a.rootId === piece.id && a.node.id !== piece.id)
                      const on = direct || carried
                      return (
                        <button
                          key={`${thread.id}:${piece.id}`}
                          type="button"
                          aria-pressed={direct}
                          aria-label={`${direct ? 'take' : 'put'} ${piece.title || 'this piece'} ${direct ? 'off' : 'on'} ${thread.name || 'this thread'}`}
                          disabled={disabled}
                          onClick={() => {
                            if (direct) onToggle(piece.id, thread.id, false)
                            else { onToggle(piece.id, thread.id, true); setEditingNote(`${piece.id}:${thread.id}`); setOpen((p) => new Set(p).add(thread.id)) }
                          }}
                          title={direct ? 'marked on this piece' : carried ? 'carried by something inside' : 'not here'}
                          style={{
                            width: COL, flexShrink: 0, height: 10, padding: 0,
                            borderRadius: 999, cursor: disabled ? 'default' : 'pointer',
                            border: `1px solid ${on ? alpha(colour, 0.5) : alpha(t.textPrimary, 0.12)}`,
                            background: direct ? colour : carried ? alpha(colour, 0.3) : 'transparent',
                          }}
                        />
                      )
                    })}
                  </div>

                  {/* the annotations, hanging off the spine */}
                  {expanded && (
                    <div style={{ paddingLeft: 13, marginTop: 2, marginBottom: 8 }}>
                      <div
                        style={{
                          borderLeft: `2px solid ${alpha(colour, 0.45)}`,
                          paddingLeft: 16,
                          display: 'flex', flexDirection: 'column', gap: 2,
                        }}
                      >
                        <div style={{ paddingTop: 8, maxWidth: 700 }}>
                          <InlineField
                            ariaLabel="what this thread is for"
                            value={thread.intent}
                            placeholder="what does this thread have to do across the whole work?"
                            multiline
                            disabled={disabled}
                            onCommit={(intent) => onEditThread(thread.id, { intent })}
                            style={{ ...canvasType.small, color: t.textSecondary, fontStyle: 'italic' }}
                          />
                        </div>

                        {appearances.length === 0 ? (
                          <p style={{ ...canvasType.small, color: t.textMuted, margin: '6px 0 0' }}>
                            Not in any part yet. Tap a bar above to put it on a piece.
                          </p>
                        ) : (
                          <ul style={{ listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column' }}>
                            {appearances.map((a) => {
                              const key = `${a.node.id}:${thread.id}`
                              const note = tagFor(a.node.id, thread.id)?.note ?? ''
                              return (
                                <li
                                  key={key}
                                  style={{
                                    display: 'flex', gap: 10, alignItems: 'baseline',
                                    padding: '5px 0', position: 'relative',
                                  }}
                                >
                                  <span
                                    aria-hidden
                                    style={{
                                      position: 'absolute', left: -16, top: 13, width: 11, height: 2,
                                      background: alpha(colour, 0.45),
                                    }}
                                  />
                                  {/* The part's own name never truncates; the piece it
                                      sits in gives way first, because the name is what
                                      you are looking for and the context is a reminder. */}
                                  <button
                                    type="button"
                                    onClick={() => onOpenNode(a.node.id)}
                                    title={a.trail.join(' / ')}
                                    style={{
                                      ...canvasType.chip, background: 'none', border: 'none',
                                      padding: 0, cursor: 'pointer', textAlign: 'left',
                                      width: 184, flexShrink: 0, display: 'flex', gap: 5,
                                      alignItems: 'baseline', overflow: 'hidden',
                                    }}
                                  >
                                    {a.trail.length > 1 && (
                                      <span
                                        style={{
                                          color: alpha(t.textPrimary, 0.32), minWidth: 0,
                                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {a.trail[a.trail.length - 2]}
                                      </span>
                                    )}
                                    <span style={{ color: t.textMuted, flexShrink: 0, whiteSpace: 'nowrap' }}>
                                      {a.trail[a.trail.length - 1]}
                                    </span>
                                  </button>
                                  <div style={{ flex: 1, minWidth: 0, maxWidth: 520 }}>
                                    {editingNote === key ? (
                                      <InlineField
                                        ariaLabel="what this part does for this thread"
                                        value={note}
                                        placeholder="what it does here…"
                                        multiline
                                        disabled={disabled}
                                        onCommit={(next) => { onEditNote(a.node.id, thread.id, next); setEditingNote(null) }}
                                        style={{ ...canvasType.small, color: t.textPrimary }}
                                      />
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => setEditingNote(key)}
                                        style={{
                                          ...canvasType.small, color: note ? t.textPrimary : t.textMuted,
                                          background: 'none', border: 'none', padding: 0,
                                          textAlign: 'left', cursor: disabled ? 'default' : 'text', width: '100%',
                                        }}
                                      >
                                        {note || 'say what it does here'}
                                      </button>
                                    )}
                                  </div>
                                  {!disabled && a.direct && (
                                    <button
                                      type="button"
                                      aria-label="take this part off the thread"
                                      onClick={() => onToggle(a.node.id, thread.id, false)}
                                      style={{
                                        ...canvasType.chip, color: t.textMuted, background: 'none',
                                        border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0,
                                      }}
                                    >
                                      ✕
                                    </button>
                                  )}
                                </li>
                              )
                            })}
                          </ul>
                        )}

                        <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
                          <button
                            type="button"
                            onClick={() => onOpenThread(thread.id)}
                            style={{ ...canvasType.chip, color: colour, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                          >
                            read it through
                          </button>
                          {!disabled && (
                            <button
                              type="button"
                              onClick={() => void removeThread(thread)}
                              style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                            >
                              remove
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
