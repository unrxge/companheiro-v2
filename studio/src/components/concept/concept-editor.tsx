'use client'

// studio/src/components/concept/concept-editor.tsx — lane H (10.3, D-062).
// Mounted by the concept block (lane C) in editing mode: the project title, the
// body and the constraints (one per line) as plain auto-growing textareas
// (D-027), `save` / `cancel` as text buttons. Save → title patch when it
// changed, then one new revision (origin `edit`) → the store's concept is
// replaced (the block's eyebrow reads the new date) → onDone. Cancel restores
// nothing because nothing was written. Exported signature: `ConceptEditor({ onDone })`.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { TextArea } from '@/components/ui/field'
import { api, ApiError } from '@/lib/studio/api-client'
import { canvasType, line } from '@/lib/studio/canvas-tokens'
import { joinConstraints, splitConstraints } from '@/lib/studio/concept'
import { useConcept, useProject, useStore } from '@/lib/studio/hooks'

export function ConceptEditor({ onDone }: { onDone(): void }) {
  const { t } = useTheme()
  const store = useStore()
  const project = useProject()
  const concept = useConcept()

  const [title, setTitle] = useState(project.title)
  const [body, setBody] = useState(concept.body)
  const [constraints, setConstraints] = useState(joinConstraints(concept.constraints))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const save = useCallback(async () => {
    const nextTitle = title.trim().slice(0, 120)
    const nextBody = body.trim()
    const nextConstraints = splitConstraints(constraints)
    if (!nextBody) {
      setError('the concept needs a few words')
      return
    }
    setBusy(true)
    setError(null)
    try {
      if (nextTitle && nextTitle !== project.title) {
        const { project: saved } = await api.projects.patch(project.id, { title: nextTitle })
        store.set((s) => {
          s.project = saved
        })
      }
      const unchanged = nextBody === concept.body.trim() && joinConstraints(nextConstraints) === joinConstraints(concept.constraints)
      if (!unchanged) {
        const { revision } = await api.concept.save(project.id, nextBody, nextConstraints)
        const conceptBlock = store.liveBlocks().find((b) => b.type === 'concept')
        store.set(
          (s) => {
            s.concept = revision
          },
          conceptBlock ? [conceptBlock.id] : undefined
        )
      }
      onDone()
    } catch (e) {
      if (!mounted.current) return
      setError(e instanceof ApiError ? e.message : 'that did not save')
      setBusy(false)
    }
  }, [title, body, constraints, project.id, project.title, concept.body, concept.constraints, store, onDone])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onDone()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void save()
    }
  }

  const textButton = (color: string): React.CSSProperties => ({
    ...canvasType.small,
    fontWeight: 500,
    color,
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.5 : 1,
  })

  return (
    <div data-no-drag onKeyDown={onKeyDown} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <TextArea
        value={title}
        onChange={setTitle}
        placeholder="a name for it"
        ariaLabel="project title"
        bare
        minRows={1}
        maxHeight={120}
        autoFocus
        disabled={busy}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !(e.metaKey || e.ctrlKey)) e.preventDefault()
        }}
        style={{ ...canvasType.conceptTitle, color: t.textPrimary, padding: 0, lineHeight: 1.15 }}
      />
      <TextArea
        value={body}
        onChange={setBody}
        placeholder="what it is, in your words"
        ariaLabel="concept"
        bare
        minRows={2}
        maxHeight={2000}
        disabled={busy}
        style={{ ...canvasType.conceptBody, color: t.textPrimary, padding: 0 }}
      />
      <div style={{ height: 1, backgroundColor: line.onPaper(t) }} />
      <div style={{ ...canvasType.label, color: t.textMuted }}>constraints · one per line</div>
      <TextArea
        value={constraints}
        onChange={setConstraints}
        placeholder="a limit, a rule, a scope"
        ariaLabel="constraints, one per line"
        bare
        minRows={1}
        maxHeight={800}
        disabled={busy}
        style={{ ...canvasType.small, color: t.textPrimary, padding: 0 }}
      />
      {error && <div style={{ ...canvasType.meta, color: t.danger }}>{error}</div>}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 2 }}>
        <button type="button" onClick={() => void save()} disabled={busy} style={textButton(t.textPrimary)}>
          {busy ? 'saving' : 'save'}
        </button>
        <button type="button" onClick={onDone} disabled={busy} style={textButton(t.textSecondary)}>
          cancel
        </button>
      </div>
    </div>
  )
}
