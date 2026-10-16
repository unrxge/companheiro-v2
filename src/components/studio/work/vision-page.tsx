'use client'

// The page half of the vision room (vision-room.tsx): the state of one
// project's vision, in a single place.
//
// It opens on the core truth, the sentence the work rests on, because that is
// what the rest of the page is measured against and what is worth looking at
// first. Then what the whole thing is for, what it holds to, the pieces with
// their core concepts, what runs across them, what has been decided, and what
// is still open.
//
// Most of it is not made by anyone: it is the canvas and the core concept read
// out, so it is always true. Three things are added on top, each only because
// the person asked or agreed: a reading of the canvas, made when asked for and
// dated (where it does not hold together, and for several pieces what they say
// together that none says alone); what was decided; and what was raised as
// still open. What was raised
// here is kept apart from the open threads the core concept was locked with,
// so it is always clear which is which.
//
// One way of drawing things for the whole column: a section is a small tinted
// mark, a label and a count; a thing in it is a tile on the page's card colour
// with, where it means something, a coloured edge. Each kind of thing has its
// own colour and mark so they never blend: the core truth violet, what it is
// for ember, rules ochre, decisions verdant ticks on a line through time,
// open questions tide question marks, the reading's gaps ochre.

import { useState, type CSSProperties, type ReactNode } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { TextArea } from '@/components/ui/field'
import { WorkingDots } from '@/components/ui/working'
import { hueOf } from '@/components/studio/work/bits'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, type as typeRole, type MeaningKey } from '@/lib/design-tokens'
import type { Appearance, Rule, Thread, TreeNode } from '@/lib/studio/node-types'
import { extentOf } from '@/lib/studio/tree'
import type { ConceptChange, KeptLine, Reading } from '@/lib/studio/vision/types'
import { AddThread, changedNote, ConceptMirror, ConceptPartBlock, type ConceptAction } from '@/components/studio/work/concept-mirror'

const STATUS: Record<string, string> = { open: 'not started', drafted: 'in draft', done: 'done' }

const day = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

export type KeptAction =
  | { action: 'remove'; id: string }
  | { action: 'settle'; id: string; text: string; why: string }
  | { action: 'add'; kind: 'decision' | 'open'; text: string; why: string; node_id?: string | null }

// ── marks ───────────────────────────────────────────────────────────────────

const svg = (children: ReactNode, size = 12, fill = false) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke={fill ? 'none' : 'currentColor'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)
const MARK = {
  star: svg(<path d="M12 2L14.6 9.4 22 12 14.6 14.6 12 22 9.4 14.6 2 12 9.4 9.4Z" />, 12, true),
  target: svg(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>),
  rule: svg(<><line x1="7" y1="8" x2="17" y2="8" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="7" y1="16" x2="12" y2="16" /></>),
  pieces: svg(<><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>),
  thread: svg(<path d="M3 17c4-8 8 4 12-4s4-4 6-4" />),
  check: svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  question: svg(<><path d="M9.2 9a3 3 0 1 1 4.3 2.7c-.9.4-1.5 1.2-1.5 2.2v.6" /><circle cx="12" cy="18.3" r="0.6" fill="currentColor" /></>),
  eye: svg(<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" /></>),
  chevron: svg(<path d="M6 9l6 6 6-6" />, 13),
}

/** A section's head: a tinted mark, its name, and how many things are in it. */
function Head({ tone, mark, label, count }: { tone: MeaningKey; mark: ReactNode; label: string; count?: number }) {
  const { t } = useTheme()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span aria-hidden style={{ width: 24, height: 24, borderRadius: 999, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: t.soft[tone], color: t[tone] }}>
        {mark}
      </span>
      <h2 style={{ ...canvasType.label, color: t.textSecondary, margin: 0 }}>{label}</h2>
      {typeof count === 'number' && count > 0 && (
        <span style={{ ...canvasType.meta, fontSize: 10.5, padding: '1px 7px', borderRadius: 999, background: alpha(t.textPrimary, 0.07), color: t.textMuted }}>{count}</span>
      )}
    </div>
  )
}

