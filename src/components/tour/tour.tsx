'use client'

// A new account's first screen, full page. Two short steps ask who is here
// (a name, a date of birth), what their practice looks like and what their
// work keeps returning to. Then the tour: the four parts of the app that fit
// what they said, each described in their own terms (copy.ts), and a fifth
// slide that names the rest and asks whether they are ready. Only the tour's
// slides are numbered, Skip is only offered once the two steps are answered,
// and Back from the first slide returns to them. Opened again from Settings,
// it is the tour alone.
//
// The carousel is a native scroll-snap track, so a swipe on a phone is the
// browser's own; the buttons, dots and arrow keys scroll the same track.
// Each slide's visual (widgets.tsx) starts when its slide arrives. The shell
// mood follows the slide and stays in the cool hues (tide, violet, verdant):
// ember is what the landing page and sign-in look like, and this is inside.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { Atmosphere } from '@/components/shell/atmosphere'
import { Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { PrimaryButton } from '@/components/ui/buttons'
import { TextField } from '@/components/ui/field'
import { Pill } from '@/components/ui/pill'
import { fonts, radius, shell, tokensFor, type as typeRoles, type Hue } from '@/lib/design-tokens'
import { ageFrom, GENERAL_QUESTIONS, MAX_PRACTICES, MAX_THEMES, MIN_AGE, PRACTICES, THEME_HUES, type Practice, type TourProfile } from '@/lib/tour'
import { tourCopy } from './copy'
import { slidesFor, type TourSlide } from './slides'

const hues = tokensFor('dark')
const FADE = 'linear-gradient(to bottom, #000 calc(100% - 28px), transparent 100%)'
const TITLE: React.CSSProperties = { ...typeRoles.display, margin: undefined, fontSize: 'clamp(27px, 3.6vw, 44px)', color: shell.text, textWrap: 'balance' as never }
const LEDE = 'mt-4 max-w-[46ch] text-[15px] leading-[1.65] lg:mt-3 lg:text-[17px] lg:leading-[1.55]'
const LEDE_STYLE: React.CSSProperties = { ...typeRoles.ui, margin: undefined, lineHeight: undefined, fontSize: undefined, color: shell.muted }

/** Starting points for the themes question; tapping one adds it. */
const THEME_IDEAS = ['Home & belonging', 'Love & distance', 'Grief & repair', 'Faith & doubt', 'Work & worth', 'The body', 'Nature & attention', 'Growing up']
/** One colour per practice, the way each theme has its own in the Idea Lab. */
const PRACTICE_HUES: Hue[] = ['violet', 'tide', 'verdant', 'ochre', 'ember', 'violet']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type Stage = 'who' | 'practice' | 'tour'
interface Born { d: string; m: string; y: string }
interface Work { practices: Practice[]; other: string; themes: string[] }

const pad = (n: string) => n.padStart(2, '0')
const dateOf = (b: Born) => (b.d && b.m && b.y ? `${b.y}-${pad(b.m)}-${pad(b.d)}` : '')

export function Tour({
  firstRun,
  profile: saved,
  leaving = false,
  questions = null,
  onAnswered,
  onLeave,
}: {
  /** A new account: ask before showing round. Null while that is still unknown. */
  firstRun: boolean | null
  /** What they answered before, when the tour is opened again later. */
  profile?: TourProfile | null
  /** Their answers are still being saved as they leave. */
  leaving?: boolean
  /** Questions written for each of their themes; null while they are on their way. */
  questions?: Record<string, string[]> | null
  onAnswered?: (profile: TourProfile, themes: string[]) => void
  onLeave: () => void
}) {
  const [stage, setStage] = useState<Stage | null>(null)
  // Their answers live here, so going back to a question finds it as they left it.
  const [name, setName] = useState('')
  const [born, setBorn] = useState<Born>({ d: '', m: '', y: '' })
  const [work, setWork] = useState<Work>({ practices: [], other: '', themes: [] })
  const [answered, setAnswered] = useState(false)

  useEffect(() => {
    if (firstRun === null || stage !== null) return
    setStage(firstRun ? 'who' : 'tour')
  }, [firstRun, stage])

  // Nothing behind this page may scroll under it.
  useEffect(() => {
    const was = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = was }
  }, [])

  const [slideMood, setSlideMood] = useState<Hue>('violet')
  const mood: Hue = stage === 'tour' ? slideMood : stage === 'practice' ? 'violet' : 'tide'
  const practices = answered ? work.practices : saved?.practices ?? []
  const calledName = answered ? name.trim() : saved?.name ?? ''

  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden" style={{ background: shell.ink, fontFamily: fonts.ui }}>
      <Atmosphere mood={mood} cycle={false} />

      <header className="relative z-[1] mx-auto flex w-full max-w-[520px] shrink-0 items-center justify-between px-5 pb-4 pt-[max(18px,env(safe-area-inset-top))] lg:max-w-[1080px] lg:px-10 lg:pb-2 lg:pt-6">
        <span className="flex items-center gap-2.5" style={{ ...typeRoles.ui, fontWeight: 600, letterSpacing: '-0.01em', color: shell.text }}>
          <img src="/favicon.svg" alt="" width={20} height={20} />
          Companheiro
        </span>
        {/* Only once they have said who they are: before that there is nothing to skip to. */}
        {stage === 'tour' ? (
          <button
            type="button"
            onClick={onLeave}
            disabled={leaving}
            className="cursor-pointer rounded-full px-4 transition-colors hover:bg-[rgba(236,233,226,0.06)]"
            style={{ ...typeRoles.small, fontSize: 14, fontWeight: 500, color: shell.muted, background: 'none', border: 'none', height: 44, marginRight: -16 }}
          >
            {firstRun ? 'Skip' : 'Close'}
          </button>
        ) : <span style={{ height: 44 }} />}
      </header>

      {stage === 'who' && <WhoStep name={name} born={born} onName={setName} onBorn={setBorn} onNext={() => setStage('practice')} />}
      {stage === 'practice' && (
        <PracticeStep
          name={name.trim()}
          work={work}
          onWork={setWork}
          onBack={() => setStage('who')}
          onNext={(themes) => {
            const next = { ...work, other: work.other.trim(), themes }
            setWork(next)
            setAnswered(true)
            onAnswered?.({ name: name.trim(), birthdate: dateOf(born), practices: next.practices, other: next.other }, themes)
            setStage('tour')
          }}
        />
      )}
      {stage === 'tour' && (
        <Carousel
          firstRun={!!firstRun}
          name={calledName}
          practices={practices}
          themes={answered ? work.themes : []}
          questions={questions}
          leaving={leaving}
          onMood={setSlideMood}
          onLeave={onLeave}
          onQuestions={firstRun ? () => setStage('practice') : undefined}
        />
      )}
    </div>
  )
}

