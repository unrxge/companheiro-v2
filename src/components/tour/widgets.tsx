'use client'

// Tour visuals, one per slide. Like the landing mockups, each is built from
// the app's real components (Container, Card, Pill, MicButton, SignalCards,
// PhaseDots) or drawn in their design language, and fed the same sample
// story: "The Good Plates". Each one moves on its own when its slide comes
// up and answers to a tap. Nothing here reads or writes the database.

import { useEffect, useState } from 'react'
import { AnimatePresence, LayoutGroup, motion as m, useReducedMotion } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { MicButton } from '@/components/ui/mic-button'
import { Pill } from '@/components/ui/pill'
import { PhaseDots, SignalCards, type Signals } from '@/components/widgets'
import { useTypewriter } from '@/components/landing/mockups'
import { JOURNEY_LABELS, PIECE_JOURNEY, columnHue, fonts, radius, type as typeRoles, type BoardColumn, type Hue, type JourneyStep } from '@/lib/design-tokens'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

export interface TourWidgetProps {
  /** True while this widget's slide is the one on screen. */
  active: boolean
}

/** The line under a widget, on the container: what to try, or what just happened. */
function Caption({ children }: { children: React.ReactNode }) {
  const { t } = useTheme()
  return <p aria-live="polite" style={{ ...typeRoles.small, color: t.textSecondary, padding: '12px 6px 2px', minHeight: '2.6em' }}>{children}</p>
}

/** Small text button on a card: "start again", "bring them back". */
function TextButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  const { t } = useTheme()
  return (
    <button type="button" onClick={onClick} className="cursor-pointer" style={{ ...typeRoles.small, fontWeight: 600, color: t.textSecondary, background: 'none', border: 'none', padding: '10px 0', textDecoration: 'underline', textUnderlineOffset: 3 }}>
      {children}
    </button>
  )
}

// ── 1. Capture: keep it now, decide later ───────────────────────────────────

const CAPTURES = [
  { kind: 'Note', text: 'My mother kept the good plates for guests who never came.' },
  { kind: 'Link', text: 'A photo essay on cafés in the hour before opening.' },
  { kind: 'Voice memo', text: 'Something about waiting until I’m ready.' },
]

export function CaptureWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const [kept, setKept] = useState(0)
  const current = CAPTURES[kept]
  const { shown, done } = useTypewriter(current?.text ?? '', active && !!current, 22)
  const typing = !!current && !done

  return (
    <Container padding={14}>
      <Card padding={18}>
        <Eyebrow>Capture what&rsquo;s alive</Eyebrow>
        <div
          aria-label={current ? current.text : 'Nothing else for now'}
          style={{ ...typeRoles.ui, fontSize: 14, minHeight: 62, marginTop: 14, padding: '10px 12px', borderRadius: radius.field, backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, color: current ? t.textPrimary : t.textMuted }}
        >
          <span aria-hidden>
            {current ? shown : 'Nothing else for now.'}
            {typing && <span style={{ display: 'inline-block', width: 1.5, height: '1em', marginLeft: 2, verticalAlign: '-0.15em', backgroundColor: t.ember }} />}
          </span>
        </div>
        <div style={{ marginTop: 8 }}>
          <QuietButton full onClick={() => setKept((k) => k + 1)} disabled={!current || typing}>Capture</QuietButton>
        </div>

        <div style={{ marginTop: 14, borderTop: `1px solid ${t.divider}`, minHeight: 132 }}>
          {kept === 0 && <p style={{ ...typeRoles.small, color: t.textMuted, paddingTop: 12 }}>Nothing captured yet.</p>}
          <AnimatePresence initial={false}>
            {CAPTURES.slice(0, kept).map((c, i) => (
              <m.div
                key={c.text}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
                style={{ padding: '9px 0', borderBottom: i > 0 ? `1px solid ${t.divider}` : 'none' }}
              >
                <p style={{ ...typeRoles.small, fontSize: 11, fontWeight: 600, color: t.textMuted }}>{c.kind}</p>
                <p style={{ ...typeRoles.small, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.text}</p>
              </m.div>
            )).reverse()}
          </AnimatePresence>
        </div>
      </Card>
      <Caption>
        {kept === 0 ? 'Press Capture to keep it.' : current ? 'Kept. Here comes another.' : (
          <>Three things kept. Nothing is asked of them yet. <TextButton onClick={() => setKept(0)}>Start again</TextButton></>
        )}
      </Caption>
    </Container>
  )
}

