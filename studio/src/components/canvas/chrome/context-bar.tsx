'use client'

// studio/src/components/canvas/chrome/context-bar.tsx — the 32 px glass pill
// 8 px above the selection's screen bbox, clamped inside the stage (6.4, D-045).
// Single: strike / unstrike, link, duplicate, delete, `open` when the type opens,
// place / dismiss while unplaced. Several: frame, strike all, delete. Icons 16 px
// in 28 px hits; mono tooltips after 400 ms.

import { useLayoutEffect, useRef, useState } from 'react'
import { ArrowUpRight, Copy, Frame, Link as LinkIcon, MapPin, RotateCcw, Strikethrough, Trash2, X } from 'lucide-react'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { TextArea } from '@/components/ui/field'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType, geometry, line, motionSpec, radii, zIndex } from '@/lib/studio/canvas-tokens'
import { shallowEqual, useCanvasStore, useInteractive, useStore, useViewport } from '@/lib/studio/hooks'
import { registry } from '@/lib/studio/registry'
import type { AnyBlock, Rect } from '@/lib/studio/types'
import { rectOf, unionRects, type CanvasActions } from '@/components/canvas/actions'
import { IconHit, Panel } from '@/components/canvas/chrome/panel'

const NEVER_STRUCK = new Set<AnyBlock['type']>(['concept', 'since', 'compass'])
const QUIET_MODES = new Set(['idle', 'pressing'])

