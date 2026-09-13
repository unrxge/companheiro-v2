'use client'

// studio/src/components/canvas/chrome/selection-settings.tsx — the right dock's
// selection panel (6.4): the railway pattern. One block: name, lock / hide,
// struck + the sentence (required), link, the type's own Settings from the
// registry, the size line (W in 8 px steps; H only for fixed-size types), place /
// dismiss while unplaced, delete last. Several blocks: frame selection, strike
// all, delete.

import { useEffect, useState } from 'react'
import { Frame, Link as LinkIcon, Strikethrough, Trash2 } from 'lucide-react'
import { canvasType, glass } from '@/lib/studio/canvas-tokens'
import { useCanvasStore, useInteractive, useStore } from '@/lib/studio/hooks'
import { registry } from '@/lib/studio/registry'
import type { AnyBlock } from '@/lib/studio/types'
import type { CanvasActions } from '@/components/canvas/actions'
import { getRegistration } from '@/components/canvas/blocks/registry'
import { displayName, shortDate, typeWord } from '@/components/canvas/blocks/fallback-block'
import { GlassButton, GlassInput, GlassTextArea, GlassToggle, PanelHeader, PanelHint, PanelSection } from '@/components/canvas/chrome/panel'

const NEVER_STRUCK = new Set<AnyBlock['type']>(['concept', 'since', 'compass'])

export function SelectionSettings({ actions }: { actions: CanvasActions }) {
  const store = useStore()
  const selection = useCanvasStore((s) => s.selection)
  const primaryId = useCanvasStore((s) => s.primary)
  const ids = [...selection]

  if (ids.length === 0) {
    return (
      <div>
        <PanelHeader eyebrow="selection" title="nothing selected" />
        <PanelSection>
          <PanelHint>click a block, or pick one from layers.</PanelHint>
        </PanelSection>
      </div>
    )
  }
  if (ids.length > 1) return <MultiSettings actions={actions} ids={ids} />
  const id = primaryId && selection.has(primaryId) ? primaryId : ids[0]
  const block = store.get().blocks.get(id)
  if (!block) return null
  return <SingleSettings key={id} actions={actions} id={id} />
}

