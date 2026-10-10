'use client'

// The page half of the vision room (vision-room.tsx): the state of one
// project's vision, in a single place.
//
// Most of it is not made by anyone: what the project is for, its rules, its
// pieces and what runs across them are the canvas itself, read out in one
// column, so they are always true and cost nothing to show. Three things are
// added on top, and each is only ever there because the person said so:
//   - a reading of the canvas (the vision said back, and where it does not
//     hold together), made when asked for and dated;
//   - what was decided, with the reason when one was given;
//   - what is still open.

import { useState, type ReactNode } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { TextArea } from '@/components/ui/field'
import { WorkingDots } from '@/components/ui/working'
import { hueOf } from '@/components/studio/work/bits'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, type as typeRole } from '@/lib/design-tokens'
import type { Appearance, Rule, Thread, TreeNode } from '@/lib/studio/node-types'
import { extentOf } from '@/lib/studio/tree'
import type { KeptLine, Reading } from '@/lib/studio/vision/types'

const STATUS: Record<string, string> = { open: 'not started', drafted: 'in draft', done: 'done' }

const day = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

export type KeptAction =
  | { action: 'remove'; id: string }
  | { action: 'settle'; id: string; text: string; why: string }
  | { action: 'add'; kind: 'decision' | 'open'; text: string; why: string }