function Section({ tone, mark, label, count, children }: { tone: MeaningKey; mark: ReactNode; label: string; count?: number; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Head tone={tone} mark={mark} label={label} count={count} />
      {children}
    </section>
  )
}

/** A thing on the page. `edge` puts its colour down the left side. */
function Tile({ edge, children, style }: { edge?: string; children: ReactNode; style?: CSSProperties }) {
  const { t } = useTheme()
  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden', background: t.cardBg, border: `1px solid ${t.divider}`, borderRadius: radius.widget,
        padding: edge ? '15px 18px 15px 21px' : '15px 18px', ...style,
      }}
    >
      {edge && <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: edge }} />}
      {children}
    </div>
  )
}

function Muted({ children }: { children: ReactNode }) {
  const { t } = useTheme()
  return <p style={{ ...canvasType.small, color: t.textMuted, margin: 0, maxWidth: 560 }}>{children}</p>
}

const linkStyle = (color: string): CSSProperties => ({
  ...canvasType.small, fontSize: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color, textDecoration: 'underline', textUnderlineOffset: 3,
})

function Chip({ children, tone }: { children: ReactNode; tone?: string }) {
  const { t } = useTheme()
  return (
    <span style={{ ...canvasType.meta, fontSize: 10.5, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', background: tone ? alpha(tone, 0.12) : alpha(t.textPrimary, 0.06), color: tone ?? t.textSecondary }}>
      {children}
    </span>
  )
}

/**
 * "Read the canvas": the one action that reads every word on it for what does
 * not hold together, and for several pieces what they say together. Says when
 * it was last done and whether the canvas has changed since.
 */
function ReadControl({ reading, stale, busy, failed, ready, onRead }: {
  reading: Reading | null
  stale: boolean
  busy: boolean
  failed: boolean
  ready: boolean
  onRead: () => void
}) {
  const { t } = useTheme()
  if (!ready) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={onRead}
        disabled={busy}
        style={{
          ...canvasType.small, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, cursor: busy ? 'default' : 'pointer',
          background: alpha(t.violet, 0.1), border: `1px solid ${alpha(t.violet, 0.32)}`, color: t.textPrimary,
        }}
      >
        <span style={{ color: t.violet, display: 'inline-flex' }}>{MARK.eye}</span>
        {busy ? <WorkingDots color={t.violet} /> : reading ? 'Read the canvas again' : 'Read the canvas'}
      </button>
      {reading && !busy && (
        <span style={{ ...canvasType.meta, color: stale ? t.ochre : t.textMuted }}>
          {stale ? `Read ${day(reading.at)} · the canvas has changed since` : `Read ${day(reading.at)}`}
        </span>
      )}
      {busy && <span style={{ ...canvasType.small, color: t.textMuted }}>Reading every word on the canvas.</span>}
      {failed && !busy && <span style={{ ...canvasType.small, color: t.ember }}>That reading did not come back. Try again in a moment.</span>}
    </div>
  )
}

// ── the page ────────────────────────────────────────────────────────────────

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
  changes,
  onConcept,
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
  /** Every change made to a core concept since it was locked. */
  changes: ConceptChange[]
  /** Changes a piece's core concept: the same change the writing page makes. */
  onConcept: (action: ConceptAction) => Promise<boolean>
  onOpenPiece: (id: string) => void
  disabled?: boolean
}) {
  const { t } = useTheme()
  const rules = project.rules.filter((r) => !r.retired_at)
  const decided = kept.filter((k) => k.state === 'kept' && k.kind === 'decision').slice().reverse()
  const raised = kept.filter((k) => k.state === 'kept' && k.kind === 'open').slice().reverse()
  const gaps = reading?.gaps ?? []
  const pieceTitle = (id: string | null) => (id ? pieces.find((p) => p.id === id)?.title || 'untitled' : null)
  const truths = pieces.filter((p) => (p.core_truth ?? '').trim())
  const withConcept = pieces.filter((p) => (p.core_truth ?? '').trim() || (p.emotional_journey ?? '').trim())
  const conceptThreads = withConcept.map((p) => ({ piece: p, lines: (p.open_threads ?? []).map((x) => x.trim()).filter(Boolean) }))
  const threadCount = conceptThreads.reduce((n, g) => n + g.lines.length, 0)

  const together = pieces.length >= 2 ? reading?.statement ?? '' : ''
  const readProps = { reading, stale, busy: readingBusy, failed: readingFailed, ready: loaded && !disabled, onRead }
  const [openPiece, setOpenPiece] = useState<string | null>(pieces.length === 1 ? pieces[0]?.id ?? null : null)
  const [threadsOpen, setThreadsOpen] = useState(threadCount > 0 && threadCount <= 3)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ ...typeRole.eyebrow, color: t.violet }}>The vision</span>
        <h1 style={{ ...typeRole.display, color: t.textPrimary, textWrap: 'balance' }}>{project.title || 'Untitled'}</h1>
      </header>

      {/* ── the core truth: first, because everything else answers to it ── */}
      {truths.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: -8 }}>
          {truths.map((p) => (
            <CoreTruth
              key={p.id}
              piece={truths.length > 1 ? p.title || 'untitled' : null}
              value={(p.core_truth ?? '').trim()}
              note={changedNote(changes, p.id, 'core_truth')}
              disabled={disabled}
              onSave={(text) => onConcept({ action: 'edit', node_id: p.id, field: 'core_truth', text })}
            />
          ))}
        </div>
      ) : (
        <Muted>No core truth yet. Once a piece has a core concept, its core truth opens this page.</Muted>
      )}

      {/* ── straight from the canvas ──────────────────────────────────────── */}
      <Section tone="ember" mark={MARK.target} label="What it is for">
        <Tile edge={project.intent.trim() ? t.ember : undefined}>
          {project.intent.trim()
            ? <p style={{ ...canvasType.conceptBody, color: t.textPrimary, margin: 0, whiteSpace: 'pre-wrap' }}>{project.intent}</p>
            : <Muted>Not written yet. It is the first line of the title block on the canvas.</Muted>}
        </Tile>
      </Section>

      <Section tone="ochre" mark={MARK.rule} label="What it holds to" count={rules.length}>
        {rules.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {rules.map((r) => (
              <Tile key={r.id} edge={alpha(t.ochre, 0.8)} style={{ padding: '11px 14px 11px 17px' }}>
                <span style={{ ...canvasType.body, fontSize: 14, color: t.textPrimary }}>{r.text}</span>
              </Tile>
            ))}
          </div>
        ) : <Muted>No rules over the whole project yet. One said in passing in talk is offered back to you to keep.</Muted>}
      </Section>

      <Section tone="tide" mark={MARK.pieces} label={pieces.length === 1 ? 'The piece' : 'The pieces'} count={pieces.length}>
        {pieces.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pieces.map((p, i) => {
              const about = p.intent.trim()
              const shown = openPiece === p.id
              const hasConcept = !!((p.core_truth ?? '').trim() || (p.emotional_journey ?? '').trim() || p.intent.trim())
              return (
                <Tile key={p.id} style={{ padding: 0 }}>
                  <button
                    type="button"
                    onClick={() => setOpenPiece(shown ? null : p.id)}
                    aria-expanded={shown}
                    title={shown ? 'Fold its core concept away' : 'Open its core concept'}
                    className="vision-piece"
                    style={{
                      width: '100%', display: 'grid', gridTemplateColumns: '28px 1fr auto', gap: 12, alignItems: 'center', textAlign: 'left',
                      padding: '14px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
                    }}
                  >
                    <span style={{ ...canvasType.meta, width: 26, height: 26, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: t.soft.tide, color: t.tide }}>{i + 1}</span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                      <span style={{ ...canvasType.words, color: t.textPrimary }}>{p.title || 'untitled'}</span>
                      {!shown && (
                        <span style={{ ...canvasType.small, color: about ? t.textSecondary : t.textMuted, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                          {about || 'Nothing says what this one is for yet.'}
                        </span>
                      )}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: t.textMuted }}>
                      <Chip>{STATUS[p.status] ?? p.status}{extentOf(p) ? ` · ${extentOf(p).toLocaleString()} words` : ''}</Chip>
                      <span style={{ display: 'inline-flex', transform: shown ? 'rotate(180deg)' : undefined, transition: 'transform 160ms ease' }}>{MARK.chevron}</span>
                    </span>
                  </button>
                  {shown && (
                    <div style={{ padding: '0 18px 16px 56px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {hasConcept ? (
                        <ConceptMirror
                          look="room"
                          parts={['intent', 'emotional_journey']}
                          node={{ id: p.id, core_truth: p.core_truth, intent: p.intent, emotional_journey: p.emotional_journey, open_threads: p.open_threads }}
                          changes={changes}
                          decided={[]}
                          disabled={disabled}
                          onChange={onConcept}
                        />
                      ) : <Muted>This piece has no core concept yet. It can be built from the piece itself, from a few quick questions.</Muted>}
                      <button type="button" onClick={() => onOpenPiece(p.id)} style={{ ...linkStyle(t.ember), textDecoration: 'none', alignSelf: 'flex-start', marginTop: 12 }}>
                        Open the piece →
                      </button>
                    </div>
                  )}
                </Tile>
              )
            })}
          </div>
        ) : <Muted>No pieces on the canvas yet.</Muted>}

        {/* what the pieces are, held side by side: only for several, and only
           ever something none of them already says */}
        {pieces.length >= 2 && (
          <Tile edge={together ? t.violet : undefined} style={together ? undefined : { background: 'transparent', border: `1px dashed ${t.divider}` }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <span style={{ ...canvasType.label, color: together ? t.violet : t.textMuted }}>The pieces together</span>
              {together
                ? <p style={{ ...typeRole.quote, fontSize: 17, color: t.textPrimary, textWrap: 'pretty' }}>{together}</p>
                : reading
                  ? <Muted>Held side by side, the pieces say nothing the page does not already say.</Muted>
                  : <Muted>What these pieces say together, that none of them says alone. Read the canvas to find out.</Muted>}
              {!reading && <ReadControl {...readProps} />}
            </div>
          </Tile>
        )}
      </Section>

      {threads.length > 0 && (
        <Section tone="violet" mark={MARK.thread} label="What runs across" count={threads.length}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {threads.map((th) => {
              const touched = new Set(appearancesFor(th.id).map((a) => a.rootId))
              const quiet = pieces.filter((p) => !touched.has(p.id)).map((p) => p.title || 'untitled')
              return (
                <Tile key={th.id} edge={hueOf(t, th.hue)} style={{ padding: '12px 14px 12px 17px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ ...canvasType.words, fontSize: 15, color: t.textPrimary }}>{th.name || 'an unnamed thread'}</span>
                    {th.intent.trim() && <span style={{ ...canvasType.small, color: t.textSecondary }}>{th.intent}</span>}
                    <span style={{ ...canvasType.meta, color: t.textMuted }}>
                      {touched.size === 0 ? 'On no piece yet' : `In ${touched.size} of ${pieces.length}`}
                      {quiet.length > 0 && touched.size > 0 ? ` · quiet in ${quiet.join(', ')}` : ''}
                    </span>
                  </div>
                </Tile>
              )
            })}
          </div>
        </Section>
      )}

      {/* ── decided: a line through time ─────────────────────────────────── */}
      <Section tone="verdant" mark={MARK.check} label="Decided" count={decided.length}>
        {decided.length ? (
          <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span aria-hidden style={{ position: 'absolute', left: 11, top: 18, bottom: 18, width: 2, borderRadius: 2, background: alpha(t.verdant, 0.28) }} />
            {decided.map((k) => (
              <Decision key={k.id} line={k} about={pieceTitle(k.node_id)} disabled={disabled} onRemove={() => onKept({ action: 'remove', id: k.id })} />
            ))}
          </div>
        ) : <Muted>Nothing decided yet. When you settle something while talking, it is offered back to you to keep here, with your reason if you gave one.</Muted>}
        {!disabled && <AddLine kind="decision" onAdd={(text, why) => onKept({ action: 'add', kind: 'decision', text, why })} />}
      </Section>

      {/* ── still open ───────────────────────────────────────────────────── */}
      <Section tone="tide" mark={MARK.question} label="Still open" count={raised.length + gaps.length + threadCount}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ReadControl {...readProps} />
          {raised.length + gaps.length === 0 && (
            <Muted>Nothing raised here yet. A question you name in talk as unsettled is offered back to you, and reading the canvas adds anything on it that pulls two ways.</Muted>
          )}
          {raised.map((k) => (
            <Question
              key={k.id}
              text={k.text}
              tags={[k.quote ? 'raised in talk' : 'written in', pieceTitle(k.node_id) ? `about “${pieceTitle(k.node_id)}”` : 'whole project', day(k.at)]}
              disabled={disabled}
              onRemove={() => onKept({ action: 'remove', id: k.id })}
              onSettle={(text, why) => onKept({ action: 'settle', id: k.id, text, why })}
            />
          ))}
          {gaps.map((g) => (
            <Tile key={g.id} edge={t.ochre}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ ...canvasType.meta, color: t.ochre }}>From the reading of the canvas</span>
                <p style={{ ...canvasType.body, color: t.textPrimary, margin: 0 }}>{g.text}</p>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {g.where.map((w) => <Chip key={w}>{w}</Chip>)}
                  {!disabled && <button type="button" onClick={() => onDismissGap(g.id)} style={{ ...linkStyle(t.textMuted), marginLeft: 'auto' }}>Not a gap</button>}
                </div>
              </div>
            </Tile>
          ))}
          {!disabled && <AddLine kind="open" onAdd={(text) => onKept({ action: 'add', kind: 'open', text, why: '' })} />}

          {/* the open threads the core concept was locked with, kept apart */}
          {conceptThreads.length > 0 && (
            <div style={{ marginTop: 10, border: `1px dashed ${alpha(t.tide, 0.4)}`, borderRadius: radius.widget, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setThreadsOpen((o) => !o)}
                aria-expanded={threadsOpen}
                className="vision-piece"
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ ...canvasType.label, color: t.textSecondary }}>Open threads</span>
                <span style={{ ...canvasType.meta, color: t.textMuted }}>from the core concept</span>
                {threadCount > 0 && <Chip tone={t.tide}>{threadCount}</Chip>}
                <span style={{ marginLeft: 'auto', display: 'inline-flex', color: t.textMuted, transform: threadsOpen ? 'rotate(180deg)' : undefined, transition: 'transform 160ms ease' }}>{MARK.chevron}</span>
              </button>
              {threadsOpen && (
                <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {conceptThreads.map(({ piece, lines }) => (
                    <div key={piece.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(pieces.length > 1 || changedNote(changes, piece.id, 'open_threads')) && (
                        <span style={{ ...canvasType.meta, color: t.textMuted }}>
                          {[pieces.length > 1 ? piece.title || 'untitled' : '', changedNote(changes, piece.id, 'open_threads') ?? ''].filter(Boolean).join(' · ')}
                        </span>
                      )}
                      {lines.length === 0 && <Muted>Nothing left open in this piece.</Muted>}
                      {lines.map((line) => (
                        <Question
                          key={line}
                          text={line}
                          quiet
                          disabled={disabled}
                          onRemove={() => onConcept({ action: 'remove_thread', node_id: piece.id, text: line })}
                          onSettle={(answer, why) => onConcept({ action: 'settle_thread', node_id: piece.id, text: line, answer, why })}
                        />
                      ))}
                      {!disabled && <AddThread onAdd={(text) => onConcept({ action: 'add_thread', node_id: piece.id, text })} />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      <p style={{ ...canvasType.small, color: t.textMuted, margin: 0, paddingTop: 18, borderTop: `1px solid ${alpha(t.textPrimary, 0.08)}` }}>
        This page is this project only, made from every word on its canvas and its core concept. It does not look at images or listen to recordings{unread.images + unread.recordings > 0 ? ', only at the words you wrote on them' : ''}, and it does not read the writing inside a piece.
      </p>

      <style>{`.vision-piece:hover { background: ${alpha(t.textPrimary, 0.04)}; }`}</style>
    </div>
  )
}

// ── the parts ───────────────────────────────────────────────────────────────

/** The core truth, large: what the page opens on, and what the work rests on. */
function CoreTruth({ piece, value, note, disabled, onSave }: {
  piece: string | null
  value: string
  note: string | null
  disabled: boolean
  onSave: (text: string) => Promise<boolean>
}) {
  const { t } = useTheme()
  return (
    <div
      style={{
        position: 'relative', overflow: 'hidden', borderRadius: radius.card, padding: '26px 28px 22px',
        background: `linear-gradient(140deg, ${alpha(t.violet, 0.18)} 0%, ${alpha(t.violet, 0.05)} 55%, ${alpha(t.violet, 0.02)} 100%)`,
        border: `1px solid ${alpha(t.violet, 0.3)}`,
      }}
    >
      <span aria-hidden style={{ position: 'absolute', right: 18, top: -18, fontFamily: typeRole.display.fontFamily, fontSize: 140, lineHeight: 1, color: alpha(t.violet, 0.12), pointerEvents: 'none' }}>”</span>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: t.violet, display: 'inline-flex' }}>{MARK.star}</span>
          <span style={{ ...canvasType.label, color: t.violet }}>Core truth</span>
          {piece && <span style={{ ...canvasType.meta, color: t.textMuted }}>· {piece}</span>}
          {note && <span style={{ ...canvasType.meta, color: t.textMuted, marginLeft: 'auto' }}>{note}</span>}
        </div>
        <ConceptPartBlock
          look="bare"
          label="Core truth"
          field="core_truth"
          value={value}
          note={note}
          disabled={disabled}
          linkAlign="flex-start"
          onSave={onSave}
          render={(v) => (
            <p style={{ fontFamily: typeRole.display.fontFamily, fontWeight: 600, fontSize: 'clamp(21px, 2.4vw, 27px)', lineHeight: 1.28, letterSpacing: '-0.02em', color: t.textPrimary, margin: 0, textWrap: 'balance' }}>
              {v}
            </p>
          )}
        />
      </div>
    </div>
  )
}

/** One decision on the line through time: a tick, the words, the reason, when. */
function Decision({ line, about, disabled, onRemove }: {
  line: KeptLine
  about: string | null
  disabled: boolean
  onRemove: () => Promise<boolean>
}) {
  const { t } = useTheme()
  const [busy, setBusy] = useState(false)
  return (
    <div style={{ position: 'relative', paddingLeft: 36 }}>
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 14, width: 24, height: 24, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: t.containerBg, border: `1.5px solid ${t.verdant}`, color: t.verdant }}>
        {MARK.check}
      </span>
      <Tile style={{ background: alpha(t.verdant, 0.06), borderColor: alpha(t.verdant, 0.24) }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <p style={{ ...canvasType.words, color: t.textPrimary, margin: 0 }}>{line.text}</p>
          {line.why && <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>Because {line.why.replace(/^because\s+/i, '')}</p>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 2 }}>
            <span style={{ ...canvasType.meta, color: t.textMuted }}>{day(line.at)}</span>
            {about ? <Chip tone={t.tide}>{about}</Chip> : <Chip>whole project</Chip>}
            {!disabled && (
              <button type="button" disabled={busy} onClick={() => { setBusy(true); void onRemove().finally(() => setBusy(false)) }} style={{ ...linkStyle(t.textMuted), marginLeft: 'auto' }}>
                Take it off
              </button>
            )}
          </div>
        </div>
      </Tile>
    </div>
  )
}

/**
 * An open question: a tide question mark, the words, where it came from. It
 * can be answered where it sits, which keeps the answer as a decision, or let
 * go. `quiet`: one of the core concept's own open threads, drawn lighter.
 */
function Question({ text, tags = [], quiet = false, disabled, onRemove, onSettle }: {
  text: string
  tags?: string[]
  quiet?: boolean
  disabled: boolean
  onRemove: () => Promise<boolean>
  onSettle: (text: string, why: string) => Promise<boolean>
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
    <Tile style={quiet ? { background: 'transparent', padding: '11px 14px' } : undefined}>
      <div style={{ display: 'grid', gridTemplateColumns: '24px 1fr', gap: 12, alignItems: 'start' }}>
        <span aria-hidden style={{ width: 24, height: 24, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: quiet ? 'transparent' : t.soft.tide, border: quiet ? `1.5px solid ${alpha(t.tide, 0.5)}` : 'none', color: t.tide }}>
          {MARK.question}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <p style={{ ...(quiet ? canvasType.body : canvasType.words), fontSize: quiet ? 14.5 : undefined, color: t.textPrimary, margin: 0 }}>{text}</p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {tags.filter(Boolean).map((tag) => <span key={tag} style={{ ...canvasType.meta, color: t.textMuted }}>{tag}</span>)}
            {!disabled && !settling && (
              <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 14 }}>
                <button type="button" style={linkStyle(t.textMuted)} onClick={() => setSettling(true)}>It is settled</button>
                <button type="button" style={linkStyle(t.textMuted)} disabled={busy} onClick={() => { setBusy(true); void onRemove().finally(() => setBusy(false)) }}>Take it off</button>
              </span>
            )}
          </div>
          {settling && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, padding: '12px 14px', borderRadius: radius.field, background: alpha(t.verdant, 0.08), border: `1px solid ${alpha(t.verdant, 0.26)}` }}>
              <TextArea bare oneParagraph autoFocus maxHeight={160} ariaLabel="What was decided" placeholder="What did you decide?" value={answer} onChange={setAnswer}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void settle() } }}
                style={{ ...canvasType.body, borderBottom: `1px dashed ${alpha(t.textPrimary, 0.2)}`, padding: '2px 0' }} />
              <TextArea bare oneParagraph maxHeight={160} ariaLabel="Why" placeholder="Why? Only if you want it kept." value={why} onChange={setWhy}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void settle() } }}
                style={{ ...canvasType.small, color: t.textSecondary, borderBottom: `1px dashed ${alpha(t.textPrimary, 0.14)}`, padding: '2px 0' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <SmallButton strong disabled={busy || !answer.trim()} onClick={() => void settle()}>{busy ? <WorkingDots /> : 'Keep it as decided'}</SmallButton>
                <SmallButton onClick={() => setSettling(false)}>Not yet</SmallButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </Tile>
  )
}

function SmallButton({ strong = false, disabled = false, onClick, children }: { strong?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  const { t } = useTheme()
  const on = strong && !disabled
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        ...canvasType.chip, fontSize: 11, padding: '7px 12px', borderRadius: radius.field, border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: on ? t.inverseBg : alpha(t.textPrimary, 0.07), color: on ? t.inverseText : strong ? t.textMuted : t.textSecondary,
      }}>
      {children}
    </button>
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
      <button type="button" onClick={() => setOpen(true)} style={{ ...linkStyle(t.textMuted), alignSelf: 'flex-start' }}>
        {kind === 'decision' ? '+ Write a decision in' : '+ Write a question in'}
      </button>
    )
  }
  return (
    <Tile>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
          <SmallButton strong disabled={busy || !text.trim()} onClick={() => void add()}>{busy ? <WorkingDots /> : 'Keep it'}</SmallButton>
          <SmallButton onClick={() => { setOpen(false); setText(''); setWhy('') }}>Never mind</SmallButton>
        </div>
      </div>
    </Tile>
  )
}
