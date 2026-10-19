'use client'

// What the check-in understood when someone left a note for a project, shown
// before anything happens: the words, the project, a thought or a reminder.
// Every part can be changed. "Add it" puts it on that project's canvas as a
// note; "This was a check-in" turns it back into a check-in. Nothing reaches a
// project without the yes.

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { motion as m } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { Card } from '@/components/shell/page-shell'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { Pill } from '@/components/ui/pill'
import { alpha, type as typeRoles } from '@/lib/design-tokens'
import { openPlans } from '@/lib/billing/use-plan'
import { NOTE_MAX, type NoteKind } from '@/lib/studio/board-items'

export interface NoteOffer {
  id: string
  /** What they said, as they said it. */
  said: string
  text: string
  kind: NoteKind
  project_id: string | null
  state: 'offered' | 'adding' | 'added' | 'failed'
  error?: string
}

export function NoteOfferCard({
  offer, projects, demo = false, locked = null, onChange, onAdd, onCheckIn, onLeave,
}: {
  offer: NoteOffer
  projects: Array<{ id: string; title: string }>
  /** In the first-visit walk: shown, never pressed. */
  demo?: boolean
  /** The plan does not carry notes from a check-in (Focus, or a plan that ended): shown as it would be, greyed, with why. */
  locked?: 'practice' | 'ended' | null
  onChange: (patch: Partial<NoteOffer>) => void
  onAdd: () => void
  /** "This was a check-in": the words go to the companion instead. */
  onCheckIn: () => void
  onLeave: () => void
}) {
  const { t } = useTheme()
  const box = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [offer.text])

  const project = projects.find((p) => p.id === offer.project_id) ?? null
  const reminder = offer.kind === 'reminder'
  const busy = offer.state === 'adding'

  if (offer.state === 'added') {
    return (
      <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} role="status" data-tour="checkin-added">
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span aria-hidden style={{ width: 20, height: 20, borderRadius: '50%', background: t.verdant, color: t.containerBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
            <p style={{ ...typeRoles.small, color: t.textSecondary, margin: 0, flex: 1, minWidth: 180 }}>
              {reminder ? 'Reminder' : 'Note'} added to <strong style={{ fontWeight: 700, color: t.textPrimary }}>{project?.title || 'your project'}</strong>. It is waiting on the canvas.
            </p>
            {project && !demo && (
              <Link href={`/p/${project.id}`} style={{ ...typeRoles.small, fontSize: 13, color: t.textPrimary, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                Open it
              </Link>
            )}
          </div>
        </Card>
      </m.div>
    )
  }

  const field: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: t.inputBg, border: `1px solid ${t.inputBorder}`,
    borderRadius: 12, padding: '10px 12px', color: t.textPrimary, outline: 'none', fontFamily: 'var(--font-geist-sans)',
  }

  return (
    <m.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} data-tour="checkin-note">
      <Card>
        {/* What it would have done, greyed and out of reach, then why. */}
        <div aria-disabled={locked ? true : undefined} inert={!!locked} style={locked ? { opacity: 0.42, filter: 'grayscale(1)', pointerEvents: 'none', userSelect: 'none' } : undefined}>
        <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, margin: 0 }}>You said</p>
        <p style={{ ...typeRoles.quote, fontSize: 15, color: t.textSecondary, margin: '4px 0 14px' }}>&ldquo;{offer.said}&rdquo;</p>

        <p style={{ ...typeRoles.small, color: t.textSecondary, margin: '0 0 8px' }}>
          {project
            ? <>I&apos;ll keep this on <strong style={{ fontWeight: 700, color: t.textPrimary }}>{project.title}</strong>{reminder ? ' as a reminder' : ' as a note'}:</>
            : <>I&apos;ll keep this{reminder ? ' as a reminder' : ' as a note'}. Which project is it for?</>}
        </p>

        <textarea
          ref={box}
          aria-label={reminder ? 'The reminder' : 'The note'}
          value={offer.text}
          readOnly={demo}
          maxLength={NOTE_MAX}
          rows={1}
          onChange={(e) => onChange({ text: e.target.value })}
          style={{ ...field, fontSize: 15, fontWeight: 500, lineHeight: 1.5, resize: 'none', overflow: 'hidden' }}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 10 }}>
          <select
            aria-label="Which project"
            value={offer.project_id ?? ''}
            disabled={demo}
            onChange={(e) => onChange({ project_id: e.target.value || null })}
            style={{ ...field, width: 'auto', maxWidth: '100%', padding: '7px 10px', fontSize: 13.5, cursor: 'pointer' }}
          >
            <option value="" disabled>Choose a project…</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title.trim() || 'Untitled'}</option>)}
          </select>
          <div role="group" aria-label="What kind of note" style={{ display: 'flex', gap: 6 }}>
            <Pill hue="neutral" size="md" selected={!reminder} onClick={demo ? undefined : () => onChange({ kind: 'thought' })}>A thought</Pill>
            <Pill hue="neutral" size="md" selected={reminder} onClick={demo ? undefined : () => onChange({ kind: 'reminder' })}>A reminder</Pill>
          </div>
        </div>

        {!locked && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
          <QuietButton onClick={demo ? undefined : onAdd} disabled={!offer.project_id || !offer.text.trim()} loading={busy} loadingLabel="Adding…">
            Add it
          </QuietButton>
          <GhostButton size="sm" onClick={demo ? undefined : onCheckIn} disabled={busy}>No, this was a check-in</GhostButton>
          <GhostButton size="sm" onClick={demo ? undefined : onLeave} disabled={busy}>Leave it</GhostButton>
        </div>}
        </div>
        {locked && (
          <div role="note" style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: alpha(t.ochre, 0.1), border: `1px solid ${alpha(t.ochre, 0.32)}` }}>
            <p style={{ ...typeRoles.small, fontWeight: 600, color: t.textPrimary, margin: 0 }}>Leaving thoughts on a project is part of Direction.</p>
            <p style={{ ...typeRoles.small, color: t.textSecondary, margin: '4px 0 0' }}>
              {locked === 'practice'
                ? 'Your free trial has ended, and Focus doesn’t include it. To keep sending thoughts to your projects from a check-in, upgrade to Direction.'
                : 'Your free trial has ended. To keep sending thoughts to your projects from a check-in, choose Direction.'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
              <QuietButton size="sm" onClick={() => openPlans()}>See Direction</QuietButton>
              <GhostButton size="sm" onClick={onCheckIn}>Talk it through as a check-in</GhostButton>
              <GhostButton size="sm" onClick={onLeave}>Leave it</GhostButton>
            </div>
          </div>
        )}
        {offer.state === 'failed' && (
          <p role="alert" style={{ ...typeRoles.small, fontSize: 12, color: t.danger, margin: '10px 0 0' }}>{offer.error || 'That did not save. Try again.'}</p>
        )}
      </Card>
    </m.div>
  )
}
