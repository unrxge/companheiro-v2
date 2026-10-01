'use client'

// Tour visuals, one per slide. Each is a small working copy of the real
// screen, built from the same components and wording (the Check-in circles,
// the Idea Lab's three ways in, the board's columns, the writing assistant's
// Approve / Reject, the Portrait's "Forget this", the Collector's form), so
// that what a new person tries here is what they will find in the app. A
// "Try it" line on top says what to press next. The examples are different
// people making different things. Nothing here reads or writes the database.

import { useEffect, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion as m, useReducedMotion } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { GhostButton, PrimaryButton, QuietButton } from '@/components/ui/buttons'
import { MicButton } from '@/components/ui/mic-button'
import { Pill } from '@/components/ui/pill'
import { PhaseDots, StageRibbon } from '@/components/widgets'
import { useTypewriter } from '@/components/landing/mockups'
import { alpha, columnHue, fonts, radius, shell, type as typeRoles, type BoardColumn, type Hue } from '@/lib/design-tokens'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export interface TourWidgetProps {
  /** True while this widget's slide is the one on screen. */
  active: boolean
  /** Moves the tour on a slide, for a button that leads to the next part of the app. */
  next: () => void
}

/** The line on top of every widget: what to press next, or what just happened. */
function TryIt({ children }: { children: React.ReactNode }) {
  const { t } = useTheme()
  return (
    <div className="flex items-start gap-2.5" style={{ padding: '2px 4px 12px', minHeight: 54 }}>
      <Pill hue="neutral" solid style={{ flexShrink: 0, marginTop: 1 }}>Try it</Pill>
      <p aria-live="polite" style={{ ...typeRoles.small, fontWeight: 500, color: t.textPrimary }}>{children}</p>
    </div>
  )
}

/** Small text button: "start again", "back". */
function TextButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const { t } = useTheme()
  return (
    <button type="button" onClick={onClick} className="cursor-pointer" style={{ ...typeRoles.small, fontWeight: 600, color: t.textSecondary, background: 'none', border: 'none', padding: '8px 0', textDecoration: 'underline', textUnderlineOffset: 3 }}>
      {children}
    </button>
  )
}

/** A page of the app in miniature: the dark shell, its eyebrow and title. */
function Screen({ eyebrow, title, minHeight, children }: { eyebrow: string; title: string; minHeight: number; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: shell.ink2, border: `1px solid ${shell.line}`, borderRadius: radius.card, padding: 16, minHeight }}>
      <p style={{ ...typeRoles.eyebrow, fontSize: 10, color: shell.muted }}>{eyebrow}</p>
      <p style={{ ...typeRoles.h2, fontSize: 19, color: shell.text, marginTop: 4 }}>{title}</p>
      <div style={{ marginTop: 14 }}>{children}</div>
    </div>
  )
}

/** A text field that fills itself in. Not an input: nothing here opens a keyboard. */
function FakeField({ text, placeholder, typing, minHeight = 44, onShell = false }: { text: string; placeholder: string; typing: boolean; minHeight?: number; onShell?: boolean }) {
  const { t } = useTheme()
  return (
    <div
      style={{
        ...typeRoles.ui, fontSize: 14, minHeight, padding: '10px 12px', borderRadius: radius.field,
        backgroundColor: onShell ? '#1c1916' : t.inputBg,
        border: `1px solid ${onShell ? '#352f29' : t.inputBorder}`,
        color: text ? (onShell ? shell.text : t.textPrimary) : onShell ? shell.muted : t.textMuted,
      }}
    >
      {text || placeholder}
      {typing && <span style={{ display: 'inline-block', width: 1.5, height: '1em', marginLeft: 2, verticalAlign: '-0.15em', backgroundColor: onShell ? shell.text : t.textPrimary }} />}
    </div>
  )
}

// ── Check in: Voice or Type, Send, and it answers ───────────────────────────

const CHECKIN_SAID = 'I finished the demo last night and I can’t tell if it’s any good. I keep opening it and closing it again.'
const CHECKIN_REPLY = 'You finished it. That part is done. When you open it, what are you listening for?'