export function VisionPage({
  project,
  pieces,
  threads,
  appearancesFor,
  kept,
  reading,
  stale,
  unread,
  loaded,
  readingBusy,
  readingFailed,
  onRead,
  onDismissGap,
  onKept,
  onOpenPiece,
  disabled = false,
}: {
  project: { title: string; intent: string; rules: Rule[] }
  pieces: TreeNode[]
  threads: Thread[]
  appearancesFor: (threadId: string) => Appearance[]
  kept: KeptLine[]
  reading: Reading | null
  stale: boolean
  unread: { images: number; recordings: number }
  loaded: boolean
  readingBusy: boolean
  readingFailed: boolean
  onRead: () => void
  onDismissGap: (gapId: string) => void
  onKept: (action: KeptAction) => Promise<boolean>
  onOpenPiece: (id: string) => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const rules = project.rules.filter((r) => !r.retired_at)
  const decided = kept.filter((k) => k.state === 'kept' && k.kind === 'decision').slice().reverse()
  const open = kept.filter((k) => k.state === 'kept' && k.kind === 'open').slice().reverse()
  const gaps = reading?.gaps ?? []

  const quietButton = (label: ReactNode, onClick: () => void, busy = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      style={{
        ...canvasType.small, fontSize: 12, padding: '7px 13px', borderRadius: 999, cursor: disabled || busy ? 'default' : 'pointer',
        background: 'transparent', border: `1px solid ${alpha(t.textPrimary, 0.2)}`, color: t.textSecondary,
      }}
    >
      {busy ? <WorkingDots /> : label}
    </button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 34 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ ...typeRole.eyebrow, color: t.violet }}>The vision</span>
        <h1 style={{ ...typeRole.display, color: t.textPrimary, textWrap: 'balance' }}>{project.title || 'Untitled'}</h1>
      </header>

      {/* ── the vision, said back ─────────────────────────────────────────── */}
      <Section label="As it stands">
        {reading?.statement ? (
          <p style={{ ...typeRole.quote, fontSize: 20, color: t.textPrimary, textWrap: 'pretty' }}>{reading.statement}</p>
        ) : reading ? (
          <Muted>There is not enough written on the canvas yet to say a vision back. What the whole thing is for is the place to start.</Muted>
        ) : (
          <Muted>
            Nothing has read the canvas yet. When you ask, it reads every word on it, says the vision back in a few sentences, and points at anything that does not hold together.
          </Muted>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {loaded && !disabled && quietButton(reading ? 'Read the canvas again' : 'Read the canvas', onRead, readingBusy)}
          {reading && !readingBusy && (
            <span style={{ ...canvasType.small, color: stale ? t.ochre : t.textMuted }}>
              {stale ? `Read on ${day(reading.at)}. The canvas has changed since.` : `Read from the canvas on ${day(reading.at)}.`}
            </span>
          )}
          {readingBusy && <span style={{ ...canvasType.small, color: t.textMuted }}>Reading every word on the canvas. This takes a little while.</span>}
          {readingFailed && !readingBusy && <span style={{ ...canvasType.small, color: t.ember }}>That reading did not come back. Try again in a moment.</span>}
        </div>
      </Section>

      {/* ── straight from the canvas ──────────────────────────────────────── */}
      <Section label="What it is for">
        {project.intent.trim()
          ? <p style={{ ...canvasType.conceptBody, color: t.textPrimary, margin: 0, whiteSpace: 'pre-wrap' }}>{project.intent}</p>
          : <Muted>Not written yet. It is the first line of the title block on the canvas.</Muted>}
      </Section>

      <Section label="What it holds to">
        {rules.length ? (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rules.map((r) => (
              <li key={r.id} style={{ ...canvasType.body, color: t.textPrimary, display: 'flex', gap: 10 }}>
                <span aria-hidden style={{ color: t.ochre, flexShrink: 0 }}>—</span>{r.text}
              </li>
            ))}
          </ul>
        ) : <Muted>No rules over the whole project yet. One said in passing here is offered back to you to keep.</Muted>}
      </Section>

      <Section label={pieces.length === 1 ? 'The piece' : 'The pieces'}>
        {pieces.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pieces.map((p, i) => {
              const about = p.intent.trim() || (p.core_truth ?? '').trim()
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onOpenPiece(p.id)}
                  title="Open this piece"
                  className="vision-piece"
                  style={{
                    display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'baseline', textAlign: 'left',
                    padding: '10px 12px', margin: '0 -12px', borderRadius: radius.field, border: 'none', background: 'transparent', cursor: 'pointer',
                  }}
                >
                  <span style={{ ...canvasType.meta, color: t.textMuted }}>{i + 1}</span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <span style={{ ...canvasType.words, color: t.textPrimary }}>{p.title || 'untitled'}</span>
                    <span style={{ ...canvasType.small, color: about ? t.textSecondary : t.textMuted }}>
                      {about || 'Nothing says what this one is for yet.'}
                    </span>
                  </span>
                  <span style={{ ...canvasType.meta, color: t.textMuted, whiteSpace: 'nowrap' }}>
                    {STATUS[p.status] ?? p.status}{extentOf(p) ? ` · ${extentOf(p).toLocaleString()} words` : ''}
                  </span>
                </button>
              )
            })}
          </div>
        ) : <Muted>No pieces on the canvas yet.</Muted>}
      </Section>

      {threads.length > 0 && (
        <Section label="What runs across">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {threads.map((th) => {
              const touched = new Set(appearancesFor(th.id).map((a) => a.rootId))
              const quiet = pieces.filter((p) => !touched.has(p.id)).map((p) => p.title || 'untitled')
              return (
                <div key={th.id} style={{ display: 'grid', gridTemplateColumns: '12px 1fr', gap: 10, alignItems: 'baseline' }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 999, background: hueOf(t, th.hue), transform: 'translateY(-1px)' }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ ...canvasType.words, color: t.textPrimary }}>{th.name || 'an unnamed thread'}</span>
                    {th.intent.trim() && <span style={{ ...canvasType.small, color: t.textSecondary }}>{th.intent}</span>}
                    <span style={{ ...canvasType.small, color: t.textMuted }}>
                      {touched.size === 0 ? 'On no piece yet.' : `In ${touched.size} of ${pieces.length}.`}
                      {quiet.length > 0 && touched.size > 0 ? ` Quiet in ${quiet.join(', ')}.` : ''}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* ── kept from talk ────────────────────────────────────────────────── */}
      <Section label="Decided">
        {decided.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {decided.map((k) => (
              <KeptRow key={k.id} line={k} disabled={disabled} onRemove={() => onKept({ action: 'remove', id: k.id })} />
            ))}
          </div>
        ) : <Muted>Nothing kept yet. When you settle something while talking, it is offered back to you to keep here, with your reason if you gave one.</Muted>}
        {!disabled && <AddLine kind="decision" onAdd={(text, why) => onKept({ action: 'add', kind: 'decision', text, why })} />}
      </Section>

      <Section label="Still open">
        {open.length + gaps.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {open.map((k) => (
              <KeptRow
                key={k.id}
                line={k}
                disabled={disabled}
                onRemove={() => onKept({ action: 'remove', id: k.id })}
                onSettle={(text, why) => onKept({ action: 'settle', id: k.id, text, why })}
              />
            ))}
            {gaps.map((g) => (
              <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderRadius: radius.widget, background: alpha(t.ochre, 0.08), border: `1px solid ${alpha(t.ochre, 0.26)}` }}>
                <span style={{ ...canvasType.chip, color: t.ochre }}>From the reading of the canvas</span>
                <p style={{ ...canvasType.body, color: t.textPrimary, margin: 0 }}>{g.text}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {g.where.map((w) => (
                    <span key={w} style={{ ...canvasType.chip, fontSize: 11, padding: '3px 8px', borderRadius: 999, background: alpha(t.textPrimary, 0.06), color: t.textSecondary }}>{w}</span>
                  ))}
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => onDismissGap(g.id)}
                      style={{ ...canvasType.small, fontSize: 12, marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: t.textMuted, textDecoration: 'underline', textUnderlineOffset: 3 }}
                    >
                      Not a gap
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : <Muted>Nothing open is kept here. A question you name as unsettled is offered back to you, and a reading of the canvas adds anything on it that pulls two ways.</Muted>}
        {!disabled && <AddLine kind="open" onAdd={(text) => onKept({ action: 'add', kind: 'open', text, why: '' })} />}
      </Section>

      <p style={{ ...canvasType.small, color: t.textMuted, margin: 0, paddingTop: 18, borderTop: `1px solid ${alpha(t.textPrimary, 0.08)}` }}>
        This page is this project only, made from every word on its canvas. It does not look at images or listen to recordings{unread.images + unread.recordings > 0 ? ', only at the words you wrote on them' : ''}, and it does not read the writing inside a piece.
      </p>

      <style>{`.vision-piece:hover { background: ${alpha(t.textPrimary, 0.05)}; }`}</style>
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  const { t } = useTheme()
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 style={{ ...canvasType.label, color: t.textMuted, margin: 0 }}>{label}</h2>
      {children}
    </section>
  )
}

