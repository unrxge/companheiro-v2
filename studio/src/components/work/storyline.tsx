'use client'

// studio/src/components/work/storyline.tsx — one part of the work seen whole.
//
// The blocks are its parts, laid out left to right in reading order and sized
// by extent, so pacing is visible: a part four times the size of everything
// around it is a structural fact you cannot see any other way. The bar beneath
// carries the beat each part is meant to hit. Dragging reorders.
//
// The alternative is flow: the same parts read continuously, chrome removed.

import { useMemo, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import type { Thread, TreeNode } from '@/lib/studio/node-types'
import { extentOf, storylineShares } from '@/lib/studio/tree'
import { htmlToPlainText } from '@/lib/rich-text'
import { InlineField, Label, ThreadChips } from '@/components/work/bits'

export function Storyline({
  parts,
  threads,
  onOpen,
  onReorder,
  onEditBeat,
  onAdd,
  disabled = false,
}: {
  parts: TreeNode[]
  threads: Thread[]
  onOpen: (id: string) => void
  onReorder: (ids: string[]) => void
  onEditBeat: (id: string, beat: string) => void
  onAdd: (afterId: string | null) => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const order = useRef<string[]>([])

  const shares = useMemo(() => storylineShares(parts), [parts])
  order.current = parts.map((p) => p.id)

  const drop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return }
    const ids = [...order.current]
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from === -1 || to === -1) { setDragId(null); setOverId(null); return }
    ids.splice(from, 1)
    ids.splice(to, 0, dragId)
    setDragId(null)
    setOverId(null)
    onReorder(ids)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
        <Label>the parts, in order</Label>
        <span style={{ ...canvasType.meta, color: t.textMuted }}>
          {parts.length} {parts.length === 1 ? 'part' : 'parts'} · {extentOf({ children: parts } as TreeNode)} words
        </span>
      </div>

      {/* the blocks */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch', overflowX: 'auto', paddingBottom: 4 }}>
        {parts.map((part, i) => {
          const dragging = dragId === part.id
          const over = overId === part.id && dragId !== part.id
          const words = extentOf(part)
          return (
            <div
              key={part.id}
              draggable={!disabled}
              onDragStart={() => setDragId(part.id)}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              onDragOver={(e) => { e.preventDefault(); setOverId(part.id) }}
              onDrop={(e) => { e.preventDefault(); drop(part.id) }}
              style={{
                flex: `${Math.max(shares[i] * 100, 12)} 1 0`,
                minWidth: 148,
                opacity: dragging ? 0.4 : 1,
                borderRadius: radius.widget,
                border: `1px solid ${over ? t.tide : alpha(t.textPrimary, 0.12)}`,
                boxShadow: over ? `inset 3px 0 0 ${t.tide}` : 'none',
                background: t.cardBg,
                padding: 12,
                display: 'flex', flexDirection: 'column', gap: 8,
                cursor: disabled ? 'default' : 'grab',
                transition: 'border-color 120ms ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ ...canvasType.chip, color: t.textMuted }}>{i + 1}</span>
                <span style={{ ...canvasType.chip, color: t.textMuted }}>
                  {words > 0 ? `${words}w` : 'empty'}
                </span>
              </div>

              <button
                type="button"
                onClick={() => onOpen(part.id)}
                style={{
                  ...canvasType.title, color: t.textPrimary, background: 'none', border: 'none',
                  padding: 0, textAlign: 'left', cursor: 'pointer',
                }}
              >
                {part.title || 'untitled part'}
              </button>

              {part.intent && (
                <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>
                  {part.intent.length > 120 ? `${part.intent.slice(0, 120)}…` : part.intent}
                </p>
              )}

              {part.children.length > 0 && (
                <span style={{ ...canvasType.chip, color: t.textMuted }}>
                  {part.children.length} inside
                </span>
              )}

              <ThreadChips threadIds={part.threads} threads={threads} size="xs" />

              <div style={{ marginTop: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
                {part.stands_whole && (
                  <span style={{ ...canvasType.chip, color: t.violet }}>stands whole</span>
                )}
                {part.status !== 'open' && (
                  <span style={{ ...canvasType.chip, color: part.status === 'done' ? t.verdant : t.ochre }}>
                    {part.status}
                  </span>
                )}
              </div>
            </div>
          )
        })}

        {!disabled && (
          <button
            type="button"
            onClick={() => onAdd(parts.length ? parts[parts.length - 1].id : null)}
            style={{
              flex: '0 0 auto', minWidth: 96, borderRadius: radius.widget,
              border: `1px dashed ${alpha(t.textPrimary, 0.2)}`, background: 'transparent',
              color: t.textMuted, cursor: 'pointer', ...canvasType.small, padding: 12,
            }}
          >
            + part
          </button>
        )}
      </div>

      {/* the beat each part is meant to hit */}
      {parts.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Label>the journey</Label>
          <div style={{ position: 'relative', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <div
              aria-hidden
              style={{
                position: 'absolute', left: 0, right: 0, top: 7, height: 1,
                background: alpha(t.textPrimary, 0.14),
              }}
            />
            {parts.map((part, i) => (
              <div
                key={part.id}
                style={{
                  flex: `${Math.max(shares[i] * 100, 12)} 1 0`, minWidth: 148,
                  display: 'flex', flexDirection: 'column', gap: 6, position: 'relative',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 9, height: 9, borderRadius: 999, marginTop: 3,
                    background: part.beat ? t.ochre : alpha(t.textPrimary, 0.25),
                    outline: `3px solid ${t.containerBg}`,
                  }}
                />
                <InlineField
                  ariaLabel={`the beat for ${part.title || 'this part'}`}
                  value={part.beat}
                  disabled={disabled}
                  placeholder="what it has to do here…"
                  onCommit={(next) => onEditBeat(part.id, next)}
                  multiline
                  style={{ ...canvasType.small, color: t.textSecondary }}
                />
              </div>
            ))}
            {!disabled && <div style={{ flex: '0 0 auto', minWidth: 96 }} />}
          </div>
        </div>
      )}
    </div>
  )
}

/** The same parts, read continuously, with the chrome removed. */
export function FlowRead({ parts }: { parts: TreeNode[] }) {
  const { t } = useTheme()
  const pieces = useMemo(
    () =>
      parts
        .map((p) => ({ id: p.id, title: p.title, text: htmlToPlainText(p.body).trim() }))
        .filter((p) => p.text || p.title),
    [parts],
  )

  if (pieces.length === 0) {
    return <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>nothing written yet.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 680 }}>
      {pieces.map((p) => (
        <section key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {p.title && (
            <h3 style={{ ...canvasType.headingMd, color: t.textMuted, margin: 0 }}>{p.title}</h3>
          )}
          {p.text.split(/\n{2,}/).map((para, i) => (
            <p key={i} style={{ ...canvasType.body, color: t.textPrimary, margin: 0 }}>{para}</p>
          ))}
        </section>
      ))}
    </div>
  )
}