function ModeCircle({ label, pulse, onClick, children }: { label: string; pulse: boolean; onClick: () => void; children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <m.button type="button" onClick={onClick} aria-label={label === 'Voice' ? 'Check in by voice' : 'Check in by typing'} whileTap={{ scale: 0.94 }} className="cursor-pointer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'none', border: 'none' }}>
      <m.div
        animate={pulse && !reduce ? { boxShadow: [`0 0 0 0px ${alpha(shell.text, 0.22)}`, `0 0 0 10px ${alpha(shell.text, 0)}`] } : { boxShadow: `0 0 0 0px ${alpha(shell.text, 0)}` }}
        transition={pulse && !reduce ? { duration: 1.8, repeat: Infinity, ease: 'easeOut' } : { duration: 0.2 }}
        style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#1c1916', border: '1.5px solid #352f29', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </m.div>
      <span style={{ ...typeRoles.small, fontSize: 12, color: shell.muted, letterSpacing: '0.04em' }}>{label}</span>
    </m.button>
  )
}

export function CheckInWidget({ active, next }: TourWidgetProps) {
  const { t } = useTheme()
  const [mode, setMode] = useState<'voice' | 'type' | null>(null)
  const [sent, setSent] = useState(false)
  const said = useTypewriter(CHECKIN_SAID, mode !== null, 24)
  const reply = useTypewriter(CHECKIN_REPLY, sent, 20)
  const restart = () => { setMode(null); setSent(false) }

  return (
    <Container padding={12}>
      <TryIt>
        {mode === null ? 'Tap Voice or Type to begin.'
          : !said.done ? (mode === 'voice' ? 'You talk, it writes down what you say.' : 'Write it the way you’d say it. There’s no right way.')
          : !sent ? 'When you’ve said enough, press Send.'
          : !reply.done ? 'It reads what you said and answers.'
          : 'If there’s an idea in what you said, one tap takes it to the Idea Lab.'}
      </TryIt>
      <Screen eyebrow="Companheiro · Morning" title="Check-in" minHeight={292}>
        {mode === null ? (
          <div className="flex items-center justify-center gap-9" style={{ padding: '34px 0 30px' }}>
            <ModeCircle label="Voice" pulse={active} onClick={() => setMode('voice')}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#aaa59c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </ModeCircle>
            <ModeCircle label="Type" pulse={false} onClick={() => setMode('type')}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#aaa59c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
              </svg>
            </ModeCircle>
          </div>
        ) : !sent ? (
          <div className="flex flex-col items-center gap-3">
            {mode === 'voice' && (
              <>
                <MicButton recording={!said.done} onToggle={() => {}} size={52} onShell />
                <p style={{ ...typeRoles.eyebrow, fontSize: 10, color: shell.muted, minHeight: 12 }}>{said.done ? '' : 'Recording'}</p>
              </>
            )}
            <div className="w-full" aria-label={CHECKIN_SAID}>
              <FakeField onShell text={said.shown} placeholder={mode === 'voice' ? 'Your words will appear here…' : 'Begin typing…'} typing={!said.done} minHeight={mode === 'voice' ? 88 : 110} />
            </div>
            <m.div className="w-full" initial={false} animate={{ opacity: said.done ? 1 : 0 }} style={{ pointerEvents: said.done ? 'auto' : 'none' }}>
              <PrimaryButton full onClick={() => setSent(true)} disabled={!said.done}>Send</PrimaryButton>
            </m.div>
          </div>
        ) : (
          <Card padding={14}>
            <p style={{ ...typeRoles.ui, fontSize: 14, fontWeight: 500, color: t.textPrimary }}>{CHECKIN_SAID}</p>
            <p aria-label={CHECKIN_REPLY} style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary, marginTop: 12, minHeight: '3.1em' }}>
              <span aria-hidden>{reply.shown}</span>
            </p>
            <m.div initial={false} animate={{ opacity: reply.done ? 1 : 0, y: reply.done ? 0 : 6 }} transition={{ duration: 0.4, ease: EASE }} className="flex flex-wrap items-center gap-x-4" style={{ marginTop: 10, pointerEvents: reply.done ? 'auto' : 'none' }}>
              <QuietButton size="sm" onClick={next}>Take it to the Lab →</QuietButton>
              <TextButton onClick={restart}>Start again</TextButton>
            </m.div>
          </Card>
        )}
      </Screen>
    </Container>
  )
}

// ── Idea Lab: three ways in, a few questions, one clear sentence out ────────

