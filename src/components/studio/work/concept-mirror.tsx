'use client'

// A piece's core concept, as it stands now. The same component in the two
// places it appears, the concept on the writing page (write-tools.tsx) and
// each piece in the vision room (vision-page.tsx), reading and changing the
// same fields through the same route (/api/studio/projects/:id/concept). That
// is what makes the two mirrors: there is only one concept, seen twice.
//
// The concept was locked when the piece began, but it is allowed to move.
// Each part can be rewritten where it stands; an open thread can be added,
// answered or let go; what was decided since it was locked is listed under
// it, from the vision room. Every change is dated, and the date shows beside
// the part it changed.

import { useState, type ReactNode } from 'react'
import { JourneyCurve } from '@/components/widgets'
import { Card, Divider, Eyebrow } from '@/components/shell/page-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { TextArea } from '@/components/ui/field'
import { WorkingDots } from '@/components/ui/working'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, type as typeRoles } from '@/lib/design-tokens'
import type { ConceptChange, ConceptField, KeptLine } from '@/lib/studio/vision/types'

export interface ConceptNode {
  id: string
  core_truth: string | null
  intent: string
  emotional_journey: string | null
  open_threads: string[] | null
}

export type ConceptAction =
  | { action: 'edit'; node_id: string; field: ConceptField; text: string }
  | { action: 'add_thread'; node_id: string; text: string }
  | { action: 'remove_thread'; node_id: string; text: string }
  | { action: 'settle_thread'; node_id: string; text: string; answer: string; why: string }

const day = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
const WHERE: Record<ConceptChange['source'], string> = { talk: 'from talk', room: 'in the vision room', concept: '' }

