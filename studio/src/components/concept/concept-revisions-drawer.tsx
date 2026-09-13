'use client'

// studio/src/components/concept/concept-revisions-drawer.tsx — lane H (10.3).
// Every revision of the concept, newest first: a lowercase date, the origin
// word, a one-line diff summary against the previous revision (client-side,
// from lib/studio/concept.ts), expandable to the full text, and `restore as a
// new edit` on any revision whose words differ from the current concept —
// restoring inserts a new revision and never touches history. DrawerHost
// draws the header. Exported signature: `ConceptRevisionsDrawer()`.

import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { api, ApiError } from '@/lib/studio/api-client'
import { canvasType, line, radii } from '@/lib/studio/canvas-tokens'
import { diffSummary, sameRevision, sortRevisions } from '@/lib/studio/concept'
import { useConcept, useInteractive, useProject, useStore } from '@/lib/studio/hooks'
import type { ConceptRevision } from '@/lib/studio/types'
import { shortDate, shortTime } from '@/components/canvas/blocks/fallback-block'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; revisions: ConceptRevision[] }

export function ConceptRevisionsDrawer() {
  const { t } = useTheme()
  const store = useStore()
  const project = useProject()
  const concept = useConcept()
  const interactive = useInteractive()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [restoring, setRestoring] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const { revisions } = await api.concept.revisions(project.id)
      setState({ status: 'ready', revisions: sortRevisions(revisions) })
    } catch (e) {
      setState({ status: 'error', message: e instanceof ApiError && e.status === 401 ? 'sign in again' : 'the edits did not open' })
    }
  }, [project.id])

  useEffect(() => {
    void load()
  }, [load])

  // a save made elsewhere (the concept block) while the drawer is open lands at the top
  useEffect(() => {
    setState((s) => {
      if (s.status !== 'ready' || !concept.id || s.revisions.some((r) => r.id === concept.id)) return s
      return { status: 'ready', revisions: sortRevisions([concept, ...s.revisions]) }
    })
  }, [concept])

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const restore = async (r: ConceptRevision) => {
    setRestoring(r.id)
    setRestoreError(null)
    try {
      const { revision } = await api.concept.save(project.id, r.body, r.constraints)
      const conceptBlock = store.liveBlocks().find((b) => b.type === 'concept')
      store.set(
        (s) => {
          s.concept = revision
        },
        conceptBlock ? [conceptBlock.id] : undefined
      )
      setState((s) => (s.status === 'ready' ? { status: 'ready', revisions: sortRevisions([revision, ...s.revisions]) } : s))
    } catch (e) {
      setRestoreError(e instanceof ApiError ? e.message : 'that did not save')
    } finally {
      setRestoring(null)
    }
  }

  if (state.status === 'loading') {
    return (
      <div style={{ padding: 20 }}>
        <div style={{ ...canvasType.meta, color: t.textMuted }}>opening the edits…</div>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ ...canvasType.small, color: t.textSecondary }}>{state.message}</div>
        <button type="button" onClick={() => void load()} style={textButtonStyle(t.textPrimary)}>
          try again
        </button>
      </div>
    )
  }

  const { revisions } = state
  return (
    <div style={{ padding: '16px 20px 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {revisions.length === 0 && <div style={{ ...canvasType.small, color: t.textSecondary }}>nothing edited yet</div>}
      {revisions.map((r, i) => {
        const previous = revisions[i + 1] ?? null
        const expanded = open.has(r.id)
        const current = sameRevision(r, concept)
        const canRestore = interactive && !current && restoring === null
        return (
          <article
            key={r.id}
            style={{
              backgroundColor: t.cardBg,
              borderRadius: radii.block,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => toggle(r.id)}
              aria-expanded={expanded}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                textAlign: 'left',
                color: t.textMuted,
                width: '100%',
              }}
            >
              <span style={{ display: 'inline-flex', flexShrink: 0 }}>
                {expanded ? <ChevronDown size={16} strokeWidth={1.5} /> : <ChevronRight size={16} strokeWidth={1.5} />}
              </span>
              <span style={{ ...canvasType.eyebrow, color: t.textMuted, flex: 1, minWidth: 0 }}>
                {r.origin === 'creation' ? 'made' : 'edited'} · {shortDate(r.created_at)} · {shortTime(r.created_at)}
                {current ? ' · current' : ''}
              </span>
            </button>
            <div style={{ ...canvasType.meta, color: t.textSecondary }}>{diffSummary(previous, r)}</div>
            {!expanded && (
              <div
                style={{
                  ...canvasType.small,
                  color: t.textSecondary,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                }}
              >
                {r.body}
              </div>
            )}
            {expanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ ...canvasType.conceptBody, fontSize: 15, color: t.textPrimary, margin: 0, whiteSpace: 'pre-wrap' }}>{r.body}</p>
                {r.constraints.length > 0 && (
                  <>
                    <div style={{ height: 1, backgroundColor: line.onPaper(t) }} />
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {r.constraints.map((c, j) => (
                        <li key={j} style={{ ...canvasType.small, color: t.textPrimary, display: 'flex', gap: 10, alignItems: 'baseline' }}>
                          <span aria-hidden style={{ width: 3, height: 3, backgroundColor: t.ochre, flexShrink: 0, position: 'relative', top: -3 }} />
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            {!current && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 2 }}>
                <button
                  type="button"
                  onClick={() => void restore(r)}
                  disabled={!canRestore}
                  title={interactive ? undefined : 'the project is read-only right now'}
                  style={{ ...textButtonStyle(t.textPrimary), opacity: canRestore ? 1 : 0.5, cursor: canRestore ? 'pointer' : 'default' }}
                >
                  {restoring === r.id ? 'restoring' : 'restore as a new edit'}
                </button>
                {restoreError && restoring === null && <span style={{ ...canvasType.meta, color: t.danger }}>{restoreError}</span>}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )
}

function textButtonStyle(color: string): React.CSSProperties {
  return { ...canvasType.small, fontWeight: 500, color, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }
}