const PHASES = ['First Contact', 'Expansion', 'The Audience', 'The Principle', 'Declaration']
const WAYS_IN = [
  { key: 'bring', eyebrow: 'I have one', title: 'Bring an idea', body: 'Something you’ve been carrying.' },
  { key: 'several', eyebrow: 'I have a few', title: 'Bring several things', body: 'See whether they share something.' },
  { key: 'summon', eyebrow: 'I need one', title: 'Summon an idea', body: 'Get a question to start from.' },
] as const
type IdeaStage = 'choose' | (typeof WAYS_IN)[number]['key'] | 'talk'

const IDEA_TEXT = 'I keep painting my grandmother’s kitchen from memory. I don’t know why it matters. I just can’t stop.'
const IDEA_ASK = 'When you paint it, what’s the one thing you never leave out?'
const IDEA_ANSWER = 'The light over the table. It’s always late afternoon.'
const OTHER_WAYS: Record<'several' | 'summon', string> = {
  several: 'Add a few things that feel unrelated: a draft, a lyric, a note, a photo idea. It reads them together and tells you what they seem to share.',
  summon: 'Pick a movement, a territory and how much energy you have. It gives you one question to start from, drawn from your own themes.',
}

export function IdeaLabWidget({ active, next }: TourWidgetProps) {
  const { t } = useTheme()
  const [stage, setStage] = useState<IdeaStage>('choose')
  const [answered, setAnswered] = useState(false)
  const [named, setNamed] = useState(false)
  const idea = useTypewriter(IDEA_TEXT, stage === 'bring', 20)
  const ask = useTypewriter(IDEA_ASK, stage === 'talk', 18)
  const back = () => { setStage('choose'); setAnswered(false); setNamed(false) }

  // After the answer is sent, the concept takes a moment to arrive.
  useEffect(() => {
    if (!answered) return
    const id = window.setTimeout(() => setNamed(true), 1100)
    return () => window.clearTimeout(id)
  }, [answered])

  return (
    <Container padding={12}>
      <TryIt>
        {stage === 'choose' ? 'Choose how you’re starting. Try “Bring an idea”.'
          : stage === 'bring' ? (idea.done ? 'Now press “Talk it through”.' : 'Describe it roughly. It doesn’t need to be clear yet.')
          : stage === 'talk' ? (!ask.done ? 'It asks one question at a time.' : !answered ? 'Answer in your own words, then Send.' : !named ? 'A few questions later…' : 'You finish with a core concept. It becomes a project on your board.')
          : 'Another way in. Go back to try “Bring an idea”.'}
      </TryIt>
      <Screen eyebrow="Companheiro" title="Idea Lab" minHeight={292}>
        {stage === 'choose' ? (
          <div className="flex flex-col gap-2">
            <p style={{ ...typeRoles.small, color: shell.muted, marginBottom: 2 }}>Where are you starting from?</p>
            {WAYS_IN.map((o, i) => (
              <m.button
                key={o.key}
                type="button"
                onClick={() => setStage(o.key)}
                whileTap={{ scale: 0.99 }}
                className="cursor-pointer"
                style={{ textAlign: 'left', backgroundColor: t.cardBg, border: 'none', borderRadius: radius.widget, padding: '10px 14px', boxShadow: active && i === 0 ? `0 0 0 2px ${t.ember}` : 'none' }}
              >
                <span style={{ ...typeRoles.eyebrow, fontSize: 10, color: t.ember, display: 'block' }}>{o.eyebrow}</span>
                <span style={{ ...typeRoles.h3, color: t.textPrimary, display: 'block', marginTop: 3 }}>{o.title} →</span>
                <span style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, display: 'block' }}>{o.body}</span>
              </m.button>
            ))}
          </div>
        ) : stage === 'bring' ? (
          <Card padding={14}>
            <div className="flex items-start justify-between gap-3">
              <Eyebrow style={{ color: t.ember }}>Bring an idea</Eyebrow>
              <GhostButton size="sm" onClick={back}>Back</GhostButton>
            </div>
            <div style={{ marginTop: 10 }} aria-label={IDEA_TEXT}>
              <FakeField text={idea.shown} placeholder="Write freely…" typing={!idea.done} minHeight={92} />
            </div>
            <div className="flex items-center gap-2.5" style={{ marginTop: 10 }}>
              <MicButton recording={false} onToggle={() => {}} size={40} />
              <div className="flex-1">
                <PrimaryButton full onClick={() => setStage('talk')} disabled={!idea.done}>Talk it through →</PrimaryButton>
              </div>
            </div>
          </Card>
        ) : stage === 'talk' ? (
          <Card padding={14}>
            <PhaseDots phase={named ? 5 : answered ? 3 : 2} labels={PHASES} />
            {!named ? (
              <>
                <p aria-label={IDEA_ASK} style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary, marginTop: 14, minHeight: '3.1em' }}>
                  <span aria-hidden>{ask.shown}</span>
                </p>
                {answered ? (
                  <p style={{ ...typeRoles.ui, fontSize: 14, fontWeight: 500, color: t.textPrimary, textAlign: 'right', marginTop: 10 }}>{IDEA_ANSWER}</p>
                ) : (
                  <m.div initial={false} animate={{ opacity: ask.done ? 1 : 0 }} className="flex items-end gap-2" style={{ marginTop: 10, pointerEvents: ask.done ? 'auto' : 'none' }}>
                    <div className="flex-1"><FakeField text={IDEA_ANSWER} placeholder="" typing={false} /></div>
                    <QuietButton onClick={() => setAnswered(true)} disabled={!ask.done}>Send</QuietButton>
                  </m.div>
                )}
              </>
            ) : (
              <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }} style={{ marginTop: 14 }}>
                <Card inner padding={12} style={{ borderLeft: `3px solid ${t.ember}` }}>
                  <Pill hue="ember">Core concept</Pill>
                  <p style={{ ...typeRoles.h3, fontSize: 16, color: t.textPrimary, marginTop: 8 }}>Late Afternoon</p>
                  <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary, marginTop: 2 }}>Paintings of the rooms we keep going back to, and their light.</p>
                </Card>
                <div className="flex flex-wrap items-center gap-x-4" style={{ marginTop: 10 }}>
                  <QuietButton size="sm" onClick={next}>See it on the board →</QuietButton>
                  <TextButton onClick={back}>Start again</TextButton>
                </div>
              </m.div>
            )}
          </Card>
        ) : (
          <Card padding={14}>
            <div className="flex items-start justify-between gap-3">
              <Eyebrow style={{ color: t.ember }}>{WAYS_IN.find((w) => w.key === stage)?.title}</Eyebrow>
              <GhostButton size="sm" onClick={back}>Back</GhostButton>
            </div>
            <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary, marginTop: 10 }}>{OTHER_WAYS[stage]}</p>
            <p style={{ ...typeRoles.small, color: t.textMuted, marginTop: 10 }}>Whichever you choose, you end with a core concept.</p>
          </Card>
        )}
      </Screen>
    </Container>
  )
}