/** Sends one change to the concept, and says whether it landed. */
export async function changeConcept(projectId: string, body: ConceptAction, from: 'room' | 'concept'): Promise<boolean> {
  try {
    const res = await fetch(`/api/studio/projects/${projectId}/concept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ ...body, from }),
    })
    return res.ok
  } catch {
    return false
  }
}

export function ConceptMirror({
  node,
  changes,
  decided,
  projectOpen = [],
  disabled = false,
  onChange,
}: {
  node: ConceptNode
  /** Every change made since it was locked; this piece's are picked out here. */
  changes: ConceptChange[]
  /** Decided since it was locked: this piece's, and the whole project's. */
  decided: KeptLine[]
  /** Open questions about the whole project rather than this piece, shown for context. */
  projectOpen?: KeptLine[]
  disabled?: boolean
  /** Makes the change; true when it landed. */
  onChange: (action: ConceptAction) => Promise<boolean>
}) {
  const { t } = useTheme()
  const truth = (node.core_truth ?? '').trim()
  const conviction = (node.intent ?? '').trim()
  const journey = (node.emotional_journey ?? '').trim()
  const threads = (node.open_threads ?? []).map((x) => x.trim()).filter(Boolean)
  const mine = changes.filter((c) => c.node_id === node.id)
  const lastChange = (field: ConceptChange['field']) => [...mine].reverse().find((c) => c.field === field)
  const changedNote = (field: ConceptChange['field']) => {
    const c = lastChange(field)
    if (!c) return null
    return `changed ${day(c.at)}${WHERE[c.source] ? ` · ${WHERE[c.source]}` : ''}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Part
        label="Core truth"
        field="core_truth"
        value={truth}
        note={changedNote('core_truth')}
        disabled={disabled}
        centred
        onSave={(text) => onChange({ action: 'edit', node_id: node.id, field: 'core_truth', text })}
        render={(v) => <p style={{ ...typeRoles.ui, fontSize: 18, fontWeight: 500, lineHeight: 1.5, letterSpacing: '-0.02em', color: t.textPrimary, margin: 0 }}>{v}</p>}
      />
      <Part
        label="Conviction"
        field="intent"
        value={conviction}
        note={changedNote('intent')}
        disabled={disabled}
        onSave={(text) => onChange({ action: 'edit', node_id: node.id, field: 'intent', text })}
        render={(v) => (
          <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
            <div style={{ width: 3, borderRadius: 2, background: t.ember, flexShrink: 0, opacity: 0.6 }} />
            <p style={{ ...typeRoles.ui, fontSize: 15, lineHeight: 1.65, fontWeight: 500, color: t.textPrimary, margin: 0, whiteSpace: 'pre-line' }}>{v}</p>
          </div>
        )}
      />
      <Part
        label="Emotional journey"
        field="emotional_journey"
        value={journey}
        note={changedNote('emotional_journey')}
        disabled={disabled}
        multiline
        hint="One step a line: a few words, a dash, then the sentence."
        onSave={(text) => onChange({ action: 'edit', node_id: node.id, field: 'emotional_journey', text })}
        render={(v) => <JourneyCurve text={v} />}
      />

      <Card inner padding={18}>
        <Head label="Open threads" note={changedNote('open_threads')} />
        {threads.length === 0 && <p style={{ ...canvasType.small, color: t.textMuted, margin: '6px 0 0' }}>Nothing left open in this piece.</p>}
        {threads.map((line, i) => (
          <div key={line}>
            <Thread line={line} disabled={disabled} onRemove={() => onChange({ action: 'remove_thread', node_id: node.id, text: line })}
              onSettle={(answer, why) => onChange({ action: 'settle_thread', node_id: node.id, text: line, answer, why })} />
            {i < threads.length - 1 && <Divider />}
          </div>
        ))}
        {!disabled && <AddThread onAdd={(text) => onChange({ action: 'add_thread', node_id: node.id, text })} />}
        {projectOpen.length > 0 && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${alpha(t.textPrimary, 0.12)}` }}>
            <span style={{ ...canvasType.chip, color: t.textMuted }}>Open for the whole project</span>
            {projectOpen.map((k) => (
              <p key={k.id} style={{ ...canvasType.small, color: t.textSecondary, margin: '6px 0 0' }}>— {k.text}</p>
            ))}
          </div>
        )}
      </Card>

      {decided.length > 0 && (
        <Card inner padding={18}>
          <Head label="Decided since it was locked" />
          {decided.map((k, i) => (
            <div key={k.id}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 0' }}>
                <span style={{ ...typeRoles.ui, fontSize: 14, lineHeight: 1.55, color: t.textPrimary }}>{k.text}</span>
                {k.why && <span style={{ ...canvasType.small, color: t.textSecondary }}>Because {k.why.replace(/^because\s+/i, '')}</span>}
                <span style={{ ...canvasType.meta, color: t.textMuted }}>{day(k.at)}{k.node_id ? '' : ' · for the whole project'}</span>
              </div>
              {i < decided.length - 1 && <Divider />}
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

function Head({ label, note }: { label: string; note?: string | null }) {
  const { t } = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
      <Eyebrow>{label}</Eyebrow>
      {note && <span style={{ ...canvasType.meta, color: t.textMuted, whiteSpace: 'nowrap' }}>{note}</span>}
    </div>
  )
}

const linkStyle = (color: string) => ({
  ...canvasType.small, fontSize: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color, textDecoration: 'underline', textUnderlineOffset: 3,
} as const)

/** One part of the concept, read, or rewritten where it stands. */
function Part({
  label, field, value, note, disabled, centred = false, multiline = false, hint, onSave, render,
}: {
  label: string
  field: ConceptField
  value: string
  note: string | null
  disabled: boolean
  centred?: boolean
  multiline?: boolean
  hint?: string
  onSave: (text: string) => Promise<boolean>
  render: (value: string) => ReactNode
}) {
  const { t } = useTheme()
  void field
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const save = async () => {
    const text = draft.trim()
    if (!text || busy) return
    if (text === value) { setEditing(false); return }
    setBusy(true)
    setFailed(false)
    const ok = await onSave(text)
    setBusy(false)
    if (ok) setEditing(false)
    else setFailed(true)
  }

  if (!value && !editing) {
    if (disabled) return null
    return (
      <button type="button" onClick={() => { setDraft(''); setEditing(true) }} style={{ ...linkStyle(t.textMuted), alignSelf: 'flex-start' }}>
        Write the {label.toLowerCase()} in
      </button>
    )
  }

  return (
    <Card inner padding={centred && !editing ? '22px 20px' : 18}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...(centred && !editing ? { alignItems: 'center', textAlign: 'center' } : {}) }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, width: '100%', justifyContent: centred && !editing ? 'center' : 'space-between', flexWrap: 'wrap' }}>
          <Eyebrow>{label}</Eyebrow>
          {note && <span style={{ ...canvasType.meta, color: t.textMuted }}>{note}</span>}
        </div>
        {editing ? (
          <>
            <TextArea
              autoFocus
              ariaLabel={label}
              value={draft}
              onChange={setDraft}
              oneParagraph={!multiline}
              minRows={multiline ? 4 : 2}
              maxHeight={360}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setDraft(value) }
                if (!multiline && e.key === 'Enter') { e.preventDefault(); void save() }
              }}
              style={{ ...typeRoles.ui, fontSize: 15, lineHeight: 1.6 }}
            />
            {hint && <span style={{ ...canvasType.small, color: t.textMuted }}>{hint}</span>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button type="button" onClick={() => void save()} disabled={busy || !draft.trim()}
                style={{ ...canvasType.chip, fontSize: 11, padding: '7px 12px', borderRadius: radius.field, border: 'none', cursor: busy ? 'default' : 'pointer', background: draft.trim() ? t.inverseBg : alpha(t.textPrimary, 0.08), color: draft.trim() ? t.inverseText : t.textMuted }}>
                {busy ? <WorkingDots /> : 'Keep this'}
              </button>
              <button type="button" onClick={() => { setEditing(false); setDraft(value); setFailed(false) }}
                style={{ ...canvasType.chip, fontSize: 11, padding: '7px 12px', borderRadius: radius.field, border: 'none', cursor: 'pointer', background: alpha(t.textPrimary, 0.07), color: t.textSecondary }}>
                Never mind
              </button>
              {failed && <span style={{ ...canvasType.small, color: t.ember }}>That did not save. Try again.</span>}
            </div>
          </>
        ) : (
          <>
            <div style={{ width: '100%' }}>{render(value)}</div>
            {!disabled && (
              <button type="button" onClick={() => { setDraft(value); setEditing(true) }} style={{ ...linkStyle(t.textMuted), alignSelf: centred ? 'center' : 'flex-start' }}>
                Rewrite it
              </button>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

/** An open thread: answered (it becomes a decision) or let go. */
function Thread({ line, disabled, onRemove, onSettle }: {
  line: string
  disabled: boolean
  onRemove: () => Promise<boolean>
  onSettle: (answer: string, why: string) => Promise<boolean>
}) {
  const { t } = useTheme()
  const [settling, setSettling] = useState(false)
  const [answer, setAnswer] = useState('')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)

  const settle = async () => {
    if (!answer.trim() || busy) return
    setBusy(true)
    const ok = await onSettle(answer.trim(), why.trim())
    setBusy(false)
    if (ok) setSettling(false)
  }

  return (
    <div style={{ padding: '9px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', gap: 10, ...typeRoles.ui, fontSize: 14, lineHeight: 1.55, color: t.textPrimary }}>
        <span style={{ color: t.ember, flexShrink: 0 }}>—</span>
        <span>{line}</span>
      </div>
      {!disabled && !settling && (
        <div style={{ display: 'flex', gap: 14, paddingLeft: 20 }}>
          <button type="button" style={linkStyle(t.textMuted)} onClick={() => setSettling(true)}>It is settled</button>
          <button type="button" style={linkStyle(t.textMuted)} disabled={busy} onClick={() => { setBusy(true); void onRemove().finally(() => setBusy(false)) }}>Take it off</button>
        </div>
      )}
      {settling && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginLeft: 20, padding: '12px 14px', borderRadius: radius.widget, background: alpha(t.verdant, 0.08), border: `1px solid ${alpha(t.verdant, 0.26)}` }}>
          <TextArea bare oneParagraph autoFocus maxHeight={160} ariaLabel="What was decided" placeholder="What did you decide?" value={answer} onChange={setAnswer}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void settle() } }}
            style={{ ...canvasType.body, borderBottom: `1px dashed ${alpha(t.textPrimary, 0.2)}`, padding: '2px 0' }} />
          <TextArea bare oneParagraph maxHeight={160} ariaLabel="Why" placeholder="Why? Only if you want it kept." value={why} onChange={setWhy}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void settle() } }}
            style={{ ...canvasType.small, color: t.textSecondary, borderBottom: `1px dashed ${alpha(t.textPrimary, 0.14)}`, padding: '2px 0' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void settle()} disabled={busy || !answer.trim()}
              style={{ ...canvasType.chip, fontSize: 11, padding: '7px 12px', borderRadius: radius.field, border: 'none', cursor: busy || !answer.trim() ? 'default' : 'pointer', background: answer.trim() ? t.inverseBg : alpha(t.textPrimary, 0.08), color: answer.trim() ? t.inverseText : t.textMuted }}>
              {busy ? <WorkingDots /> : 'Keep it as decided'}
            </button>
            <button type="button" onClick={() => setSettling(false)}
              style={{ ...canvasType.chip, fontSize: 11, padding: '7px 12px', borderRadius: radius.field, border: 'none', cursor: 'pointer', background: alpha(t.textPrimary, 0.07), color: t.textSecondary }}>
              Not yet
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function AddThread({ onAdd }: { onAdd: (text: string) => Promise<boolean> }) {
  const { t } = useTheme()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    const ok = await onAdd(text.trim())
    setBusy(false)
    if (ok) { setText(''); setOpen(false) }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={{ ...linkStyle(t.textMuted), marginTop: 8 }}>Add an open thread</button>
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 10 }}>
      <TextArea bare oneParagraph autoFocus maxHeight={120} ariaLabel="A question this piece has not settled" placeholder="What has this piece not settled yet?" value={text} onChange={setText}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } if (e.key === 'Escape') { e.preventDefault(); setOpen(false) } }}
        style={{ ...canvasType.body, flex: 1, borderBottom: `1px dashed ${alpha(t.textPrimary, 0.2)}`, padding: '2px 0' }} />
      <button type="button" onClick={() => void add()} disabled={busy || !text.trim()}
        style={{ ...canvasType.chip, fontSize: 11, padding: '7px 12px', borderRadius: radius.field, border: 'none', cursor: busy || !text.trim() ? 'default' : 'pointer', background: text.trim() ? t.inverseBg : alpha(t.textPrimary, 0.08), color: text.trim() ? t.inverseText : t.textMuted }}>
        {busy ? <WorkingDots /> : 'Add'}
      </button>
    </div>
  )
}
