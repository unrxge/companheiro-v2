'use client'

// studio/src/components/concept/concept-revisions-drawer.tsx — STUB (lane A,
// 11.1). Lane H replaces the body with the revisions list (newest first, date,
// diff summary, expandable, `restore as a new edit`). The exported signature
// stays: `ConceptRevisionsDrawer()`. DrawerHost renders the header.

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { useConcept } from '@/lib/studio/hooks'
import { shortDate } from '@/components/canvas/blocks/fallback-block'

export function ConceptRevisionsDrawer() {
  const { t } = useTheme()
  const concept = useConcept()
  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ ...canvasType.meta, color: t.textMuted }}>
        latest · {shortDate(concept.created_at)} · {concept.origin}
      </div>
      <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>the list of edits opens here once it is wired.</p>
    </div>
  )
}
