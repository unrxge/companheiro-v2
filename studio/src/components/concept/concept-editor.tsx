'use client'

// studio/src/components/concept/concept-editor.tsx — STUB (lane A, 11.1). Lane H
// replaces the body with in-place editing of title, body and constraints, saving
// a new revision (10.3, D-062). The exported signature stays:
// `ConceptEditor({ onDone(): void })`. Mounted by the concept block (C) in
// editing mode.

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { useConcept } from '@/lib/studio/hooks'

export function ConceptEditor({ onDone }: { onDone(): void }) {
  const { t } = useTheme()
  const concept = useConcept()
  return (
    <div data-no-drag style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ ...canvasType.conceptBody, color: t.textPrimary, margin: 0, whiteSpace: 'pre-wrap' }}>{concept.body}</p>
      <button
        type="button"
        onClick={onDone}
        style={{ ...canvasType.small, fontWeight: 500, color: t.textSecondary, background: 'none', border: 'none', padding: 0, cursor: 'pointer', alignSelf: 'flex-start' }}
      >
        done
      </button>
    </div>
  )
}
