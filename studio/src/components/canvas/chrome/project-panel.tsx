'use client'

// studio/src/components/canvas/chrome/project-panel.tsx — the project panel (6.4,
// 10.4, D-060): status changes (`rest` with the 14-day sentence, `finish`, `keep`,
// `abandon`, each asking one sentence via ModalDialog; `wake` once the rest is
// over; `active again` after completion), `edit the concept`, `n concept edits →`
// (the revisions drawer), `delete project` (useConfirm, danger).

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { TextArea } from '@/components/ui/field'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { useTheme } from '@/components/theme/theme-provider'
import { api, ApiError } from '@/lib/studio/api-client'
import { canvasType, glass } from '@/lib/studio/canvas-tokens'
import { useInteractive, useProject, useStore } from '@/lib/studio/hooks'
import type { ProjectStatus } from '@/lib/studio/types'
import type { CanvasActions } from '@/components/canvas/actions'
import { shortDate } from '@/components/canvas/blocks/fallback-block'
import { GlassButton, PanelHeader, PanelHint, PanelSection } from '@/components/canvas/chrome/panel'
import { COMPLETED, canWake, statusLabel } from '@/components/canvas/chrome/status-strip'

type Ask = Exclude<ProjectStatus, 'active'>

const DIALOG: Record<Ask, { title: string; body: string; confirm: string; asksSentence: boolean }> = {
  resting: {
    title: 'rest this project',
    body: 'it rests for 14 days. you can read it and talk; arranging waits. it cannot wake early.',
    confirm: 'rest',
    asksSentence: false,
  },
  finished: { title: 'finished — what did it become?', body: 'one sentence, kept with the project.', confirm: 'finish', asksSentence: true },
  kept: { title: 'kept — what are you keeping it for?', body: 'one sentence, kept with the project.', confirm: 'keep', asksSentence: true },
  abandoned: { title: 'abandoned — what did you learn?', body: 'one sentence, kept with the project.', confirm: 'abandon', asksSentence: true },
}

export function ProjectPanel({ actions }: { actions: CanvasActions }) {
  const { t } = useTheme()
  const router = useRouter()
  const store = useStore()
  const project = useProject()
  const interactive = useInteractive()
  const confirm = useConfirm()
  const [ask, setAsk] = useState<Ask | null>(null)
  const [sentence, setSentence] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editCount, setEditCount] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    api.concept
      .revisions(project.id)
      .then(({ revisions }) => {
        if (!cancelled) setEditCount(revisions.filter((r) => r.origin === 'edit').length)
      })
      .catch(() => {
        /* lane H's route; the label simply carries no number */
      })
    return () => {
      cancelled = true
    }
  }, [project.id])

  const applyStatus = async (status: ProjectStatus, note?: string) => {
    setBusy(true)
    setError(null)
    try {
      const { project: saved } = await api.projects.patch(project.id, note === undefined ? { status } : { status, completion_note: note })
      store.set((s) => {
        s.project = saved
        s.interactive = saved.status === 'active'
        if (!s.interactive) {
          s.selection = new Set()
          s.primary = null
          s.editing = null
          s.mode = 'idle'
        }
      })
      setAsk(null)
      setSentence('')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'that did not save')
    } finally {
      setBusy(false)
    }
  }

  const editConcept = () => {
    const concept = store.liveBlocks().find((b) => b.type === 'concept')
    if (!concept) return
    actions.select([concept.id])
    actions.fitIds([concept.id])
    store.set((s) => {
      s.editing = concept.id
      s.mode = 'editing'
    })
  }

  const openRevisions = () =>
    store.set((s) => {
      s.drawer = { kind: 'revisions' }
    })

  const deleteProject = async () => {
    const ok = await confirm({
      title: 'delete this project?',
      body: 'everything on its canvas, its talk and its compass go with it. this cannot be undone.',
      confirmLabel: 'delete the project',
      cancelLabel: 'keep it',
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await api.projects.delete(project.id)
      router.push('/shelf')
    } catch (e) {
      setBusy(false)
      setError(e instanceof ApiError ? e.message : 'that did not work')
    }
  }

  const completed = COMPLETED.has(project.status)
  const dialog = ask ? DIALOG[ask] : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 128px)' }}>
      <PanelHeader eyebrow="project" title={project.title || 'untitled project'} />
      <div style={{ overflowY: 'auto' }}>
        <PanelSection label="status">
          <div style={{ ...canvasType.small, color: glass.text, marginBottom: 8 }}>{statusLabel(project)}</div>
          {project.status === 'active' && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <GlassButton onClick={() => setAsk('resting')} disabled={busy}>rest</GlassButton>
              <GlassButton onClick={() => setAsk('finished')} disabled={busy}>finish</GlassButton>
              <GlassButton onClick={() => setAsk('kept')} disabled={busy}>keep</GlassButton>
              <GlassButton onClick={() => setAsk('abandoned')} disabled={busy}>abandon</GlassButton>
            </div>
          )}
          {project.status === 'resting' &&
            (canWake(project) ? (
              <GlassButton onClick={() => void applyStatus('active')} disabled={busy}>wake</GlassButton>
            ) : (
              <PanelHint>it wakes on {shortDate(project.resting_until)} · until then you can read and talk</PanelHint>
            ))}
          {completed && (
            <>
              {project.completion_note && (
                <div style={{ ...canvasType.meta, color: glass.text, marginBottom: 8 }}>“{project.completion_note}”</div>
              )}
              <GlassButton onClick={() => void applyStatus('active')} disabled={busy}>active again</GlassButton>
            </>
          )}
          {error && !ask && <PanelHint style={{ marginTop: 8, color: glass.text }}>{error}</PanelHint>}
        </PanelSection>

        <PanelSection label="concept">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <GlassButton onClick={editConcept} disabled={!interactive}>edit the concept</GlassButton>
            <GlassButton onClick={openRevisions}>{editCount === null ? 'concept edits →' : `${editCount} concept ${editCount === 1 ? 'edit' : 'edits'} →`}</GlassButton>
          </div>
        </PanelSection>

        <PanelSection label="project" style={{ paddingBottom: 14 }}>
          <GlassButton tone="danger" onClick={() => void deleteProject()} disabled={busy}>
            delete project
          </GlassButton>
        </PanelSection>
      </div>

      {/* Portalled to the body: the glass panel's backdrop-filter would otherwise contain the fixed dialog. */}
      {ask && dialog && typeof document !== 'undefined' && createPortal(
        <ModalDialog
          title={dialog.title}
          onClose={() => {
            if (busy) return
            setAsk(null)
            setSentence('')
            setError(null)
          }}
          maxWidth="480px"
          footer={
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <GhostButton onClick={() => { setAsk(null); setSentence(''); setError(null) }} disabled={busy}>
                not now
              </GhostButton>
              <PrimaryButton
                onClick={() => void applyStatus(ask, dialog.asksSentence ? sentence.trim() : undefined)}
                disabled={busy || (dialog.asksSentence && !sentence.trim())}
                loading={busy}
              >
                {dialog.confirm}
              </PrimaryButton>
            </div>
          }
        >
          <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0, marginBottom: dialog.asksSentence ? 12 : 0 }}>{dialog.body}</p>
          {dialog.asksSentence && (
            <TextArea value={sentence} onChange={setSentence} placeholder="one sentence" minRows={2} voice autoFocus ariaLabel="one sentence" />
          )}
          {error && <p style={{ ...canvasType.meta, color: t.danger, margin: '10px 0 0' }}>{error}</p>}
        </ModalDialog>,
        document.body
      )}
    </div>
  )
}