// ── 2. Check in: say it, see what was heard, correct it ─────────────────────

const TALK_WORDS = 'Walked past the café again. The chairs were stacked, waiting. I think it’s the same thing as the plates.'
const HEARD: Signals = { energy: 'medium', inner_weather: 'clear, a bit tender', arc_texture: 'Expansion' }

export function TalkWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const [started, setStarted] = useState(false)
  const [signals, setSignals] = useState<Signals>(HEARD)
  const [corrected, setCorrected] = useState(false)
  const { shown, done } = useTypewriter(TALK_WORDS, started, 24)
  const heard = started && done

  // Starts on its own a moment after the slide arrives; the mic restarts it.
  useEffect(() => {
    if (!active) return
    const id = window.setTimeout(() => setStarted(true), 900)
    return () => window.clearTimeout(id)
  }, [active])

  const toggle = () => {
    setSignals(HEARD)
    setCorrected(false)
    setStarted((s) => !s)
  }

  return (
    <Container padding={14}>
      <Card padding={18}>
        <div className="flex items-center justify-between gap-4">
          <p style={{ ...typeRoles.small, fontWeight: 600, color: t.textMuted }}>{!started ? 'Tap to speak' : heard ? 'Thursday, 08:12' : 'Listening…'}</p>
          <MicButton recording={started && !done} onToggle={toggle} size={44} />
        </div>
        <p aria-label={TALK_WORDS} style={{ ...typeRoles.quote, fontSize: 17, color: t.textPrimary, marginTop: 14, minHeight: '5.9em' }}>
          <span aria-hidden>{started ? shown : ''}</span>
        </p>
        <m.div initial={false} animate={{ opacity: heard ? 1 : 0, y: heard ? 0 : 8 }} transition={{ duration: 0.6, ease: EASE }} style={{ marginTop: 12, minHeight: 68, pointerEvents: heard ? 'auto' : 'none' }} aria-hidden={!heard}>
          <SignalCards signals={signals} onChange={(next) => { setSignals(next); setCorrected(true) }} />
        </m.div>
      </Card>
      <Caption>
        {!heard ? 'It listens first. Nothing to fill in.' : corrected ? 'Corrected. Your word is the one it keeps.' : 'That’s what it heard. Tap any of the three to correct it.'}
      </Caption>
    </Container>
  )
}

// ── 3. Idea Lab: one question at a time, until it has a name ────────────────

const PHASES = ['First Contact', 'Expansion', 'The Audience', 'The Principle', 'Declaration']
const QUESTIONS = [
  {
    phase: 2,
    ask: 'A song, some photographs, an essay. If someone saw them side by side, what would they notice?',
    options: [
      { say: 'That we keep the good things for later.', about: 'what we save for later' },
      { say: 'That objects outlast the people who kept them.', about: 'the things that outlast their keepers' },
    ],
  },
  {
    phase: 3,
    ask: 'And who needs to hear that?',
    options: [
      { say: 'Anyone still waiting to feel ready.', about: 'anyone still waiting to feel ready' },
      { say: 'People who inherited more than they use.', about: 'people who inherited more than they use' },
    ],
  },
]