function SingleSettings({ actions, id }: { actions: CanvasActions; id: string }) {
  const store = useStore()
  const block = useCanvasStore((s) => s.blocks.get(id))
  const interactive = useInteractive()
  const [name, setName] = useState(block?.name ?? '')
  const [strikeOpen, setStrikeOpen] = useState(false)
  const [sentence, setSentence] = useState('')
  const [w, setW] = useState(String(block?.w ?? 0))
  const [h, setH] = useState(String(block?.h ?? 0))
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!block) return
    setName(block.name ?? '')
    setW(String(block.w))
    setH(String(block.h))
  }, [block])

  if (!block || block.deleted_at) return null
  const spec = registry[block.type]
  const Settings = getRegistration(block.type)?.Settings
  const state = store.get()
  const struck = !!block.struck_at
  const canStrike = !NEVER_STRUCK.has(block.type)
  const unplaced = block.arrival_state === 'unplaced'

  const strike = async () => {
    const text = sentence.trim()
    if (!text) return
    setBusy(true)
    try {
      await actions.strike(id, text)
      setStrikeOpen(false)
      setSentence('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 128px)' }}>
      <PanelHeader eyebrow={typeWord(block.type)} title={displayName(block, state)} />
      <div style={{ overflowY: 'auto' }}>
        <PanelSection>
          <GlassInput
            value={name}
            onChange={setName}
            onCommit={(v) => actions.rename(id, v)}
            placeholder="name"
            ariaLabel="block name"
            disabled={!interactive}
          />
        </PanelSection>

        <PanelSection style={{ padding: '4px 8px 8px' }}>
          <GlassToggle label="lock" keycap="⌘⇧L" checked={block.locked} onChange={(v) => actions.lock([id], v)} disabled={!interactive} />
          <GlassToggle
            label="hide"
            keycap="⌘⇧H"
            checked={block.hidden}
            onChange={(v) => actions.hide([id], v)}
            disabled={!interactive || block.type === 'concept' || block.type === 'compass'}
          />
          {canStrike && (
            <GlassToggle
              label="struck"
              checked={struck || strikeOpen}
              onChange={(v) => {
                if (struck) {
                  if (!v) void actions.unstrike(id)
                } else {
                  setStrikeOpen(v)
                }
              }}
              disabled={busy}
            />
          )}
          {canStrike && struck && (
            <div style={{ padding: '2px 12px 6px' }}>
              <PanelHint>
                struck {shortDate(block.struck_at)}
                {block.struck_by ? ` — “${block.struck_by}”` : ''}
              </PanelHint>
              <GlassButton small mono onClick={() => void actions.unstrike(id)} style={{ marginTop: 6 }}>
                unstrike
              </GlassButton>
            </div>
          )}
          {canStrike && !struck && strikeOpen && (
            <div style={{ padding: '2px 12px 6px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <GlassTextArea value={sentence} onChange={setSentence} placeholder="one sentence: why it is struck" rows={2} ariaLabel="why it is struck" autoFocus />
              <div style={{ display: 'flex', gap: 6 }}>
                <GlassButton small icon={<Strikethrough size={14} strokeWidth={1.5} />} onClick={() => void strike()} disabled={!sentence.trim() || busy}>
                  strike
                </GlassButton>
                <GlassButton small tone="muted" onClick={() => { setStrikeOpen(false); setSentence('') }}>
                  not now
                </GlassButton>
              </div>
            </div>
          )}
        </PanelSection>

        <PanelSection>
          <GlassButton icon={<LinkIcon size={14} strokeWidth={1.5} />} onClick={() => actions.enterLink()} disabled={!interactive}>
            link
          </GlassButton>
        </PanelSection>

        {Settings && (
          <PanelSection label={typeWord(block.type)}>
            <Settings block={block} />
          </PanelSection>
        )}

        <PanelSection label="size">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <GlassInput
              value={w}
              onChange={setW}
              onCommit={(v) => {
                const n = Number(v)
                if (Number.isFinite(n)) actions.resize(id, { w: n })
                else setW(String(block.w))
              }}
              type="number"
              mono
              min={spec.minW}
              max={spec.maxW}
              step={8}
              ariaLabel="width"
              disabled={!interactive || spec.handles.length === 0}
              style={{ width: 88 }}
            />
            <span style={{ ...canvasType.meta, color: glass.muted }}>×</span>
            <GlassInput
              value={h}
              onChange={setH}
              onCommit={(v) => {
                const n = Number(v)
                if (Number.isFinite(n)) actions.resize(id, { h: n })
                else setH(String(block.h))
              }}
              type="number"
              mono
              min={spec.minH}
              max={spec.maxH}
              step={8}
              ariaLabel="height"
              disabled={!interactive || spec.autoHeight || spec.handles.length === 0}
              style={{ width: 88 }}
            />
          </div>
          <PanelHint style={{ marginTop: 6 }}>
            {spec.autoHeight ? 'height follows the content' : 'width and height in 8 px steps'}
          </PanelHint>
        </PanelSection>

        {unplaced && (
          <PanelSection label="arrived from talk">
            <div style={{ display: 'flex', gap: 6 }}>
              <GlassButton tone="tide" onClick={() => void actions.place(id)}>place</GlassButton>
              <GlassButton tone="muted" onClick={() => void actions.dismiss(id)}>dismiss</GlassButton>
            </div>
          </PanelSection>
        )}

        {spec.deletable && (
          <PanelSection style={{ paddingBottom: 14 }}>
            <GlassButton tone="danger" icon={<Trash2 size={14} strokeWidth={1.5} />} onClick={() => actions.softDelete([id])} disabled={!interactive}>
              delete
            </GlassButton>
          </PanelSection>
        )}
      </div>
    </div>
  )
}

function MultiSettings({ actions, ids }: { actions: CanvasActions; ids: string[] }) {
  const interactive = useInteractive()
  const [strikeOpen, setStrikeOpen] = useState(false)
  const [sentence, setSentence] = useState('')
  const [busy, setBusy] = useState(false)

  const strikeAll = async () => {
    const text = sentence.trim()
    if (!text) return
    setBusy(true)
    try {
      for (const id of ids) await actions.strike(id, text)
      setStrikeOpen(false)
      setSentence('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <PanelHeader eyebrow="selection" title={`${ids.length} blocks`} />
      <PanelSection>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
          <GlassButton icon={<Frame size={14} strokeWidth={1.5} />} onClick={() => actions.frameSelection(ids)} disabled={!interactive}>
            frame selection
          </GlassButton>
          <GlassButton icon={<Strikethrough size={14} strokeWidth={1.5} />} onClick={() => setStrikeOpen((v) => !v)} disabled={busy}>
            strike all
          </GlassButton>
          {strikeOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
              <GlassTextArea value={sentence} onChange={setSentence} placeholder="one sentence for all of them" rows={2} ariaLabel="why they are struck" autoFocus />
              <div style={{ display: 'flex', gap: 6 }}>
                <GlassButton small onClick={() => void strikeAll()} disabled={!sentence.trim() || busy}>strike</GlassButton>
                <GlassButton small tone="muted" onClick={() => { setStrikeOpen(false); setSentence('') }}>not now</GlassButton>
              </div>
            </div>
          )}
          <GlassButton tone="danger" icon={<Trash2 size={14} strokeWidth={1.5} />} onClick={() => actions.softDelete(ids)} disabled={!interactive}>
            delete
          </GlassButton>
        </div>
      </PanelSection>
    </div>
  )
}