// ── The two questions before the tour ───────────────────────────────────────

/** The question on the shell, the answer on paper, one button. Wide enough on a desktop that nothing needs scrolling. */
function Step({ eyebrow, title, lede, children, action }: { eyebrow: string; title: string; lede: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto my-auto flex w-full max-w-[520px] flex-col gap-6 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 lg:max-w-[1080px] lg:gap-7 lg:px-10 lg:pb-10">
        <div>
          <p style={{ ...typeRoles.eyebrow, color: hues.tide }}>{eyebrow}</p>
          <h1 className="mt-3.5" style={TITLE}>{title}</h1>
          <p className={LEDE} style={LEDE_STYLE}>{lede}</p>
        </div>
        {children}
        <div className="lg:ml-auto lg:w-[320px]">{action}</div>
      </div>
    </div>
  )
}

function WhoStep({ name, born, onName, onBorn, onNext }: { name: string; born: Born; onName: (v: string) => void; onBorn: (b: Born) => void; onNext: () => void }) {
  const { t } = useTheme()
  const date = dateOf(born)
  const age = date ? ageFrom(date) : NaN
  const unreal = !!date && Number.isNaN(age)
  const tooYoung = age < MIN_AGE
  const ready = name.trim().length > 0 && age >= MIN_AGE && age <= 120
  const submit = () => { if (ready) onNext() }
  const thisYear = new Date().getFullYear()
  const select: React.CSSProperties = { ...typeRoles.ui, height: 46, minWidth: 0, backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: radius.field, padding: '0 10px', color: t.textPrimary, outline: 'none' }
  return (
    <Step
      eyebrow="Welcome"
      title="First, who’s here?"
      lede="Two things about you, so Companheiro can speak to you and not to just anyone."
      action={<PrimaryButton size="lg" full onClick={submit} disabled={!ready}>Continue</PrimaryButton>}
    >
      <Container padding={12}>
        <Card padding={20}>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:gap-8">
            <div>
              <Eyebrow style={{ marginBottom: 8 }}>Your first name</Eyebrow>
              <TextField value={name} onChange={(v) => onName(v.slice(0, 60))} ariaLabel="Your first name" autoComplete="given-name" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
            </div>
            <div>
              <Eyebrow style={{ marginBottom: 8 }}>Your date of birth</Eyebrow>
              {/* Three lists: a wheel to roll on a phone, a short menu on a desktop. */}
              <div className="grid grid-cols-[0.8fr_1.5fr_1fr] gap-2">
                <select aria-label="Day of birth" autoComplete="bday-day" value={born.d} onChange={(e) => onBorn({ ...born, d: e.target.value })} style={select}>
                  <option value="">Day</option>
                  {Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                </select>
                <select aria-label="Month of birth" autoComplete="bday-month" value={born.m} onChange={(e) => onBorn({ ...born, m: e.target.value })} style={select}>
                  <option value="">Month</option>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select aria-label="Year of birth" autoComplete="bday-year" value={born.y} onChange={(e) => onBorn({ ...born, y: e.target.value })} style={select}>
                  <option value="">Year</option>
                  {Array.from({ length: 100 }, (_, i) => <option key={i} value={thisYear - i}>{thisYear - i}</option>)}
                </select>
              </div>
              <p role={tooYoung || unreal ? 'alert' : undefined} style={{ ...typeRoles.small, fontSize: 12, color: tooYoung || unreal ? t.danger : t.textMuted, marginTop: 8 }}>
                {unreal ? 'That date doesn’t exist. Check the day and the month.' : tooYoung ? `Companheiro is for people aged ${MIN_AGE} and over.` : 'Never shown to anyone. It only helps Companheiro fit you.'}
              </p>
            </div>
          </div>
        </Card>
      </Container>
    </Step>
  )
}

function PracticeStep({ name, work, onWork, onBack, onNext }: { name: string; work: Work; onWork: (w: Work) => void; onBack: () => void; onNext: (themes: string[]) => void }) {
  const { t } = useTheme()
  const { practices, other, themes } = work
  const [draft, setDraft] = useState('')
  // Said only when they reach for a fourth.
  const [tooMany, setTooMany] = useState(false)

  const toggle = (p: Practice) => {
    if (practices.includes(p)) { setTooMany(false); onWork({ ...work, practices: practices.filter((x) => x !== p) }); return }
    if (practices.length >= MAX_PRACTICES) { setTooMany(true); return }
    onWork({ ...work, practices: [...practices, p] })
  }
  const withDraft = (list: string[], raw: string) => {
    const label = raw.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (label.length < 2 || list.length >= MAX_THEMES || list.some((x) => x.toLowerCase() === label.toLowerCase())) return list
    return [...list, label]
  }
  const add = (raw: string) => { onWork({ ...work, themes: withDraft(themes, raw) }); setDraft('') }
  // A theme typed but not yet added still counts.
  const chosen = withDraft(themes, draft)
  const full = themes.length >= MAX_THEMES
  const ready = (practices.length > 0 || other.trim().length > 0) && chosen.length > 0

  return (
    <Step
      eyebrow="Your work"
      title={`Good to meet you, ${name}.`}
      lede="Two questions about your work, so we show you the parts of Companheiro that fit it."
      action={
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex h-[46px] w-[48px] shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-[rgba(236,233,226,0.12)]"
            style={{ borderRadius: radius.field, border: `1px solid ${shell.line}`, backgroundColor: shell.fill, color: shell.text }}
          >
            <BackArrow />
          </button>
          <div className="flex-1">
            <PrimaryButton size="lg" full onClick={() => { setDraft(''); onNext(chosen) }} disabled={!ready}>Show me round</PrimaryButton>
          </div>
        </div>
      }
    >
      <Container padding={12}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Card padding={20}>
            <p style={{ ...typeRoles.h3, fontSize: 16, color: t.textPrimary }}>What does your creative practice look like?</p>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 14 }}>
              {PRACTICES.map((p, i) => {
                const on = practices.includes(p.key)
                return (
                  <Pill key={p.key} hue={PRACTICE_HUES[i]} size="md" selected={on} onClick={() => toggle(p.key)} style={{ padding: '9px 15px', fontSize: 13, ...(on ? { color: '#ffffff' } : null) }}>
                    {p.label}
                  </Pill>
                )
              })}
            </div>
            {tooMany && <p role="alert" style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 10 }}>Three at most. Tap one you’ve chosen to swap it.</p>}
            <div style={{ marginTop: 14 }}>
              <TextField value={other} onChange={(v) => onWork({ ...work, other: v.slice(0, 80) })} placeholder="Something else? Say it in your own words." ariaLabel="Another kind of practice" />
            </div>
          </Card>

          <Card padding={20}>
            <p style={{ ...typeRoles.h3, fontSize: 16, color: t.textPrimary }}>What themes does your work keep returning to?</p>
            <p style={{ ...typeRoles.small, color: t.textMuted, marginTop: 2 }}>Up to four. They become the themes in your Idea Lab, and you can change them whenever you like.</p>
            {themes.length > 0 && (
              <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
                {themes.map((th, i) => (
                  <Pill key={th} hue={THEME_HUES[i % THEME_HUES.length]} size="md" selected onClick={() => onWork({ ...work, themes: themes.filter((x) => x !== th) })} style={{ padding: '9px 13px', fontSize: 13, color: '#ffffff' }}>
                    {th} <span aria-hidden style={{ opacity: 0.75 }}>✕</span><span className="sr-only">, remove</span>
                  </Pill>
                ))}
              </div>
            )}
            {!full && (
              <>
                <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
                  <TextField value={draft} onChange={setDraft} placeholder={themes.length ? 'Add another…' : 'For example: fatherhood, slow living'} ariaLabel="A theme" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft) } }} />
                  <button type="button" onClick={() => add(draft)} disabled={draft.trim().length < 2} className="shrink-0 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40" style={{ ...typeRoles.small, fontWeight: 600, height: 46, padding: '0 16px', borderRadius: radius.field, border: `1px solid ${t.inputBorder}`, backgroundColor: t.cardBgInner, color: t.textPrimary }}>
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5" style={{ marginTop: 12 }}>
                  {THEME_IDEAS.filter((idea) => !themes.includes(idea)).map((idea) => (
                    <button key={idea} type="button" onClick={() => add(idea)} className="cursor-pointer" style={{ fontFamily: fonts.ui, fontSize: 12, fontWeight: 600, lineHeight: 1.2, padding: '7px 12px', borderRadius: 999, background: 'none', border: `1px dashed ${t.inputBorder}`, color: t.textSecondary }}>
                      + {idea}
                    </button>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      </Container>
    </Step>
  )
}

function BackArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  )
}