export function ContextBar({ actions, stageSize }: { actions: CanvasActions; stageSize: () => { w: number; h: number } }) {
  const { t } = useTheme()
  const store = useStore()
  const v = useViewport()
  const interactive = useInteractive()
  const editing = useCanvasStore((s) => s.editing)
  const mode = useCanvasStore((s) => s.mode)
  const drawerOpen = useCanvasStore((s) => s.drawer.kind !== 'none')
  const ids = useCanvasStore((s) => [...s.selection], shallowEqual)
  // re-render when a selected block's rect changes (drag commit, resize, tidy)
  const rectKey = useCanvasStore((s) =>
    [...s.selection]
      .map((id) => {
        const b = s.blocks.get(id)
        return b ? `${b.x},${b.y},${b.w},${b.h},${b.struck_at ?? ''},${b.arrival_state}` : ''
      })
      .join('|')
  )
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [strikeFor, setStrikeFor] = useState<string[] | null>(null)
  const [sentence, setSentence] = useState('')
  const [busy, setBusy] = useState(false)

  useLayoutEffect(() => {
    if (ref.current) setWidth(ref.current.offsetWidth)
  }, [ids.length, rectKey, interactive])

  if (ids.length === 0 || editing || !QUIET_MODES.has(mode)) return null
  const state = store.get()
  const blocks = ids.map((id) => state.blocks.get(id)).filter((b): b is AnyBlock => !!b && !b.deleted_at)
  if (blocks.length === 0) return null

  const bbox = unionRects(blocks.map(rectOf)) as Rect
  const { w: sw, h: sh } = stageSize()
  const left = bbox.x * v.k + v.tx
  const top = bbox.y * v.k + v.ty
  const bottom = (bbox.y + bbox.h) * v.k + v.ty
  const cx = left + (bbox.w * v.k) / 2
  const half = width / 2 || 80
  const usableRight = drawerOpen ? sw - geometry.drawerW : sw
  const x = Math.min(Math.max(cx, 8 + half), Math.max(8 + half, usableRight - 8 - half))
  let y = top - 8 - geometry.contextBarH
  if (y < 8) y = Math.min(bottom + 8, sh - geometry.contextBarH - 8)
  y = Math.max(8, Math.min(y, sh - geometry.contextBarH - 8))

  const single = blocks.length === 1 ? blocks[0] : null
  const spec = single ? registry[single.type] : null
  const struck = !!single?.struck_at
  const unplaced = !!single && single.arrival_state === 'unplaced'
  const canStrike = single ? !NEVER_STRUCK.has(single.type) : blocks.some((b) => !NEVER_STRUCK.has(b.type))
  const opens = spec && spec.opens !== 'none' && spec.opens !== 'lightbox' ? spec.opens : null

  const open = () => {
    if (!single) return
    if (single.type === 'draft') {
      const draftId = single.content.draft_id
      store.set((s) => {
        s.drawer = { kind: 'draft', draftId }
      })
    } else if (single.type === 'compass') {
      store.set((s) => {
        s.drawer = { kind: 'compass' }
      })
    } else if (single.type === 'timeline') {
      store.set((s) => {
        s.dock = { ...s.dock, right: 'selection' }
      })
    }
  }

  const doStrike = async () => {
    if (!strikeFor) return
    const text = sentence.trim()
    if (!text) return
    setBusy(true)
    try {
      for (const id of strikeFor) await actions.strike(id, text)
      setStrikeFor(null)
      setSentence('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div
        ref={ref}
        data-context-bar
        style={{
          position: 'absolute',
          left: 0,
          top: geometry.topBarH,
          transform: `translate(${Math.round(x - half)}px, ${Math.round(y)}px)`,
          zIndex: zIndex.contextBar,
          animation: `studio-context-in ${motionSpec.hoverMs}ms ease`,
        }}
      >
        <style>{`@keyframes studio-context-in { from { opacity: 0; transform: translate(${Math.round(x - half)}px, ${Math.round(y + 6)}px) } to { opacity: 1 } }`}</style>
        <Panel style={{ height: geometry.contextBarH, display: 'flex', alignItems: 'center', gap: 2, padding: '0 4px', borderRadius: radii.contextBar }}>
          {single ? (
            <>
              {canStrike &&
                (struck ? (
                  <IconHit ariaLabel="unstrike" tip="unstrike" onClick={() => void actions.unstrike(single.id)} icon={<RotateCcw size={16} strokeWidth={1.5} />} />
                ) : (
                  <IconHit ariaLabel="strike" tip="strike" onClick={() => setStrikeFor([single.id])} icon={<Strikethrough size={16} strokeWidth={1.5} />} />
                ))}
              {interactive && <IconHit ariaLabel="link" tip="link" onClick={() => actions.enterLink()} icon={<LinkIcon size={16} strokeWidth={1.5} />} />}
              {interactive && spec?.duplicable && (
                <IconHit ariaLabel="duplicate" tip="duplicate" onClick={() => actions.duplicate([single.id])} icon={<Copy size={16} strokeWidth={1.5} />} />
              )}
              {opens && <IconHit ariaLabel="open" tip="open" onClick={open} icon={<ArrowUpRight size={16} strokeWidth={1.5} />} />}
              {unplaced && (
                <>
                  <Sep />
                  <IconHit ariaLabel="place" tip="place" tone="tide" onClick={() => void actions.place(single.id)} icon={<MapPin size={16} strokeWidth={1.5} />} />
                  <IconHit ariaLabel="dismiss" tip="dismiss" onClick={() => void actions.dismiss(single.id)} icon={<X size={16} strokeWidth={1.5} />} />
                </>
              )}
              {interactive && spec?.deletable && (
                <>
                  <Sep />
                  <IconHit ariaLabel="delete" tip="delete" onClick={() => actions.softDelete([single.id])} icon={<Trash2 size={16} strokeWidth={1.5} />} />
                </>
              )}
            </>
          ) : (
            <>
              {interactive && <IconHit ariaLabel="frame" tip="frame" onClick={() => actions.frameSelection(ids)} icon={<Frame size={16} strokeWidth={1.5} />} />}
              {canStrike && (
                <IconHit
                  ariaLabel="strike all"
                  tip="strike all"
                  onClick={() => setStrikeFor(blocks.filter((b) => !NEVER_STRUCK.has(b.type) && !b.struck_at).map((b) => b.id))}
                  icon={<Strikethrough size={16} strokeWidth={1.5} />}
                />
              )}
              {interactive && (
                <>
                  <Sep />
                  <IconHit ariaLabel="delete" tip="delete" onClick={() => actions.softDelete(ids)} icon={<Trash2 size={16} strokeWidth={1.5} />} />
                </>
              )}
            </>
          )}
        </Panel>
      </div>

      {strikeFor && (
        <ModalDialog
          title={strikeFor.length > 1 ? 'strike them' : 'strike it'}
          onClose={() => {
            if (busy) return
            setStrikeFor(null)
            setSentence('')
          }}
          maxWidth="480px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <GhostButton onClick={() => { setStrikeFor(null); setSentence('') }} disabled={busy}>not now</GhostButton>
              <PrimaryButton onClick={() => void doStrike()} disabled={busy || !sentence.trim()} loading={busy}>strike</PrimaryButton>
            </div>
          }
        >
          <p style={{ ...canvasType.small, color: t.textSecondary, margin: '0 0 12px' }}>
            it stays on the canvas, dimmed and crossed, with your sentence under it.
          </p>
          <TextArea value={sentence} onChange={setSentence} placeholder="one sentence: why it is struck" minRows={2} voice autoFocus ariaLabel="why it is struck" />
        </ModalDialog>
      )}
    </>
  )
}

function Sep() {
  return <span aria-hidden style={{ width: 1, height: 14, backgroundColor: line.chromeSoft, margin: '0 2px' }} />
}