export function ConceptWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const reduce = useReducedMotion()
  const [answers, setAnswers] = useState<number[]>([])
  const step = answers.length
  const q = QUESTIONS[step]
  const { shown, done } = useTypewriter(q?.ask ?? '', active && !!q, 18)
  const said = (i: number) => QUESTIONS[i].options[answers[i]]

  return (
    <Container padding={14}>
      <Card padding={18} style={{ minHeight: 300 }}>
        <PhaseDots phase={q ? q.phase : 5} labels={PHASES} />
        <AnimatePresence mode="wait" initial={false}>
          {q ? (
            <m.div key={step} initial={reduce ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.35, ease: EASE }}>
              {step > 0 && <p style={{ ...typeRoles.small, fontWeight: 500, color: t.textMuted, marginTop: 16, textAlign: 'right' }}>{said(step - 1).say}</p>}
              <p aria-label={q.ask} style={{ ...typeRoles.ui, color: t.textSecondary, marginTop: 16, minHeight: '4.7em' }}>
                <span aria-hidden>{shown}</span>
              </p>
              <m.div initial={false} animate={{ opacity: done ? 1 : 0, y: done ? 0 : 6 }} transition={{ duration: 0.4, ease: EASE }} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10, pointerEvents: done ? 'auto' : 'none' }}>
                {q.options.map((o, i) => (
                  <button
                    key={o.say}
                    type="button"
                    tabIndex={done ? 0 : -1}
                    onClick={() => setAnswers([...answers, i])}
                    className="cursor-pointer"
                    style={{ ...typeRoles.ui, fontSize: 14, fontWeight: 500, textAlign: 'left', color: t.textPrimary, backgroundColor: t.cardBgInner, border: 'none', borderRadius: radius.widget, padding: '12px 14px' }}
                  >
                    {o.say}
                  </button>
                ))}
              </m.div>
            </m.div>
          ) : (
            <m.div key="vision" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }} style={{ marginTop: 18 }}>
              <Card inner padding={16} style={{ borderLeft: `3px solid ${t.ember}` }}>
                <Pill hue="ember">Core concept</Pill>
                <p style={{ ...typeRoles.h3, fontSize: 17, color: t.textPrimary, marginTop: 10 }}>The Good Plates</p>
                <p style={{ ...typeRoles.ui, color: t.textSecondary, marginTop: 4 }}>
                  A body of work about {said(0).about}, for {said(1).about}.
                </p>
              </Card>
              <TextButton onClick={() => setAnswers([])}>Answer differently</TextButton>
            </m.div>
          )}
        </AnimatePresence>
      </Card>
      <Caption>{q ? 'Pick the answer closest to yours. In the app, you say it in your own words.' : 'Made from your answers, and yours to change.'}</Caption>
    </Container>
  )
}

// ── 4. Project Board: waiting, in motion, finished ──────────────────────────

const COLUMNS: { key: BoardColumn; label: string }[] = [
  { key: 'queue', label: 'Queue' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
]
const PROJECTS = [
  { id: 'plates', title: 'My Mother’s Plates', medium: 'Essay' },
  { id: 'room', title: 'The Room I Never Used', medium: 'Song' },
  { id: 'chairs', title: 'Before Opening', medium: 'Photo series' },
]
const BOARD_START: Record<string, number> = { plates: 0, room: 0, chairs: 0 }

export function BoardWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const [place, setPlace] = useState(BOARD_START)
  const [touched, setTouched] = useState(false)

  // One piece moves into Active on its own, to show that they move.
  useEffect(() => {
    if (!active || touched) return
    const id = window.setTimeout(() => setPlace((p) => (p.plates === 0 ? { ...p, plates: 1 } : p)), 1100)
    return () => window.clearTimeout(id)
  }, [active, touched])

  const advance = (id: string) => {
    setTouched(true)
    setPlace((p) => ({ ...p, [id]: (p[id] + 1) % COLUMNS.length }))
  }
  const inMotion = PROJECTS.filter((p) => place[p.id] === 1).length

  return (
    <Container padding={12}>
      <LayoutGroup>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, minHeight: 268 }}>
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
      <Caption>
        {!touched ? 'Tap a piece to move it along.' : inMotion === 0 ? 'Nothing in motion. Resting counts too.' : inMotion === 1 ? 'One thing in motion. The rest can wait, and none of it is lost.' : `${inMotion} in motion at once. Tap again to move one on.`}
      </Caption>
    </Container>
  )
}

// ── 5. Writing: one page that walks with the piece ──────────────────────────

const STEP_NOTES: Record<JourneyStep, { head: string; body: string; aside?: { who: string; text: string } }> = {
  concept: {
    head: 'The sentence you’d stand behind',
    body: 'It stays at the top of the page, so the piece has something to answer to.',
    aside: { who: 'Core concept', text: 'The plates were never for guests. They were for a version of us that hadn’t arrived.' },
  },
  write: {
    head: 'Section by section',
    body: 'The assistant asks and suggests. Nothing changes on the page unless you accept it.',
    aside: { who: 'Writing assistant', text: 'You name the feeling in this line. What would the audience see if you left it unnamed?' },
  },
  reimagine: {
    head: 'The same piece, another lens',
    body: 'See the piece, or any part of it, a different way. Your draft only changes when you save your own edits.',
  },
  test: {
    head: 'Read cold',
    body: 'Your finished draft, read against what you set out to make.',
    aside: { who: 'A question, never a verdict', text: 'You set out to write about the waiting. The last section is about the loss. Is that the ending you want?' },
  },
  post: {
    head: 'Out, by your own hand',
    body: 'You publish it yourself, wherever it belongs. Nothing is ever posted or sent in your name.',
  },
  reflect: {
    head: 'Before it goes quiet',
    body: 'Say what it opened and what it left open. No views, no likes. It comes back when you start the next idea.',
  },
}