// ── Project Board: Queue, Active, Completed ─────────────────────────────────

const COLUMNS: { key: BoardColumn; label: string }[] = [
  { key: 'queue', label: 'Queue' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
]
const PROJECTS = [
  { id: 'afternoon', title: 'Late Afternoon', medium: 'Painting series' },
  { id: 'tide', title: 'Low Tide', medium: 'Song' },
  { id: 'bus', title: 'Night Bus', medium: 'Short film' },
]
const BOARD_START: Record<string, number> = { afternoon: 0, tide: 0, bus: 0 }

export function BoardWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const [place, setPlace] = useState(BOARD_START)
  const [touched, setTouched] = useState(false)

  // One project moves into Active on its own, to show that they move.
  useEffect(() => {
    if (!active || touched) return
    const id = window.setTimeout(() => setPlace((p) => (p.tide === 0 ? { ...p, tide: 1 } : p)), 1100)
    return () => window.clearTimeout(id)
  }, [active, touched])

  const advance = (id: string) => {
    setTouched(true)
    setPlace((p) => ({ ...p, [id]: (p[id] + 1) % COLUMNS.length }))
  }
  const inMotion = PROJECTS.filter((p) => place[p.id] === 1).length

  return (
    <Container padding={12}>
      <TryIt>
        {!touched ? 'Tap a project to move it to the next column.' : inMotion === 0 ? 'Nothing active right now. That’s allowed.' : inMotion === 1 ? 'One project active. The others wait in the Queue until you’re ready.' : `${inMotion} projects active. Tap one again to mark it Completed.`}
      </TryIt>
      <LayoutGroup>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, minHeight: 252 }}>
          {COLUMNS.map((col, ci) => {
            const hue: Hue = columnHue[col.key]
            const here = PROJECTS.filter((p) => place[p.id] === ci)
            return (
              <div key={col.key} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                <div className="flex items-center gap-1.5" style={{ padding: '6px 4px 2px' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: t[hue], flexShrink: 0 }} />
                  <span style={{ fontFamily: fonts.ui, fontSize: 11, fontWeight: 600, color: t.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.label}</span>
                  <span style={{ fontFamily: fonts.ui, fontSize: 11, color: t.textMuted, marginLeft: 'auto' }}>{here.length}</span>
                </div>
                {here.map((p) => (
                  <m.button
                    key={p.id}
                    layout
                    layoutId={`tour-board-${p.id}`}
                    type="button"
                    onClick={() => advance(p.id)}
                    aria-label={`${p.title}, ${col.label}. Move to ${COLUMNS[(ci + 1) % COLUMNS.length].label}`}
                    transition={{ type: 'spring', stiffness: 260, damping: 28 }}
                    whileTap={{ scale: 0.97 }}
                    className="cursor-pointer"
                    style={{ textAlign: 'left', border: 'none', backgroundColor: t.cardBg, boxShadow: t.shadow, borderRadius: radius.widget, padding: '10px 10px 12px', borderTop: `2px solid ${t[hue]}`, minWidth: 0 }}
                  >
                    <span style={{ display: 'block', fontFamily: fonts.ui, fontSize: 10, fontWeight: 600, color: t.textMuted }}>{p.medium}</span>
                    <span style={{ display: 'block', fontFamily: fonts.ui, fontSize: 13, fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.01em', color: t.textPrimary, marginTop: 3 }}>{p.title}</span>
                  </m.button>
                ))}
              </div>
            )
          })}
        </div>
      </LayoutGroup>
    </Container>
  )
}

// ── Writing: select a line, ask, approve or reject ──────────────────────────

const VERSE = [
  { text: 'We left the porch light on all summer.', ask: 'This line already shows something. Who was the light left on for?', rewrite: 'We left the porch light on for no one.' },
  { text: 'I felt so sad when you were gone.', ask: 'This line names the feeling. The other two show it. What did the house look like that week?', rewrite: 'Your cup stayed on the rail till August.' },
  { text: 'The tide kept coming anyway.', ask: '“Anyway” is carrying the whole verse. What if the line ended one word sooner?', rewrite: 'The tide kept coming.' },
]
type LineState = 'asked' | 'suggested' | 'approved' | 'rejected'

export function WritingWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const [lines, setLines] = useState(() => VERSE.map((v) => v.text))
  const [sel, setSel] = useState<number | null>(null)
  const [state, setState] = useState<LineState>('asked')
  const ask = useTypewriter(sel !== null ? VERSE[sel].ask : '', sel !== null, 16)

  const select = (i: number) => { setSel(i); setState('asked') }
  const approve = () => {
    if (sel === null) return
    setLines((l) => l.map((x, i) => (i === sel ? VERSE[sel].rewrite : x)))
    setState('approved')
  }

  return (
    <Container padding={12}>
      <TryIt>
        {sel === null ? 'Tap the line you’re least sure about.'
          : state === 'asked' ? (ask.done ? 'Answer it yourself, or ask for a suggested rewrite.' : 'The assistant looks at that line only.')
          : state === 'suggested' ? 'The suggestion is highlighted. It’s only kept if you approve it.'
          : state === 'approved' ? 'Approved. The line is now in your draft. Tap another.'
          : 'Rejected. Your line is untouched. Tap another.'}
      </TryIt>
      <Card padding={14} style={{ minHeight: 300 }}>
        <div className="flex items-baseline justify-between gap-3">
          <p style={{ ...typeRoles.h3, color: t.textPrimary }}>Low Tide <span style={{ fontWeight: 400, color: t.textMuted }}>· Song</span></p>
          <span style={{ fontFamily: fonts.ui, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.ember, whiteSpace: 'nowrap' }}>Write · 2 of 6</span>
        </div>
        <div style={{ marginTop: 8 }}><StageRibbon step="write" compact /></div>

        <Eyebrow style={{ marginTop: 12 }}>Verse 1</Eyebrow>
        <div className="flex flex-col" style={{ marginTop: 4 }}>
          {lines.map((line, i) => {
            const on = sel === i
            const suggested = on && state === 'suggested'
            const hint = sel === null && active && i === 1
            return (
              <button
                key={i}
                type="button"
                onClick={() => select(i)}
                aria-pressed={on}
                className="cursor-pointer"
                style={{
                  ...typeRoles.ui, fontSize: 15, textAlign: 'left', border: 'none', borderRadius: 6, padding: '5px 8px', margin: '0 -8px',
                  color: t.textPrimary,
                  backgroundColor: suggested ? alpha(t.tide, 0.18) : on ? t.soft.tide : hint ? t.cardBgInner : 'transparent',
                  boxShadow: on ? `inset 2px 0 0 ${t.tide}` : 'none',
                  transition: 'background-color 0.25s ease',
                }}
              >
                {suggested ? VERSE[i].rewrite : line}
              </button>
            )
          })}
        </div>
        {state === 'suggested' && (
          <div className="flex items-center gap-2" style={{ marginTop: 8 }}>
            <span style={{ ...typeRoles.small, fontSize: 12, fontWeight: 600, color: t.tide, flex: 1 }}>Suggested rewrite</span>
            <QuietButton size="sm" onClick={approve}>Approve</QuietButton>
            <GhostButton size="sm" onClick={() => setState('rejected')}>Reject</GhostButton>
          </div>
        )}

        <Card inner padding={12} style={{ marginTop: 10 }}>
          <p style={{ ...typeRoles.small, fontSize: 11, fontWeight: 600, color: t.textMuted }}>Writing assistant</p>
          {sel === null ? (
            <p style={{ ...typeRoles.small, color: t.textMuted, marginTop: 4 }}>Select a line to talk about it. It asks questions and reflects things back, so the words stay yours.</p>
          ) : (
            <>
              <p style={{ ...typeRoles.small, fontStyle: 'italic', color: t.textSecondary, marginTop: 4 }}>
                <span aria-hidden style={{ color: t.tide, fontStyle: 'normal' }}>↳ </span>“{VERSE[sel].text}”
              </p>
              <p style={{ ...typeRoles.small, fontSize: 11, fontWeight: 600, color: t.violet, marginTop: 8 }}>Companheiro</p>
              <p aria-label={VERSE[sel].ask} style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary, minHeight: '3.1em' }}>
                <span aria-hidden>{ask.shown}</span>
              </p>
              {state === 'asked' && (
                <m.div initial={false} animate={{ opacity: ask.done ? 1 : 0 }} style={{ marginTop: 8, pointerEvents: ask.done ? 'auto' : 'none' }}>
                  <GhostButton size="sm" onClick={() => setState('suggested')} disabled={!ask.done}>Suggest a rewrite</GhostButton>
                </m.div>
              )}
            </>
          )}
        </Card>
      </Card>
    </Container>
  )
}

