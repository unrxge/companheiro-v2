'use client'

// Tour visuals, one per slide. Each is a small working copy of the real
// screen, built from the same components and wording (the Check-in circles,
// the Idea Lab's theme pills and energy slider, Conceptualise's five phases,
// the board's columns, the Portrait's "Forget this", the Collector's form),
// so that what a new person tries here is what they will find in the app. A
// "Try it" line on top says what to press next. Everything sits on paper:
// no ink panels and no ink buttons inside a widget. Nothing here reads or
// writes the database.

import { useEffect, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion as m, useReducedMotion } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { Container, Card, Divider, Eyebrow } from '@/components/shell/page-shell'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { MicButton } from '@/components/ui/mic-button'
import { Pill } from '@/components/ui/pill'
import { WorkingDots } from '@/components/ui/working'
import { PhaseDots, StageRibbon } from '@/components/widgets'
import { useTypewriter } from '@/components/landing/mockups'
import { alpha, columnHue, fonts, radius, type as typeRoles, type BoardColumn, type Hue } from '@/lib/design-tokens'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export interface TourWidgetProps {
  /** True while this widget's slide is the one on screen. */
  active: boolean
}

/** The line on top of every widget: what to press next, or what just happened. */
function TryIt({ children }: { children: React.ReactNode }) {
  const { t } = useTheme()
  return (
    <div className="flex items-start gap-2.5 px-1 pb-3.5 pt-1 lg:pb-2.5 lg:pt-0.5">
      <Pill hue="ember" style={{ flexShrink: 0, marginTop: 1 }}>Try it</Pill>
      <p aria-live="polite" style={{ ...typeRoles.small, fontWeight: 500, color: t.textPrimary }}>{children}</p>
    </div>
  )
}

/** Small text button: "start again", "watch again". */
function TextButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const { t } = useTheme()
  return (
    <button type="button" onClick={onClick} className="cursor-pointer" style={{ ...typeRoles.small, fontWeight: 600, color: t.textSecondary, background: 'none', border: 'none', padding: '8px 0', textDecoration: 'underline', textUnderlineOffset: 3 }}>
      {children}
    </button>
  )
}

/** The page's own eyebrow and title, at the top of its card. */
function PageTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  const { t } = useTheme()
  return (
    <>
      <Eyebrow style={{ fontSize: 10 }}>{eyebrow}</Eyebrow>
      <p style={{ ...typeRoles.h2, fontSize: 19, color: t.textPrimary, marginTop: 4 }}>{title}</p>
    </>
  )
}

/** A text field that fills itself in. Not an input: nothing here opens a keyboard. */
function FakeField({ text, placeholder, typing, minHeight = 44 }: { text: string; placeholder: string; typing: boolean; minHeight?: number }) {
  const { t } = useTheme()
  return (
    <div style={{ ...typeRoles.ui, fontSize: 14, minHeight, padding: '10px 12px', borderRadius: radius.field, backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, color: text ? t.textPrimary : t.textMuted }}>
      {text || placeholder}
      {typing && <Caret />}
    </div>
  )
}

function Caret() {
  const { t } = useTheme()
  return <span aria-hidden style={{ display: 'inline-block', width: 1.5, height: '1em', marginLeft: 2, verticalAlign: '-0.15em', backgroundColor: t.ember }} />
}

// ── Check-in: Voice or Type, Send, and it answers ───────────────────────────

const CHECKIN_SAID = 'I finished the demo last night and I can’t tell if it’s any good. I keep opening it and closing it again.'
const CHECKIN_REPLY = 'You finished it. That part is done. When you open it, what are you listening for?'