// ── The tour: four parts chosen for them, then the rest by name ─────────────

/** The last slide's visual: what else is inside, and the themes they gave. */
function AlsoInside({ rest, themes }: { rest: TourSlide[]; themes: string[] }) {
  const { t } = useTheme()
  return (
    <Container padding={12}>
      <Card padding="6px 18px">
        {rest.map((s, i) => (
          <div key={s.id} style={{ padding: '11px 0', borderBottom: i < rest.length - 1 ? `1px solid ${t.divider}` : 'none' }}>
            <p style={{ ...typeRoles.h3, color: t.textPrimary }}>{s.where}</p>
            <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 1 }}>{s.short}</p>
          </div>
        ))}
      </Card>
      {themes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-1.5 pb-1 pt-3.5">
          <span style={{ ...typeRoles.small, color: t.textSecondary, marginRight: 2 }}>Your Idea Lab opens with</span>
          {themes.map((th, i) => <Pill key={th} hue={THEME_HUES[i % THEME_HUES.length]}>{th}</Pill>)}
        </div>
      )}
    </Container>
  )
}

function Carousel({
  firstRun, name, practices, themes, questions, leaving, onMood, onLeave, onQuestions,
}: {
  firstRun: boolean
  name: string
  practices: Practice[]
  themes: string[]
  questions: Record<string, string[]> | null
  leaving: boolean
  onMood: (m: Hue) => void
  onLeave: () => void
  /** Back from the first slide, to the questions before the tour. */
  onQuestions?: () => void
}) {
  const reduce = useReducedMotion()
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const { shown, rest } = useMemo(() => slidesFor(practices), [practices])
  // The parts chosen for them, then one more that names the rest.
  const count = shown.length + 1
  const last = index === count - 1
  // How many times each slide has come up: its widget's key, so it plays from the start on every arrival.
  const [runs, setRuns] = useState(() => Array.from({ length: count }, () => 0))
  // Their themes, each with the questions written for it (null until they arrive).
  const own = useMemo(
    () => (themes.length ? themes.map((label) => ({ label, questions: questions ? questions[label] ?? GENERAL_QUESTIONS : null })) : undefined),
    [themes, questions]
  )

  useEffect(() => {
    setRuns((r) => r.map((n, i) => (i === index ? n + 1 : n)))
    onMood(index < shown.length ? shown[index].mood : 'tide')
    // A slide scrolled down on a short phone goes back to its top once it is left, so every arrival starts at the title.
    Array.from(track.current?.children ?? []).forEach((el, i) => { if (i !== index) el.scrollTop = 0 })
  }, [index, shown, onMood])

  const go = useCallback(
    (i: number) => {
      const el = track.current
      if (!el) return
      const to = Math.max(0, Math.min(count - 1, i))
      el.scrollTo({ left: to * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
    },
    [reduce, count]
  )

  const onScroll = () => {
    const el = track.current
    if (!el || !el.clientWidth) return
    const i = Math.round(el.scrollLeft / el.clientWidth)
    if (i !== index) setIndex(i)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1)
      if (e.key === 'ArrowLeft') go(index - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, index])

  const names = [...shown.map((s) => s.where), 'And more']
  const begin = firstRun ? 'Begin' : 'Done'
  const back = index > 0 ? () => go(index - 1) : onQuestions

  return (
    <>
      <div
        ref={track}
        onScroll={onScroll}
        role="group"
        aria-roledescription="carousel"
        aria-label="How Companheiro works"
        className="relative z-[1] flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        // A slide taller than a small phone scrolls inside itself; its lower edge fades out, not cuts off.
        style={{ maskImage: FADE, WebkitMaskImage: FADE }}
      >
        {names.map((where, i) => {
          const s = i < shown.length ? shown[i] : null
          // Said in their terms; the slide's own words are the landing page's.
          const say = s ? tourCopy(s.id, practices, themes) ?? s : null
          return (
            <section
              key={where}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}: ${where}`}
              inert={i !== index}
              className="flex w-full shrink-0 snap-center snap-always flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {/* Auto margins centre it when there is room (tablet, desktop) and, unlike align-content, never push the top out of reach when there is not. */}
              <div className="mx-auto grid w-full max-w-[520px] grid-cols-1 gap-7 px-5 pb-8 pt-3 md:my-auto lg:max-w-[1080px] lg:grid-cols-[1fr_minmax(0,440px)] lg:items-center lg:gap-16 lg:px-10 lg:pb-7 lg:pt-1">
                <div>
                  <p style={{ ...typeRoles.eyebrow, color: hues[s ? s.mood : 'tide'] }}>
                    <span style={{ color: shell.muted }}>{i + 1} of {count} · </span>{where}
                  </p>
                  <h2 className="mt-3.5 lg:mt-2.5" style={TITLE}>{say ? say.title : name ? `That’s the heart of it, ${name}.` : 'That’s the heart of it.'}</h2>
                  <p className={LEDE} style={LEDE_STYLE}>
                    {say ? say.body : 'There’s more inside, and you’ll meet each part when you need it. Nothing here has to be learned first.'}
                  </p>
                  {!s && <p className={LEDE} style={{ ...LEDE_STYLE, color: shell.text }}>Ready to begin?</p>}
                </div>
                <div className="w-full">
                  {s ? <s.Widget key={runs[i]} active={i === index} own={s.id === 'idea' ? own : undefined} /> : <AlsoInside rest={rest} themes={themes} />}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      {/* One row on a phone, so the slide keeps the height: progress on the left, Back and Next on the right. */}
      <footer className="relative z-[1] mx-auto flex w-full max-w-[520px] shrink-0 items-center justify-between gap-3 px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 lg:max-w-[1080px] lg:px-10 lg:pb-8 lg:pt-1">
        <div className="flex items-center gap-1.5">
          {names.map((where, i) => (
            <button
              key={where}
              type="button"
              onClick={() => go(i)}
              aria-label={`${i + 1} of ${count}: ${where}`}
              aria-current={i === index ? 'step' : undefined}
              className={`flex h-11 cursor-pointer items-center transition-[width] duration-300 ${i === index ? 'w-7 lg:w-9' : 'w-4 lg:w-5'}`}
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <span style={{ display: 'block', width: '100%', height: 4, borderRadius: 2, backgroundColor: i === index ? shell.text : i < index ? shell.muted : shell.line, transition: 'background-color 0.3s ease' }} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 lg:gap-2.5">
          {back && (
            <button
              type="button"
              onClick={back}
              aria-label={index > 0 ? 'Back' : 'Back to your answers'}
              className="flex h-[40px] w-[42px] shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-[rgba(236,233,226,0.12)] lg:h-[46px] lg:w-[48px]"
              style={{ borderRadius: radius.field, border: `1px solid ${shell.line}`, backgroundColor: shell.fill, color: shell.text }}
            >
              <BackArrow />
            </button>
          )}
          <div className="lg:hidden">
            <PrimaryButton size="md" onClick={last ? onLeave : () => go(index + 1)} loading={last && leaving} loadingLabel="One moment…" style={{ minWidth: 104 }}>
              {last ? begin : 'Next'}
            </PrimaryButton>
          </div>
          <div className="hidden lg:block lg:w-[240px]">
            <PrimaryButton size="lg" full onClick={last ? onLeave : () => go(index + 1)} loading={last && leaving} loadingLabel="Setting up your Idea Lab…">
              {last ? begin : 'Next'}
            </PrimaryButton>
          </div>
        </div>
      </footer>
    </>
  )
}