export function WritingWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const reduce = useReducedMotion()
  const [step, setStep] = useState<JourneyStep>('concept')
  const [touched, setTouched] = useState(false)
  const idx = PIECE_JOURNEY.indexOf(step)

  // Walks the six steps on its own until the person takes over.
  useEffect(() => {
    if (!active || touched || reduce) return
    const id = window.setInterval(() => setStep((s) => PIECE_JOURNEY[(PIECE_JOURNEY.indexOf(s) + 1) % PIECE_JOURNEY.length]), 3400)
    return () => window.clearInterval(id)
  }, [active, touched, reduce])

  const note = STEP_NOTES[step]
  return (
    <Container padding={14}>
      <Card padding={18}>
        <p style={{ ...typeRoles.small, fontWeight: 600, color: t.textPrimary }}>
          My Mother&rsquo;s Plates <span style={{ fontWeight: 400, color: t.textMuted }}>· Essay</span>
        </p>

        <div role="tablist" aria-label="Steps of a piece" style={{ display: 'flex', gap: 3, marginTop: 4 }}>
          {PIECE_JOURNEY.map((s, i) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={i === idx}
              aria-label={JOURNEY_LABELS[s]}
              onClick={() => { setTouched(true); setStep(s) }}
              className="cursor-pointer"
              style={{ flex: 1, minWidth: 0, height: 40, display: 'flex', alignItems: 'center', background: 'none', border: 'none', padding: 0 }}
            >
              <span style={{ display: 'block', width: '100%', height: i === idx ? 10 : 7, borderRadius: 3, backgroundColor: i < idx ? t.verdant : i === idx ? t.ember : t.divider, transition: 'background-color 0.3s ease, height 0.2s ease' }} />
            </button>
          ))}
        </div>
        <p style={{ fontFamily: fonts.ui, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.ember }}>
          {JOURNEY_LABELS[step]} <span style={{ color: t.textMuted, fontWeight: 500 }}>· {idx + 1} of {PIECE_JOURNEY.length}</span>
        </p>

        <div style={{ minHeight: 200, marginTop: 12 }}>
          <AnimatePresence mode="wait" initial={false}>
            <m.div key={step} role="tabpanel" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.3, ease: EASE }}>
              <p style={{ ...typeRoles.h3, fontSize: 16, color: t.textPrimary }}>{note.head}</p>
              <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary, marginTop: 4 }}>{note.body}</p>
              {note.aside && (
                <Card inner padding={14} style={{ marginTop: 12 }}>
                  <p style={{ ...typeRoles.small, fontSize: 11, fontWeight: 600, color: step === 'concept' ? t.ember : t.violet }}>{note.aside.who}</p>
                  <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary, marginTop: 4 }}>{note.aside.text}</p>
                </Card>
              )}
            </m.div>
          </AnimatePresence>
        </div>
      </Card>
      <Caption>{touched ? 'Every step is there when you want it. None is required.' : 'Tap a bar to look at any step.'}</Caption>
    </Container>
  )
}

// ── 6. Portrait: what it has noticed, and your say over it ──────────────────

const NOTICED: { id: string; kind: string; hue: Hue; statement: string; times: number }[] = [
  { id: 'process', kind: 'How you process things', hue: 'tide', statement: 'You think out loud first.', times: 6 },
  { id: 'theme', kind: 'What keeps recurring', hue: 'ochre', statement: 'Saving things for later.', times: 9 },
  { id: 'guidance', kind: 'What kind of guidance works', hue: 'verdant', statement: 'Questions help more than advice.', times: 4 },
]

export function PortraitWidget({ active }: TourWidgetProps) {
  const { t } = useTheme()
  const reduce = useReducedMotion()
  const [forgotten, setForgotten] = useState<string[]>([])
  const left = NOTICED.filter((n) => !forgotten.includes(n.id))

  return (
    <Container padding={14}>
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
      <Caption>
        {forgotten.length === 0 ? 'Every line is yours to read, and yours to remove.' : left.length === 0 ? 'Gone. A line that stops coming up fades on its own, too.' : 'Forgotten. It won’t lean on that again.'}
      </Caption>
    </Container>
  )
}