function ModeCircle({ label, pulse, onClick, children }: { label: 'Voice' | 'Type'; pulse: boolean; onClick: () => void; children: React.ReactNode }) {
  const { t } = useTheme()
  const reduce = useReducedMotion()
  return (
    <m.button type="button" onClick={onClick} aria-label={label === 'Voice' ? 'Check in by voice' : 'Check in by typing'} whileTap={{ scale: 0.94 }} className="cursor-pointer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'none', border: 'none', color: t.textSecondary }}>
      <m.div
        animate={pulse && !reduce ? { boxShadow: [`0 0 0 0px ${alpha(t.ember, 0.35)}`, `0 0 0 12px ${alpha(t.ember, 0)}`] } : { boxShadow: `0 0 0 0px ${alpha(t.ember, 0)}` }}
        transition={pulse && !reduce ? { duration: 1.8, repeat: Infinity, ease: 'easeOut' } : { duration: 0.2 }}
        style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: t.inputBg, border: `1.5px solid ${t.inputBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {children}
      </m.div>
      <span style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, letterSpacing: '0.04em' }}>{label}</span>
    </m.button>
  )
}

export function CheckInWidget({ active }: TourWidgetProps) {
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
          : 'It answers what you actually said. Carry on, or leave it there.'}
      </TryIt>
      <Card padding={16} style={{ minHeight: 292 }}>
        <PageTitle eyebrow="Companheiro · Morning" title="Check-in" />
        <div style={{ marginTop: 14 }}>
          {mode === null ? (
            <div className="flex items-center justify-center gap-9" style={{ padding: '30px 0 26px' }}>
              <ModeCircle label="Voice" pulse={active} onClick={() => setMode('voice')}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </ModeCircle>
              <ModeCircle label="Type" pulse={false} onClick={() => setMode('type')}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10" />
                </svg>
              </ModeCircle>
            </div>
          ) : !sent ? (
            <div className="flex flex-col items-center gap-3">
              {mode === 'voice' && (
                <div className="flex items-center gap-3">
                  <MicButton recording={!said.done} onToggle={() => {}} size={44} />
                  <p style={{ ...typeRoles.eyebrow, fontSize: 10, color: t.textMuted, minWidth: 70 }}>{said.done ? '' : 'Recording'}</p>
                </div>
              )}
              <div className="w-full" aria-label={CHECKIN_SAID}>
                <FakeField text={said.shown} placeholder={mode === 'voice' ? 'Your words will appear here…' : 'Begin typing…'} typing={!said.done} minHeight={mode === 'voice' ? 88 : 110} />
              </div>
              <m.div className="w-full" initial={false} animate={{ opacity: said.done ? 1 : 0 }} style={{ pointerEvents: said.done ? 'auto' : 'none' }}>
                <PrimaryButton full onClick={() => setSent(true)} disabled={!said.done}>Send</PrimaryButton>
              </m.div>
            </div>
          ) : (
            <>
              <p style={{ ...typeRoles.ui, fontSize: 14, fontWeight: 500, color: t.textPrimary }}>{CHECKIN_SAID}</p>
              <p aria-label={CHECKIN_REPLY} style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary, marginTop: 12, minHeight: '3.1em' }}>
                <span aria-hidden>{reply.shown}</span>
              </p>
              <m.div initial={false} animate={{ opacity: reply.done ? 1 : 0 }} style={{ marginTop: 6, pointerEvents: reply.done ? 'auto' : 'none' }}>
                <TextButton onClick={restart}>Start again</TextButton>
              </m.div>
            </>
          )}
        </div>
      </Card>
    </Container>
  )
}

// ── Idea Lab: a theme, an energy, and a question to make from ───────────────

const THEMES: { label: string; hue: Hue; questions: string[] }[] = [
  {
    label: 'Creativity & devotion',
    hue: 'ember',
    questions: [
      'What have you been practising in private, waiting for someone to say you’re allowed to call it your life’s work?',
      'If you knew the work would outlive you, what would you start making tomorrow morning?',
      'Which piece have you been saving for the day you’re good enough, and what if that day was today?',
    ],
  },
  {
    label: 'Healthy masculinity',
    hue: 'tide',
    questions: [
      'Who first showed you that strength could be gentle, and where are you already passing that on?',
      'What did you need to hear at fifteen from a man you trusted, and who needs to hear it from you now?',
      'Where in your life does strength look like staying, listening, or saying sorry first?',
    ],
  },
  {
    label: 'Slow living',
    hue: 'verdant',
    questions: [
      'What did you stop rushing on the day your life started to feel like your own?',
      'If nobody were keeping score, which ordinary hour of your week would you turn into a ritual?',
      'What are you finally unhurried enough to notice, and who do you want to show it to?',
    ],
  },
]
/** The question the Conceptualise slide answers. */
const SEED = THEMES[0]

/** The question, arriving a word at a time. */
function Arriving({ text }: { text: string }) {
  const reduce = useReducedMotion()
  return (
    <span aria-label={text}>
      {text.split(' ').map((w, i) => (
        <m.span key={i} aria-hidden initial={reduce ? false : { opacity: 0, y: 6, filter: 'blur(4px)' }} animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 0.5, delay: i * 0.055, ease: EASE }} style={{ display: 'inline-block', whiteSpace: 'pre' }}>
          {w}{' '}
        </m.span>
      ))}
    </span>
  )
}

export function SummonWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const reduce = useReducedMotion()
  // 0 nothing chosen · 1 theme chosen · 2 energy set · 3 summoning · 4 the question
  const [step, setStep] = useState(0)
  const [theme, setTheme] = useState(0)
  const [asked, setAsked] = useState([0, 0, 0])
  const [note, setNote] = useState<'energy' | 'add' | null>(null)

  // Sets itself up the first time: picks the theme, slides the energy up, asks.
  useEffect(() => {
    if (!active || step > 0) return
    if (reduce) { setStep(4); return }
    // Never backwards: a tap on a theme mid-sequence has already moved it on.
    const ids = [800, 1700, 2900].map((ms, i) => window.setTimeout(() => setStep((s) => Math.max(s, i + 1)), ms))
    return () => ids.forEach((id) => window.clearTimeout(id))
    // step is only read to skip a replay; the sequence itself must not restart as it advances
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, reduce])

  // A question takes a moment to arrive.
  useEffect(() => {
    if (step !== 3) return
    const id = window.setTimeout(() => setStep(4), 800)
    return () => window.clearTimeout(id)
  }, [step, theme, asked])

  const pick = (i: number) => { setNote(null); setTheme(i); setStep(3) }
  const again = () => { setNote(null); setAsked((a) => a.map((n, i) => (i === theme ? (n + 1) % THEMES[i].questions.length : n))); setStep(3) }
  const chosen = step >= 1
  const bright = step >= 2
  const current = THEMES[theme]

  return (
    <Container padding={12}>
      <TryIt>
        {note === 'energy' ? 'Energy is set to Bright for this tour. In the app, slide it to match your day.'
          : note === 'add' ? 'In the app, this is where you add a theme of your own.'
          : step < 4 ? 'Watch: a theme, an energy level, then a question.'
          : 'Tap another theme, or “Ask again” for a new question.'}
      </TryIt>
      <Card padding={16}>
        <Eyebrow style={{ marginBottom: 10 }}>Theme</Eyebrow>
        <div className="flex flex-wrap gap-1.5">
          {THEMES.map((th, i) => (
            <Pill key={th.label} hue={th.hue} selected={chosen && theme === i} onClick={() => pick(i)} size="md" style={chosen && theme === i ? { color: '#ffffff' } : undefined}>{th.label}</Pill>
          ))}
          <button type="button" onClick={() => setNote('add')} aria-label="Add a theme" className="cursor-pointer" style={{ fontFamily: fonts.ui, fontSize: 12, fontWeight: 600, lineHeight: 1.2, padding: '6px 13px', borderRadius: 999, background: 'none', border: `1px dashed ${t.inputBorder}`, color: t.textMuted }}>
            + Add theme
          </button>
        </div>

        <Divider style={{ margin: '14px 0' }} />

        <div className="flex items-center justify-between">
          <Eyebrow>Energy</Eyebrow>
          <span className="flex items-center gap-1.5" style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            {bright ? 'Bright' : ' '}
          </span>
        </div>
        <button type="button" onClick={() => setNote('energy')} role="slider" aria-label="Energy" aria-valuemin={0} aria-valuemax={100} aria-valuenow={bright ? 100 : 50} aria-valuetext={bright ? 'Bright' : 'Middle'} aria-disabled className="block w-full" style={{ background: 'none', border: 'none', padding: '14px 9px 8px', cursor: 'not-allowed' }}>
          <span style={{ position: 'relative', display: 'block', height: 4, borderRadius: 999, background: `linear-gradient(to right, ${t.violet}, ${t.ochre} 50%, ${t.verdant})` }}>
            <span style={{ position: 'absolute', top: -7, left: bright ? '100%' : '50%', width: 18, height: 18, marginLeft: -9, borderRadius: '50%', backgroundColor: t.cardBg, border: `2px solid ${t.textPrimary}`, boxShadow: bright ? `0 0 0 5px ${alpha(t.verdant, 0.22)}` : '0 1px 4px rgba(0,0,0,0.28)', transition: reduce ? 'none' : 'left 0.9s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.6s ease 0.5s' }} />
          </span>
        </button>
        <div className="flex justify-between">
          <span style={{ ...typeRoles.small, fontSize: 10, color: t.textMuted }}>Heavy</span>
          <span style={{ ...typeRoles.small, fontSize: 10, color: t.textMuted }}>Bright</span>
        </div>

        <Card inner padding={14} style={{ marginTop: 14, minHeight: 148, borderLeft: `3px solid ${step >= 3 ? t[current.hue] : 'transparent'}`, transition: 'border-color 0.4s ease' }}>
          {step < 3 ? (
            <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textMuted }}>The question is waiting.</p>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <Eyebrow style={{ paddingTop: 6 }}>Your question</Eyebrow>
                <GhostButton size="sm" onClick={again} disabled={step === 3}>Ask again</GhostButton>
              </div>
              <p style={{ ...typeRoles.quote, fontSize: 17, color: t.textPrimary, marginTop: 8 }}>
                {step === 3 ? <WorkingDots color={t[current.hue]} /> : <Arriving key={`${theme}-${asked[theme]}`} text={current.questions[asked[theme]]} />}
              </p>
            </>
          )}
        </Card>
      </Card>
    </Container>
  )
}

// ── Conceptualise: from your answer to a declared concept ───────────────────

const PHASES = ['First Contact', 'Expansion', 'The Audience', 'The Principle', 'Declaration']
const FIRST_REPLY =
  'A book of life lessons for my child. They aren’t even born yet. But for three years I’ve kept a notebook of things I wish someone had told me: how to sit with a bad day without calling it a bad life, how to apologise properly, what to do when the people you love are wrong about you. I mostly write in it after the hard days. I’ve never shown anyone, because it feels arrogant to write advice for someone who doesn’t exist, from someone still getting most of it wrong. But my father never said any of this to me, and I learned it late, and the hard way. If I’m not around on the day they need it, I want them to be able to open it at any page and hear my voice telling them they’re going to be alright.'
const EXCHANGES = [
  { ask: 'You write in it after the hard days. What does a page sound like when you’ve only just learned the lesson yourself?', say: 'Less like advice. More like a letter from someone still in the middle of it.' },
  { ask: 'Picture them opening it. How old are they, and what kind of day has it been?', say: 'Nineteen, maybe. A day when they’re sure they’ve ruined everything.' },
  { ask: 'What will this book never do, even where it would make you sound wiser?', say: 'Pretend I had it figured out. Every lesson comes with the day I learned it.' },
]

export function ConceptualiseWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const reduce = useReducedMotion()
  const [phase, setPhase] = useState(1)
  const [replied, setReplied] = useState(false)
  const [more, setMore] = useState(false)
  const exchange = phase >= 2 && phase <= 4 ? EXCHANGES[phase - 2] : null
  const ask = useTypewriter(exchange?.ask ?? '', active && !!exchange, 18)

  // The answer follows the question on its own; moving to the next phase is the person's call.
  useEffect(() => {
    if (!active || !exchange || !ask.done) return
    const id = window.setTimeout(() => setReplied(true), 700)
    return () => window.clearTimeout(id)
  }, [active, exchange, ask.done])

  const advance = () => { setReplied(false); setPhase((p) => p + 1) }
  const ready = phase === 1 || replied
  const fade = 'linear-gradient(to bottom, #000 35%, transparent 100%)'
  return (
    <Container padding={12}>
      <TryIt>
        {phase === 1 ? 'You answer first, at whatever length you need. Then press Next.'
          : phase < 5 ? (ready ? 'Press Next when you’re ready for the next question.' : 'It asks one question at a time.')
          : 'Declared. This concept becomes a project on your board.'}
      </TryIt>
      <Card padding={16} style={{ minHeight: 330 }}>
        <PhaseDots phase={phase} labels={PHASES} />
        <AnimatePresence mode="wait" initial={false}>
          <m.div key={phase} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }} style={{ marginTop: 14 }}>
            {phase === 1 ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  <Pill hue={SEED.hue}>{SEED.label}</Pill>
                  <Pill hue="verdant">Bright</Pill>
                </div>
                <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary, marginTop: 10 }}>{SEED.questions[0]}</p>
                <div style={more ? { marginTop: 10 } : { marginTop: 10, maxHeight: 112, overflow: 'hidden', maskImage: fade, WebkitMaskImage: fade }}>
                  <p style={{ ...typeRoles.ui, fontSize: 14, fontWeight: 500, color: t.textPrimary }}>{FIRST_REPLY}</p>
                </div>
                <TextButton onClick={() => setMore(!more)}>{more ? 'Show less' : 'Read more'}</TextButton>
              </>
            ) : exchange ? (
              <>
                <p aria-label={exchange.ask} style={{ ...typeRoles.ui, fontSize: 15, color: t.textSecondary, minHeight: '4.7em' }}>
                  <span aria-hidden>{ask.shown}</span>
                </p>
                <m.p initial={false} animate={{ opacity: replied ? 1 : 0, y: replied ? 0 : 6 }} transition={{ duration: 0.4, ease: EASE }} style={{ ...typeRoles.ui, fontSize: 15, fontWeight: 500, color: t.textPrimary, textAlign: 'right', marginTop: 12, marginLeft: '12%', minHeight: '3.2em' }}>
                  {exchange.say}
                </m.p>
              </>
            ) : (
              <>
                <Card inner padding={14} style={{ borderLeft: `3px solid ${t.ember}` }}>
                  <Pill hue="ember">Concept</Pill>
                  <p style={{ ...typeRoles.h3, fontSize: 17, color: t.textPrimary, marginTop: 8 }}>Letters Ahead</p>
                  <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary, marginTop: 4 }}>A book of letters to my future child: one lesson to a page, each told with the day I learned it.</p>
                </Card>
                <TextButton onClick={() => { setMore(false); setPhase(1) }}>Watch again</TextButton>
              </>
            )}
            {phase < 5 && (
              <m.div initial={false} animate={{ opacity: ready ? 1 : 0.35 }} className="flex justify-end" style={{ marginTop: 8 }}>
                <PrimaryButton size="sm" onClick={advance} disabled={!ready}>{phase === 4 ? 'Declare it →' : 'Next →'}</PrimaryButton>
              </m.div>
            )}
          </m.div>
        </AnimatePresence>
      </Card>
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
  { id: 'afternoon', title: 'Letters Ahead', medium: 'Book' },
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
        {!touched ? 'Tap a project to move it to the next column.' : inMotion === 0 ? 'Nothing active right now. That’s allowed.' : 'Active is what you’re on now. Tap it again when it’s finished.'}
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

// ── Writing: select a line and be asked about it ────────────────────────────

// A voiceover for a short film, joined part-way through.
const LINE_BEFORE = '…so I downloaded an app to track her cycle, as if that alone made me a good boyfriend.'
const SCRIPT = [
  { text: 'I used to think her bad week was something to get through.', ask: '“Get through” is how we talk about weather: something that happens to us. Who were you protecting while you waited it out?' },
  { text: 'Then one night she cried over nothing, and I asked what I’d done wrong.', ask: 'You call it nothing, yet you remember it well enough to build a film around it. What was it over?' },
  { text: 'That’s when I learned there are four phases, and how to show up in each one.', ask: 'Here the film turns from one night into a lesson. Did you learn the phases that night, or did you learn that you’d made her tears about you?' },
  { text: 'In the week before, she needs patience, so I give her space.', ask: 'Patience and space aren’t always the same gift. Has she ever told you which of the two she wanted?' },
  { text: 'I’m telling you this so you don’t make the mistakes I made.', ask: 'You sound like someone who has finished learning. Which mistake are you still making?' },
  { text: 'Because being there for her is the most important thing a man can do.', ask: 'Every line before this is about one woman. This one is about all men. What would the last line be if you said it only to her?' },
]
const SHOWN_FIRST = 3

export function WritingWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const [sel, setSel] = useState<number | null>(null)
  const [more, setMore] = useState(false)
  const ask = useTypewriter(sel !== null ? SCRIPT[sel].ask : '', sel !== null, 16)
  const fadeUp = 'linear-gradient(to top, #000 10%, transparent 95%)'
  const shown = more ? SCRIPT : SCRIPT.slice(0, SHOWN_FIRST)

  return (
    <Container padding={12}>
      <TryIt>
        {sel === null ? 'Tap any line of the script.'
          : !ask.done ? 'It reads the line against everything around it.'
          : more ? 'It only asks. Tap another line.' : 'It only asks. Tap another line, or “Read more”.'}
      </TryIt>
      <Card padding={14} style={{ minHeight: 300 }}>
        <div className="flex items-baseline justify-between gap-3">
          <p style={{ ...typeRoles.h3, color: t.textPrimary }}>Four Weeks <span style={{ fontWeight: 400, color: t.textMuted }}>· Short film</span></p>
          <span style={{ fontFamily: fonts.ui, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.ember, whiteSpace: 'nowrap' }}>Write · 2 of 6</span>
        </div>
        <div style={{ marginTop: 8 }}><StageRibbon step="write" compact /></div>

        <p aria-hidden style={{ ...typeRoles.ui, fontSize: 15, color: t.textMuted, marginTop: 10, maskImage: fadeUp, WebkitMaskImage: fadeUp }}>{LINE_BEFORE}</p>
        <div className="flex flex-col gap-0.5" style={{ marginTop: 2 }}>
          {shown.map((line, i) => {
            const on = sel === i
            const hint = sel === null && active && i === 1
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSel(i)}
                aria-pressed={on}
                className="cursor-pointer"
                style={{
                  ...typeRoles.ui, fontSize: 15, textAlign: 'left', border: 'none', borderRadius: 6, padding: '5px 8px', margin: '0 -8px',
                  color: t.textPrimary,
                  backgroundColor: on ? t.soft.tide : hint ? t.cardBgInner : 'transparent',
                  boxShadow: on ? `inset 2px 0 0 ${t.tide}` : 'none',
                  transition: 'background-color 0.25s ease',
                }}
              >
                {line.text}
              </button>
            )
          })}
        </div>
        <TextButton onClick={() => { if (more && sel !== null && sel >= SHOWN_FIRST) setSel(null); setMore(!more) }}>{more ? 'Show less' : 'Read more'}</TextButton>

        <Card inner padding={12} style={{ marginTop: 4 }}>
          {sel === null ? (
            <p style={{ ...typeRoles.small, color: t.textSecondary }}>Select a line to talk about it. It asks questions and reflects things back, so the words stay yours.</p>
          ) : (
            <>
              <p style={{ ...typeRoles.small, fontSize: 11, fontWeight: 600, color: t.violet }}>Companheiro</p>
              <p aria-label={SCRIPT[sel].ask} style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary, minHeight: '4.7em' }}>
                <span aria-hidden>{ask.shown}</span>
              </p>
            </>
          )}
        </Card>
      </Card>
    </Container>
  )
}

// ── Portrait: what it has noticed, and your say over it ─────────────────────

const NOTICED: { id: string; kind: string; hue: Hue; statement: string; times: number }[] = [
  { id: 'process', kind: 'How you process things', hue: 'tide', statement: 'Your clearest ideas arrive mid-sentence, usually right after you say “I don’t know, but…”.', times: 6 },
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
        {forgotten.length === 0 ? 'Read each pattern. Press “Forget this” on one that isn’t true of you.' : left.length === 0 ? 'All gone. A note that stops coming up fades on its own, too.' : 'Forgotten. It’s gone from your portrait.'}
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
    source: 'Vimeo',
    url: 'vimeo.com/…',
    note: 'A short film shot in one room, with one window, over one year.',
    analysis: 'A film built on a single limit. What caught you: how much a small, fixed frame can hold.',
    movement: 'Integration' as const,
    hue: 'ochre' as Hue,
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
    source: 'Instagram',
    url: 'instagram.com/reel/…',
    note: 'A potter filming only her hands at the wheel. No music, no talking.',
    analysis: 'A process reel with nothing added. What caught you: the work shown plainly, without explaining itself.',
    movement: 'Beginning' as const,
    hue: 'verdant' as Hue,
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