// ── Portrait: what it has noticed, and your say over it ─────────────────────

const NOTICED: { id: string; kind: string; hue: Hue; statement: string; times: number }[] = [
  { id: 'process', kind: 'How you process things', hue: 'tide', statement: 'You think out loud first.', times: 6 },
  { id: 'theme', kind: 'What keeps recurring', hue: 'ochre', statement: 'Home, and leaving it.', times: 9 },
  { id: 'guidance', kind: 'What kind of guidance works', hue: 'verdant', statement: 'Questions help more than advice.', times: 4 },
]

export function PortraitWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const reduce = useReducedMotion()
  const [forgotten, setForgotten] = useState<string[]>([])
  const left = NOTICED.filter((n) => !forgotten.includes(n.id))

  return (
    <Container padding={12}>
      <TryIt>
        {forgotten.length === 0 ? 'Read each note. Press “Forget this” on one that isn’t true of you.' : left.length === 0 ? 'All gone. A note that stops coming up fades on its own, too.' : 'Forgotten. It won’t use that note again.'}
      </TryIt>
      <Card padding="4px 18px" style={{ minHeight: 284 }}>
        <AnimatePresence>
          {left.map((n, i) => (
            <m.div
              key={n.id}
              initial={reduce ? false : { opacity: 0, x: 14 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.5, delay: active && forgotten.length === 0 ? 0.25 + i * 0.22 : 0, ease: EASE }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{ padding: '12px 0', borderBottom: i < left.length - 1 ? `1px solid ${t.divider}` : 'none' }}>
                <div className="flex items-center gap-2">
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: t[n.hue], flexShrink: 0 }} />
                  <span style={{ ...typeRoles.small, fontSize: 11, fontWeight: 600, color: t.textMuted }}>{n.kind}</span>
                </div>
                <p style={{ ...typeRoles.ui, fontWeight: 500, color: t.textPrimary, marginTop: 4 }}>{n.statement}</p>
                <div className="flex items-center justify-between gap-3" style={{ marginTop: 4 }}>
                  <span style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted }}>Came up {n.times} times</span>
                  <GhostButton size="sm" onClick={() => setForgotten([...forgotten, n.id])}>Forget this</GhostButton>
                </div>
              </div>
            </m.div>
          ))}
        </AnimatePresence>
        {left.length === 0 && (
          <div style={{ padding: '14px 0' }}>
            <p style={{ ...typeRoles.ui, color: t.textSecondary }}>Nothing kept. It only holds what you let it.</p>
            <TextButton onClick={() => setForgotten([])}>Bring them back</TextButton>
          </div>
        )}
      </Card>
    </Container>
  )
}

