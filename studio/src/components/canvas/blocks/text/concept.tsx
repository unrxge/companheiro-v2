'use client'

// studio/src/components/canvas/blocks/text/concept.tsx — the concept block (6.2,
// D-062). Read view: the project title (conceptTitle), the latest revision's
// body as paragraphs 10 px apart (conceptBody), then the constraints under a
// hairline, each with a 3 px ochre square bullet, rows 6 px apart. Editing mode
// mounts lane H's ConceptEditor (title, body, constraints; save = new revision)
// and leaves editing when it calls onDone. The eyebrow (CONCEPT · EDITED 3 SEP)
// is the shell's. The block stores nothing; the store's `concept` is the truth.

import { useTheme } from '@/components/theme/theme-provider'
import { canvasType, line } from '@/lib/studio/canvas-tokens'
import { useConcept, useProject, useStore } from '@/lib/studio/hooks'
import { ConceptEditor } from '@/components/concept/concept-editor'
import type { BlockRendererProps } from '@/components/canvas/blocks/registry'
import { endEditing } from '@/components/canvas/blocks/text/note'

export const CONCEPT_EMPTY = 'nothing written yet — edit the concept to say what this is'

/** Blank-line separated paragraphs; single newlines stay inside a paragraph. */
export function splitParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}

/** The read view, shared by the block and the phone sheet. */
export function ConceptRead({ title, body, constraints, titleStyle }: { title: string; body: string; constraints: string[]; titleStyle?: 'block' | 'sheet' }) {
  const { t } = useTheme()
  const paragraphs = splitParagraphs(body)
  const rows = constraints.map((c) => c.trim()).filter(Boolean)
  return (
    <div>
      <h2 style={{ ...(titleStyle === 'sheet' ? canvasType.title : canvasType.conceptTitle), color: t.textPrimary, margin: 0, wordBreak: 'break-word' }}>
        {title || 'untitled'}
      </h2>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {paragraphs.length === 0 ? (
          <p style={{ ...canvasType.conceptBody, color: t.textMuted, margin: 0 }}>{CONCEPT_EMPTY}</p>
        ) : (
          paragraphs.map((p, i) => (
            <p key={i} style={{ ...canvasType.conceptBody, color: t.textPrimary, margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {p}
            </p>
          ))
        )}
      </div>
      {rows.length > 0 && (
        <ul
          style={{
            listStyle: 'none',
            margin: '14px 0 0',
            padding: '12px 0 0',
            borderTop: `1px solid ${line.onPaper(t)}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {rows.map((c, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, ...canvasType.small, color: t.textPrimary }}>
              <i aria-hidden style={{ width: 3, height: 3, flexShrink: 0, backgroundColor: t.ochre, marginTop: 8 }} />
              <span style={{ minWidth: 0, wordBreak: 'break-word' }}>{c}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function ConceptBlock({ block, editing }: BlockRendererProps<'concept'>) {
  const store = useStore()
  const project = useProject()
  const concept = useConcept()

  if (editing) {
    return <ConceptEditor onDone={() => endEditing(store, block.id)} />
  }
  return <ConceptRead title={project.title} body={concept.body} constraints={concept.constraints} />
}
