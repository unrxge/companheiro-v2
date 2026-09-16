'use client'

// studio/src/components/canvas/chrome/grid-panel.tsx — grid & guides & keys (6.4):
// `snap` S, `size labels` X, `grid` G toggles persisted in project.settings;
// `tidy` T and `tidy everything` ⇧T (confirm dialog); the last undo label; and the
// full key map (D-041) as mono rows.

import { useState } from 'react'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { api } from '@/lib/studio/api-client'
import { canvasType, glass, line } from '@/lib/studio/canvas-tokens'
import { useInteractive, useProject, useStore } from '@/lib/studio/hooks'
import type { ProjectSettings } from '@/lib/studio/types'
import type { CanvasActions } from '@/components/canvas/actions'
import { GlassButton, GlassToggle, KeyCap, PanelHeader, PanelHint, PanelSection } from '@/components/canvas/chrome/panel'

/** Every key from D-041, in the order the panel lists them. */
export const KEY_MAP: ReadonlyArray<readonly [string, string]> = [
  ['↑ ↓ ← →', 'nudge 8 px'],
  ['⇧ arrows', 'nudge 40 px'],
  ['⌫', 'delete'],
  ['⌘ D', 'duplicate'],
  ['⌘ Z', 'undo'],
  ['⌘ ⇧ Z · ⌘ Y', 'redo'],
  ['⌘ A', 'select all'],
  ['esc', 'leave mode · commit · deselect · close'],
  ['1', 'fit all'],
  ['⇧ 1', 'fit selection'],
  ['0', '100 %'],
  ['+ −', 'zoom'],
  ['space + drag', 'pan'],
  ['S', 'snap'],
  ['X', 'size labels'],
  ['G', 'grid'],
  ['T', 'tidy'],
  ['⇧ T', 'tidy everything'],
  ['L', 'link'],
  ['F', 'frame the selection'],
  ['↵', 'edit · open'],
  ['⌘ ] · ⌘ [', 'forward · back'],
  ['⌘ ⇧ ] · ⌘ ⇧ [', 'to front · to back'],
  ['⌘ ⇧ H', 'hide'],
  ['⌘ ⇧ L', 'lock'],
  ['⌘ K', 'talk'],
  ['/', 'library'],
  ['?', 'this list'],
]

export function GridPanel({ actions }: { actions: CanvasActions }) {
  const store = useStore()
  const project = useProject()
  const interactive = useInteractive()
  const confirm = useConfirm()
  const [busy, setBusy] = useState(false)
  const undoLabel = actions.undoLabel()

  const setSetting = async (key: keyof ProjectSettings, value: boolean) => {
    const before = project.settings
    store.set((s) => {
      s.project = { ...s.project, settings: { ...s.project.settings, [key]: value } }
    })
    try {
      const { project: saved } = await api.projects.patch(project.id, { settings: { [key]: value } })
      store.set((s) => {
        s.project = { ...s.project, settings: saved.settings }
      })
    } catch (e) {
      console.error('studio: settings save failed', e)
      store.set((s) => {
        s.project = { ...s.project, settings: before }
      })
    }
  }

  const tidyEverything = async () => {
    const ok = await confirm({
      title: 'Tidy everything?',
      body: 'Blocks you placed by hand will move too, and count as tidied afterwards. You can undo it.',
      confirmLabel: 'Tidy everything',
      cancelLabel: 'Leave it',
    })
    if (!ok) return
    setBusy(true)
    try {
      actions.tidy(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 128px)' }}>
      <PanelHeader eyebrow="grid" title="grid & guides & keys" />
      <div style={{ overflowY: 'auto' }}>
        <PanelSection style={{ padding: '4px 8px 8px' }}>
          <GlassToggle label="snap" keycap="S" checked={project.settings.snap} onChange={(v) => void setSetting('snap', v)} />
          <GlassToggle label="size labels" keycap="X" checked={project.settings.sizes} onChange={(v) => void setSetting('sizes', v)} />
          <GlassToggle label="grid" keycap="G" checked={project.settings.grid} onChange={(v) => void setSetting('grid', v)} />
        </PanelSection>
        <PanelSection label="tidy">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <GlassButton onClick={() => actions.tidy(false)} disabled={!interactive || busy} icon={<KeyCap>T</KeyCap>}>
              tidy
            </GlassButton>
            <GlassButton onClick={() => void tidyEverything()} disabled={!interactive || busy} icon={<KeyCap>⇧T</KeyCap>}>
              tidy everything
            </GlassButton>
          </div>
          <PanelHint style={{ marginTop: 8 }}>tidy never moves a block you placed by hand.</PanelHint>
        </PanelSection>
        <PanelSection label="undo">
          <PanelHint>{undoLabel ? `undo: ${undoLabel}` : 'nothing to undo'}</PanelHint>
        </PanelSection>
        <PanelSection label="keys" style={{ paddingBottom: 12 }}>
          <PanelHint style={{ marginBottom: 6 }}>⌘ is ctrl on windows and linux</PanelHint>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(96px, auto) 1fr', rowGap: 0, columnGap: 12 }}>
            {KEY_MAP.map(([keys, what]) => (
              <div key={keys} style={{ display: 'contents' }}>
                <div style={{ ...canvasType.meta, color: glass.text, padding: '5px 0', borderTop: `1px solid ${line.chromeSoft}`, whiteSpace: 'nowrap' }}>{keys}</div>
                <div style={{ ...canvasType.meta, color: glass.muted, padding: '5px 0', borderTop: `1px solid ${line.chromeSoft}` }}>{what}</div>
              </div>
            ))}
          </div>
        </PanelSection>
      </div>
    </div>
  )
}
