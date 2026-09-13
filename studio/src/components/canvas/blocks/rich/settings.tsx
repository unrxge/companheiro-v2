'use client'

// studio/src/components/canvas/blocks/rich/settings.tsx — the right dock's
// per-type settings for the rich blocks (6.4; lane D), rendered inside the
// ink-glass panel with the Glass* primitives: draft → posture + open; compass →
// open; frame → tint + collapse.

import { canvasType, glass } from '@/lib/studio/canvas-tokens'
import { useDraftSummary, useInteractive, useStore } from '@/lib/studio/hooks'
import type { Hue, Posture } from '@/lib/studio/types'
import { useActions } from '@/components/canvas/actions'
import type { BlockSettingsProps } from '@/components/canvas/blocks/registry'
import { GlassButton, GlassToggle, PanelSection, SegmentControl } from '@/components/canvas/chrome/panel'
import { POSTURE_OPTIONS } from '@/components/draft/posture-control'
import { refreshDraftSummary } from '@/lib/studio/drafts'
import { api } from '@/lib/studio/api-client'

type Tint = 'none' | Hue
const TINTS: Array<{ value: Tint; label: string }> = [
  { value: 'none', label: 'none' },
  { value: 'ember', label: 'ember' },
  { value: 'verdant', label: 'verdant' },
  { value: 'violet', label: 'violet' },
  { value: 'ochre', label: 'ochre' },
  { value: 'tide', label: 'tide' },
]

export function DraftSettings({ block }: BlockSettingsProps<'draft'>) {
  const store = useStore()
  const interactive = useInteractive()
  const draft = useDraftSummary(block.content.draft_id)

  const setPosture = async (posture: Posture) => {
    if (!draft || draft.posture === posture) return
    const before = draft
    refreshDraftSummary(store, { ...draft, posture })
    try {
      const { draft: saved } = await api.drafts.patch(draft.id, { posture })
      refreshDraftSummary(store, { ...draft, posture: saved.posture, title: saved.title, kind: saved.kind, updated_at: saved.updated_at })
    } catch (e) {
      console.error('studio: posture change failed', e)
      refreshDraftSummary(store, before)
    }
  }

  const open = () => {
    store.set((s) => {
      s.drawer = { kind: 'draft', draftId: block.content.draft_id }
    })
  }

  return (
    <>
      <PanelSection label="posture">
        <SegmentControl<Posture> options={POSTURE_OPTIONS} value={draft?.posture ?? 'ask'} onChange={(p) => void setPosture(p)} />
        {!interactive && <div style={{ ...canvasType.meta, color: glass.muted, marginTop: 6 }}>the project is read-only; the posture stays as it is</div>}
      </PanelSection>
      <PanelSection>
        <GlassButton onClick={open} block>
          open
        </GlassButton>
      </PanelSection>
    </>
  )
}

export function CompassSettings(_props: BlockSettingsProps<'compass'>) {
  const store = useStore()
  const open = () => {
    store.set((s) => {
      s.drawer = { kind: 'compass' }
    })
  }
  return (
    <PanelSection>
      <GlassButton onClick={open} block>
        open
      </GlassButton>
    </PanelSection>
  )
}

export function FrameSettings({ block }: BlockSettingsProps<'frame'>) {
  const store = useStore()
  const actions = useActions()
  const interactive = useInteractive()

  const setTint = (tint: Tint) => {
    if (!interactive || block.content.tint === tint) return
    const row = { ...block, content: { ...block.content, tint } }
    store.set((s) => {
      s.blocks.set(block.id, row)
    }, [block.id])
    store.markDirty([block.id])
  }

  return (
    <>
      <PanelSection label="tint">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          <SegmentControl<Tint> options={TINTS} value={block.content.tint} onChange={setTint} />
        </div>
      </PanelSection>
      <PanelSection style={{ padding: '4px 8px 8px' }}>
        <GlassToggle label="collapsed" checked={block.collapsed} onChange={(v) => actions?.collapse(block.id, v)} disabled={!interactive || !actions} />
      </PanelSection>
    </>
  )
}
