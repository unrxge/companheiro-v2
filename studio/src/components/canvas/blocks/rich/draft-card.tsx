'use client'

// studio/src/components/canvas/blocks/rich/draft-card.tsx — the draft block's
// card (6.2, 9.5; lane D). Violet dot before the eyebrow `DRAFT · ESSAY · ASK`,
// title, the sections list on cardBgInner (label or `section n`, a 12 px lock
// when locked, an empty circle when the section has no text), bottom row
// `edited 2 h ago` · `open →`. The card mirrors nothing: it reads the summary
// the bundle carries in store.drafts. No word counts, ever.

import { Lock } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { alpha } from '@/lib/design-tokens'
import { canvasType, geometry } from '@/lib/studio/canvas-tokens'
import { useDraftSummary, useStore } from '@/lib/studio/hooks'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'
import { relativeWords } from '@/components/canvas/blocks/fallback-block'

export function DraftCard({ block, phone }: BlockRendererProps<'draft'>) {
  const { t } = useTheme()
  const store = useStore()
  const draft = useDraftSummary(block.content.draft_id)
  const violet = t.hue('violet')
  const eyebrow = draft ? `draft · ${draft.kind} · ${draft.posture}` : 'draft'

  const open = () => {
    store.set((s) => {
      s.drawer = { kind: 'draft', draftId: block.content.draft_id }
    })
  }

  return (
    <div>
      <div
        data-eyebrow
        style={{
          ...canvasType.eyebrow,
          color: t.textMuted,
          height: geometry.eyebrowH,
          marginBottom: geometry.eyebrowGap,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        }}
      >
        <i aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: violet, flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{eyebrow}</span>
        {block.locked && (
          <span aria-label="locked" style={{ marginLeft: 'auto', display: 'inline-flex', color: t.textMuted }}>
            <Lock size={12} strokeWidth={1.5} />
          </span>
        )}
      </div>

      <div style={{ ...canvasType.title, color: t.textPrimary, wordBreak: 'break-word', marginBottom: 12 }}>
        {draft?.title || 'untitled draft'}
      </div>

      <div style={{ backgroundColor: t.cardBgInner, borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {draft && draft.sections.length > 0 ? (
          draft.sections.map((s, i) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              {!s.has_text && (
                <i
                  aria-hidden
                  style={{ width: 8, height: 8, borderRadius: '50%', border: `1px solid ${alpha(t.textPrimary, 0.3)}`, flexShrink: 0, boxSizing: 'border-box' }}
                />
              )}
              <span style={{ ...canvasType.small, color: t.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                {s.label?.trim() || `section ${i + 1}`}
              </span>
              {s.is_locked && (
                <span aria-label="locked section" style={{ display: 'inline-flex', color: t.textMuted, flexShrink: 0 }}>
                  <Lock size={12} strokeWidth={1.5} />
                </span>
              )}
            </div>
          ))
        ) : (
          <span style={{ ...canvasType.small, color: t.textMuted }}>nothing written yet</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
        <span style={{ ...canvasType.meta, color: t.textMuted }}>{draft ? `edited ${relativeWords(draft.updated_at)}` : ''}</span>
        {!phone && (
          <button
            type="button"
            data-no-drag
            onClick={(e) => {
              e.stopPropagation()
              open()
            }}
            style={{ ...canvasType.small, fontWeight: 500, color: t.textPrimary, background: 'none', border: 'none', padding: 0, cursor: 'pointer', lineHeight: 1.2 }}
          >
            open →
          </button>
        )}
      </div>
    </div>
  )
}