// ── Capture: save someone else's work that moved you ────────────────────────

const FINDS = [
  {
    source: 'Instagram',
    url: 'instagram.com/reel/…',
    note: 'A potter filming only her hands at the wheel. No music, no talking.',
    analysis: 'A process reel with nothing added. What caught you: the work shown plainly, without explaining itself.',
    movement: 'Beginning' as const,
    hue: 'verdant' as Hue,
  },
  {
    source: 'YouTube',
    url: 'youtube.com/watch?v=…',
    note: 'This live session. He stops the song halfway, laughs, and starts again.',
    analysis: 'A live recording that keeps its mistake. What caught you: the restart left in, and how it changes the second take.',
    movement: 'Breakaway' as const,
    hue: 'ember' as Hue,
  },
  {
    source: 'Vimeo',
    url: 'vimeo.com/…',
    note: 'A short film shot in one room, with one window, over one year.',
    analysis: 'A film built on a single limit. What caught you: how much a small, fixed frame can hold.',
    movement: 'Integration' as const,
    hue: 'ochre' as Hue,
  },
]

export function CaptureWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const [n, setN] = useState(0)
  const [captured, setCaptured] = useState(false)
  const find = FINDS[n % FINDS.length]
  const note = useTypewriter(find.note, active && !captured, 20)

  return (
    <Container padding={12}>
      <TryIt>
        {captured ? 'Saved to your capture bank. Find it in the Idea Lab when you need a spark.' : note.done ? 'Press Capture to save it.' : `Paste the link from ${find.source}, and say what caught your eye.`}
      </TryIt>
      {captured ? (
        <m.div key={`done-${n}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE }} className="flex flex-col gap-2.5" style={{ minHeight: 280 }}>
          <Eyebrow style={{ paddingLeft: 4 }}>Captured</Eyebrow>
          <Card padding={16}>
            <p style={{ ...typeRoles.quote, fontSize: 16, color: t.textPrimary }}>{find.note}</p>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.divider}` }}>
              <Eyebrow style={{ marginBottom: 6 }}>Analysis</Eyebrow>
              <p style={{ ...typeRoles.small, color: t.textSecondary }}>{find.analysis}</p>
            </div>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              <Pill hue={find.hue} dot>{find.movement}</Pill>
              <Pill hue="neutral">{find.source}</Pill>
            </div>
          </Card>
          <PrimaryButton full onClick={() => { setCaptured(false); setN(n + 1) }}>Capture another</PrimaryButton>
        </m.div>
      ) : (
        <Card padding={16} style={{ minHeight: 280 }}>
          <Eyebrow>Capture</Eyebrow>
          <div className="flex flex-col gap-2.5" style={{ marginTop: 12 }}>
            <div aria-label={find.note}>
              <FakeField text={note.shown} placeholder="What caught your eye?" typing={!note.done} minHeight={86} />
            </div>
            <div className="flex items-center gap-2" style={{ ...typeRoles.ui, fontSize: 14, minHeight: 44, padding: '0 12px', borderRadius: radius.field, backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, color: t.textPrimary }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
              </svg>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{find.url}</span>
            </div>
            <PrimaryButton full onClick={() => setCaptured(true)} disabled={!note.done}>Capture</PrimaryButton>
          </div>
        </Card>
      )}
    </Container>
  )
}