function Muted({ children }: { children: ReactNode }) {
  const { t } = useTheme()
  return <p style={{ ...canvasType.small, color: t.textMuted, margin: 0, maxWidth: 560 }}>{children}</p>
}

/** One kept line. A question can be answered where it sits, which turns it into a decision. */
function KeptRow({
  line, disabled, onRemove, onSettle,
}: {
  line: KeptLine
  disabled: boolean
  onRemove: () => Promise<boolean>
  onSettle?: (text: string, why: string) => Promise<boolean>
}) {
  const { t } = useTheme()
  const [settling, setSettling] = useState(false)
  const [text, setText] = useState('')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const link = { ...canvasType.small, fontSize: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: t.textMuted, textDecoration: 'underline', textUnderlineOffset: 3 } as const

  const settle = async () => {
    if (!onSettle || !text.trim() || busy) return
    setBusy(true)
    const ok = await onSettle(text.trim(), why.trim())
    setBusy(false)
    if (ok) setSettling(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <p style={{ ...canvasType.words, color: t.textPrimary, margin: 0 }}>{line.text}</p>
      {line.why && <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>Because {line.why.replace(/^because\s+/i, '')}</p>}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ ...canvasType.meta, color: t.textMuted }}>{day(line.at)}</span>
        {!disabled && onSettle && !settling && <button type="button" style={link} onClick={() => setSettling(true)}>It is settled</button>}
        {!disabled && <button type="button" style={link} disabled={busy} onClick={() => { setBusy(true); void onRemove().finally(() => setBusy(false)) }}>Take it off</button>}
      </div>
      {settling && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6, padding: '12px 14px', borderRadius: radius.widget, background: alpha(t.verdant, 0.08), border: `1px solid ${alpha(t.verdant, 0.26)}` }}>
          <TextArea bare oneParagraph autoFocus maxHeight={160} ariaLabel="What was decided" placeholder="What did you decide?" value={text} onChange={setText}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void settle() } }}
            style={{ ...canvasType.body, borderBottom: `1px dashed ${alpha(t.textPrimary, 0.2)}`, padding: '2px 0' }} />
          <TextArea bare oneParagraph maxHeight={160} ariaLabel="Why" placeholder="Why? Only if you want it kept." value={why} onChange={setWhy}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void settle() } }}
            style={{ ...canvasType.small, color: t.textSecondary, borderBottom: `1px dashed ${alpha(t.textPrimary, 0.14)}`, padding: '2px 0' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => void settle()} disabled={busy || !text.trim()}
              style={{ ...canvasType.chip, fontSize: 11, padding: '7px 12px', borderRadius: radius.field, border: 'none', cursor: busy || !text.trim() ? 'default' : 'pointer', background: text.trim() ? t.inverseBg : alpha(t.textPrimary, 0.08), color: text.trim() ? t.inverseText : t.textMuted }}>
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

/** Writing a line onto the page by hand, without saying it in talk first. */
function AddLine({ kind, onAdd }: { kind: 'decision' | 'open'; onAdd: (text: string, why: string) => Promise<boolean> }) {
  const { t } = useTheme()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)

  const add = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    const ok = await onAdd(text.trim(), why.trim())
    setBusy(false)
    if (ok) { setText(''); setWhy(''); setOpen(false) }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        style={{ ...canvasType.small, fontSize: 12, alignSelf: 'flex-start', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: t.textMuted, textDecoration: 'underline', textUnderlineOffset: 3 }}>
        {kind === 'decision' ? 'Write one in' : 'Write a question in'}
      </button>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: radius.widget, background: t.cardBgInner, border: `1px solid ${t.divider}` }}>
      <TextArea bare oneParagraph autoFocus maxHeight={160} ariaLabel={kind === 'decision' ? 'What was decided' : 'What is still open'}
        placeholder={kind === 'decision' ? 'What was decided?' : 'What is not settled yet?'} value={text} onChange={setText}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }}
        style={{ ...canvasType.body, borderBottom: `1px dashed ${alpha(t.textPrimary, 0.2)}`, padding: '2px 0' }} />
      {kind === 'decision' && (
        <TextArea bare oneParagraph maxHeight={160} ariaLabel="Why" placeholder="Why? Only if you want it kept." value={why} onChange={setWhy}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }}
          style={{ ...canvasType.small, color: t.textSecondary, borderBottom: `1px dashed ${alpha(t.textPrimary, 0.14)}`, padding: '2px 0' }} />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => void add()} disabled={busy || !text.trim()}
          style={{ ...canvasType.chip, fontSize: 11, padding: '7px 12px', borderRadius: radius.field, border: 'none', cursor: busy || !text.trim() ? 'default' : 'pointer', background: text.trim() ? t.inverseBg : alpha(t.textPrimary, 0.08), color: text.trim() ? t.inverseText : t.textMuted }}>
          {busy ? <WorkingDots /> : 'Keep it'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setText(''); setWhy('') }}
          style={{ ...canvasType.chip, fontSize: 11, padding: '7px 12px', borderRadius: radius.field, border: 'none', cursor: 'pointer', background: alpha(t.textPrimary, 0.07), color: t.textSecondary }}>
          Never mind
        </button>
      </div>
    </div>
  )
}
