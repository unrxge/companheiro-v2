'use client'

// studio/src/components/canvas/chrome/blocks-list-panel.tsx — the layers list
// (6.4): rows in stack order (top = front), children grouped under their frame
// with a 12 px indent; each row: drag handle, type dot, name (or first line,
// editable on double-click), eye / lock toggles that fade in on hover. Click →
// select + fit([block]) capped at 1.25 (locked blocks are selectable only here,
// D-026). Struck rows at .5; hidden rows at .5 with the eye crossed. Top-level
// rows drag-reorder → actions.reorderZ(front-first order).

import { useMemo, useState } from 'react'
import { Eye, EyeOff, GripVertical, Lock, LockOpen } from 'lucide-react'
import { tokensFor } from '@/lib/design-tokens'
import { canvasType, glass } from '@/lib/studio/canvas-tokens'
import { useCanvasStore, useInteractive, useStore } from '@/lib/studio/hooks'
import { registry } from '@/lib/studio/registry'
import type { AnyBlock } from '@/lib/studio/types'
import type { CanvasActions } from '@/components/canvas/actions'
import { displayName } from '@/components/canvas/blocks/fallback-block'
import { GlassInput, GlassRow, IconHit, PanelHeader, PanelHint } from '@/components/canvas/chrome/panel'

const INK = tokensFor('dark')

interface Row {
  block: AnyBlock
  depth: number
}

const byZDesc = (a: AnyBlock, b: AnyBlock) => b.z - a.z

export function BlocksListPanel({ actions }: { actions: CanvasActions }) {
  const store = useStore()
  const version = useCanvasStore(() => store.version())
  const selection = useCanvasStore((s) => s.selection)
  const interactive = useInteractive()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<{ id: string; pos: 'before' | 'after' } | null>(null)

  const rows = useMemo<Row[]>(() => {
    void version
    const live = store.liveBlocks().filter((b) => !b.stacked_in && b.type !== 'since')
    const top = live.filter((b) => store.depthOf(b.id) === 0).sort(byZDesc)
    const out: Row[] = []
    const walk = (b: AnyBlock, depth: number) => {
      out.push({ block: b, depth })
      if (b.type === 'frame' && depth < 2) {
        for (const c of [...store.childrenOf(b.id)].sort(byZDesc)) walk(c, depth + 1)
      }
    }
    for (const b of top) walk(b, 0)
    return out
  }, [store, version])

  const state = store.get()
  const topIds = rows.filter((r) => r.depth === 0).map((r) => r.block.id)

  const startEdit = (b: AnyBlock) => {
    if (!interactive) return
    setEditingId(b.id)
    setDraft(b.name ?? '')
  }
  const commitEdit = (id: string, value: string) => {
    setEditingId(null)
    actions.rename(id, value)
  }

  const onDrop = (targetId: string) => {
    if (!dragId || !over || dragId === targetId) return
    const order = topIds.filter((id) => id !== dragId)
    const at = order.indexOf(targetId)
    if (at === -1) return
    order.splice(over.pos === 'after' ? at + 1 : at, 0, dragId)
    actions.reorderZ(order)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 128px)' }}>
      <PanelHeader eyebrow="layers" title="blocks" />
      <div style={{ overflowY: 'auto', padding: '0 6px 8px' }}>
        {rows.length === 0 && <PanelHint style={{ padding: '4px 10px 8px' }}>nothing on the canvas yet</PanelHint>}
        {rows.map(({ block: b, depth }) => {
          const spec = registry[b.type]
          const selected = selection.has(b.id)
          const dim = b.struck_at || b.hidden
          const canDrag = interactive && depth === 0
          const isOver = over?.id === b.id && dragId && dragId !== b.id
          return (
            <GlassRow
              key={b.id}
              dataId={b.id}
              indent={depth * 12}
              active={selected}
              onClick={() => {
                if (!spec.selectable) return
                actions.select([b.id])
                actions.fitIds([b.id])
              }}
              onDoubleClick={() => startEdit(b)}
              draggable={canDrag}
              onDragStart={(e) => {
                setDragId(b.id)
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', b.id)
              }}
              onDragOver={(e) => {
                if (!dragId || depth !== 0) return
                e.preventDefault()
                const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
                setOver({ id: b.id, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' })
              }}
              onDrop={(e) => {
                e.preventDefault()
                onDrop(b.id)
                setDragId(null)
                setOver(null)
              }}
              onDragEnd={() => {
                setDragId(null)
                setOver(null)
              }}
              style={{
                opacity: dim ? 0.5 : 1,
                boxShadow: isOver ? (over?.pos === 'before' ? `inset 0 1px 0 ${INK.tide}` : `inset 0 -1px 0 ${INK.tide}`) : undefined,
              }}
            >
              <span
                aria-hidden
                style={{ display: 'inline-flex', color: glass.muted, cursor: canDrag ? 'grab' : 'default', opacity: canDrag ? 0.7 : 0.25, flexShrink: 0 }}
              >
                <GripVertical size={12} strokeWidth={1.5} />
              </span>
              <i
                aria-hidden
                title={spec.label}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: b.type === 'frame' ? 1 : '50%',
                  backgroundColor: spec.accent ? INK.hue(spec.accent) : glass.muted,
                  flexShrink: 0,
                }}
              />
              {editingId === b.id ? (
                <GlassInput
                  value={draft}
                  onChange={setDraft}
                  onCommit={(v) => commitEdit(b.id, v)}
                  onEscape={() => setEditingId(null)}
                  placeholder={displayName(b, state)}
                  ariaLabel="block name"
                  autoFocus
                  style={{ padding: '3px 8px', fontSize: 12 }}
                />
              ) : (
                <span
                  style={{
                    ...canvasType.small,
                    fontSize: 12,
                    color: glass.text,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    textDecoration: b.struck_at ? 'line-through' : undefined,
                  }}
                >
                  {displayName(b, state)}
                </span>
              )}
              <span className="studio-row-tools" data-on={b.hidden || b.locked ? 'true' : undefined} style={{ display: 'inline-flex', gap: 2, flexShrink: 0 }}>
                <span onClick={(e) => e.stopPropagation()}>
                  <IconHit
                    size={24}
                    ariaLabel={b.hidden ? 'show' : 'hide'}
                    disabled={!interactive || b.type === 'concept' || b.type === 'compass'}
                    active={b.hidden}
                    onClick={() => actions.hide([b.id], !b.hidden)}
                    icon={b.hidden ? <EyeOff size={14} strokeWidth={1.5} /> : <Eye size={14} strokeWidth={1.5} />}
                  />
                </span>
                <span onClick={(e) => e.stopPropagation()}>
                  <IconHit
                    size={24}
                    ariaLabel={b.locked ? 'unlock' : 'lock'}
                    disabled={!interactive}
                    active={b.locked}
                    onClick={() => actions.lock([b.id], !b.locked)}
                    icon={b.locked ? <Lock size={14} strokeWidth={1.5} /> : <LockOpen size={14} strokeWidth={1.5} />}
                  />
                </span>
              </span>
            </GlassRow>
          )
        })}
      </div>
    </div>
  )
}
