'use client'

// studio/src/components/work/pieces.tsx — the project's own column: its pieces,
// in reading order, and nothing else. What each piece is for, the rules over it,
// the threads running across them and the companion all live on the rail.

import { useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import type { Thread, TreeNode } from '@/lib/studio/node-types'
import { extentOf } from '@/lib/studio/tree'
import { Label, ThreadChips } from '@/components/work/bits'

export function Pieces({
  pieces,
  threads,
  onOpen,
  onAdd,
  onRemove,
  onReorder,
  onOpenThread,
  disabled = false,
}: {
  pieces: TreeNode[]
  threads: Thread[]
  onOpen: (id: string) => void
  onAdd: () => void
  onRemove: (piece: TreeNode) => void
  onReorder: (ids: string[]) => void
  onOpenThread: (id: string) => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const order = useRef<string[]>([])
  order.current = pieces.map((p) => p.id)

  const move = (id: string, delta: number) => {
    const ids = [...order.current]
    const from = ids.indexOf(id)
    const to = from + delta
    if (from === -1 || to < 0 || to >= ids.length) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    onReorder(ids)
  }

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return }
    const ids = [...order.current]
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    setDragId(null); setOverId(null)
    if (from === -1 || to === -1) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    onReorder(ids)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Label>the pieces, in order</Label>
        <span style={{ ...canvasType.meta, color: t.textMuted }}>
          {pieces.length} {pieces.length === 1 ? 'piece' : 'pieces'}
        </span>
      </div>

      {pieces.length === 0 && (
        <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>
          Nothing here yet. A piece is one whole thing — a film, a chapter, a song, an essay.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {pieces.map((piece, i) => {
          const dragging = dragId === piece.id
          const over = overId === piece.id && dragId !== piece.id
          return (
            <div
              key={piece.id}
              draggable={!disabled}
              onDragStart={() => setDragId(piece.id)}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              onDragOver={(e) => { e.preventDefault(); setOverId(piece.id) }}
              onDrop={(e) => { e.preventDefault(); drop(piece.id) }}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 14,
                background: t.cardBg, borderRadius: radius.widget, padding: '14px 16px',
                border: `1px solid ${over ? t.tide : alpha(t.textPrimary, 0.1)}`,
                boxShadow: over ? `inset 3px 0 0 ${t.tide}` : 'none',
                opacity: dragging ? 0.4 : 1,
                cursor: disabled ? 'default' : 'grab',
                transition: 'border-color 120ms ease',
              }}
            >
              <span style={{ ...canvasType.chip, color: t.textMuted, paddingTop: 4, width: 16, flexShrink: 0 }}>
                {i + 1}
              </span>

              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  type="button"
                  onClick={() => onOpen(piece.id)}
                  style={{
                    ...canvasType.headingMd, color: t.textPrimary, background: 'none',
                    border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer',
                  }}
                >
                  {piece.title || 'untitled piece'}
                </button>
                {piece.intent && (
                  <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>{piece.intent}</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ ...canvasType.chip, color: t.textMuted }}>
                    {piece.children.length > 0 ? `${piece.children.length} parts · ` : ''}
                    {extentOf(piece)}w
                  </span>
                  {piece.stands_whole && <span style={{ ...canvasType.chip, color: t.violet }}>stands whole</span>}
                  <ThreadChips threadIds={piece.threads} threads={threads} onOpen={onOpenThread} size="xs" />
                </div>
              </div>

              {!disabled && (
                <div style={{ display: 'flex', gap: 2, flexShrink: 0, paddingTop: 2 }}>
                  <Mini label="move this piece earlier" glyph="↑" disabled={i === 0} onClick={() => move(piece.id, -1)} />
                  <Mini label="move this piece later" glyph="↓" disabled={i === pieces.length - 1} onClick={() => move(piece.id, 1)} />
                  <Mini label="delete this piece" glyph="✕" onClick={() => onRemove(piece)} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!disabled && (
        <button
          type="button"
          onClick={onAdd}
          style={{
            ...canvasType.small, color: t.textMuted, cursor: 'pointer', textAlign: 'left',
            background: 'transparent', border: `1px dashed ${alpha(t.textPrimary, 0.2)}`,
            borderRadius: radius.widget, padding: '12px 16px',
          }}
        >
          + piece
        </button>
      )}
    </div>
  )
}

function Mini({
  label, glyph, onClick, disabled = false,
}: {
  label: string
  glyph: string
  onClick: () => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...canvasType.chip, width: 22, height: 22, padding: 0, lineHeight: '20px',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, border: `1px solid ${alpha(t.textPrimary, disabled ? 0.06 : 0.14)}`,
        background: 'transparent',
        color: disabled ? alpha(t.textPrimary, 0.2) : t.textMuted,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {glyph}
    </button>
  )
}
