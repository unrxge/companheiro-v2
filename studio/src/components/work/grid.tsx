'use client'

// studio/src/components/work/grid.tsx — the project altitude: pieces across,
// threads down.
//
// The oldest device in television writing, and it is here for the thing a
// timeline cannot show — what runs ACROSS the sequence rather than sitting
// inside it. A thread appearing in the first two pieces and then vanishing is
// the structural failure nobody catches in time; on this grid it is obvious.
//
// A cell is one click to mark, and carries what that part does for that thread.

import { useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton } from '@/components/ui/buttons'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import type { Thread, ThreadTag, TreeNode } from '@/lib/studio/node-types'
import { extentOf, flatten } from '@/lib/studio/tree'
import { InlineField, Label, hueOf } from '@/components/work/bits'

const COL = 190
const ROW_LABEL = 190

export function Grid({
  pieces,
  threads,
  tagFor,
  onOpenPiece,
  onOpenThread,
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
  onOpenPiece: (id: string) => void
  onOpenThread: (id: string) => void
  onToggle: (nodeId: string, threadId: string, on: boolean) => void
  onEditNote: (nodeId: string, threadId: string, note: string) => void
  onAddPiece: () => void
  onAddThread: () => void
  onEditThread: (id: string, patch: Partial<Thread>) => void
  onRemoveThread: (id: string) => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [openCell, setOpenCell] = useState<string | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Label>pieces across, threads down</Label>
        {!disabled && (
          <div style={{ display: 'flex', gap: 8 }}>
            <GhostButton size="sm" onClick={onAddThread}>+ thread</GhostButton>
            <GhostButton size="sm" onClick={onAddPiece}>+ piece</GhostButton>
          </div>
        )}
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 6 }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', minWidth: '100%' }}>

          {/* the pieces */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
            <div style={{ width: ROW_LABEL, flexShrink: 0 }} />
            {pieces.map((piece, i) => (
              <button
                key={piece.id}
                type="button"
                onClick={() => onOpenPiece(piece.id)}
                style={{
                  width: COL, flexShrink: 0, textAlign: 'left', cursor: 'pointer',
                  background: t.cardBg, border: `1px solid ${alpha(t.textPrimary, 0.12)}`,
                  borderRadius: radius.widget, padding: 12,
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}
              >
                <span style={{ ...canvasType.chip, color: t.textMuted }}>{i + 1}</span>
                <span style={{ ...canvasType.title, color: t.textPrimary }}>
                  {piece.title || 'untitled piece'}
                </span>
                <span style={{ ...canvasType.chip, color: t.textMuted }}>
                  {piece.children.length > 0 ? `${piece.children.length} parts · ` : ''}
                  {extentOf(piece)}w
                </span>
              </button>
            ))}
            {pieces.length === 0 && (
              <p style={{ ...canvasType.small, color: t.textMuted, margin: 0, alignSelf: 'center' }}>
                no pieces yet.
              </p>
            )}
          </div>

          {/* the threads */}
          {threads.map((thread) => {
            const colour = hueOf(t, thread.hue)
            return (
              <div key={thread.id} style={{ display: 'flex', gap: 8, alignItems: 'stretch', marginTop: 8 }}>
                <div
                  style={{
                    width: ROW_LABEL, flexShrink: 0, padding: 10,
                    borderRadius: radius.widget, background: alpha(colour, 0.08),
                    borderLeft: `3px solid ${colour}`,
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                >
                  <InlineField
                    ariaLabel="thread name"
                    value={thread.name}
                    placeholder="name this thread…"
                    disabled={disabled}
                    onCommit={(name) => onEditThread(thread.id, { name })}
                    style={{ ...canvasType.title, color: colour }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => onOpenThread(thread.id)}
                      style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                    >
                      read it through
                    </button>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => onRemoveThread(thread.id)}
                        style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        remove
                      </button>
                    )}
                  </div>
                </div>

                {pieces.map((piece) => {
                  const tag = tagFor(piece.id, thread.id)
                  const on = Boolean(tag)
                  // A thread marked on a scene deep inside a piece still runs
                  // through that piece. The map draws itself from the work
                  // rather than waiting to be planned at the top.
                  const inside = !on && flatten(piece.children).some((d) => d.threads.includes(thread.id))
                  const key = `${piece.id}:${thread.id}`
                  const open = openCell === key
                  return (
                    <div
                      key={key}
                      style={{
                        width: COL, flexShrink: 0, minHeight: 56,
                        borderRadius: radius.widget,
                        border: `1px solid ${on ? alpha(colour, 0.45) : inside ? alpha(colour, 0.22) : alpha(t.textPrimary, 0.08)}`,
                        background: on ? alpha(colour, 0.1) : inside ? alpha(colour, 0.04) : 'transparent',
                        padding: 8, display: 'flex', flexDirection: 'column', gap: 6,
                      }}
                    >
                      <button
                        type="button"
                        aria-pressed={on}
                        aria-label={on ? 'remove from this thread' : 'add to this thread'}
                        disabled={disabled}
                        onClick={() => {
                          if (on) onToggle(piece.id, thread.id, false)
                          else { onToggle(piece.id, thread.id, true); setOpenCell(key) }
                        }}
                        style={{
                          alignSelf: 'flex-start', width: 14, height: 14, borderRadius: 4,
                          border: `1px solid ${on || inside ? colour : alpha(t.textPrimary, 0.25)}`,
                          background: on ? colour : inside ? alpha(colour, 0.35) : 'transparent',
                          cursor: disabled ? 'default' : 'pointer', padding: 0,
                        }}
                      />
                      {!on && inside && (
                        <span style={{ ...canvasType.small, color: alpha(colour, 0.85) }}>
                          {flatten(piece.children).filter((d) => d.threads.includes(thread.id)).length} inside
                        </span>
                      )}
                      {on && (
                        open ? (
                          <InlineField
                            ariaLabel="what this part does for this thread"
                            value={tag?.note ?? ''}
                            placeholder="what it does here…"
                            multiline
                            disabled={disabled}
                            onCommit={(note) => { onEditNote(piece.id, thread.id, note); setOpenCell(null) }}
                            style={{ ...canvasType.small, color: t.textPrimary }}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setOpenCell(key)}
                            style={{
                              ...canvasType.small, color: tag?.note ? t.textSecondary : t.textMuted,
                              background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer',
                            }}
                          >
                            {tag?.note || 'say what it does here'}
                          </button>
                        )
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {threads.length === 0 && (
            <p style={{ ...canvasType.small, color: t.textMuted, margin: '12px 0 0' }}>
              no threads yet. a thread is something that runs across the whole work — a person&rsquo;s
              arc, a question you keep seeding, an argument being built.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
