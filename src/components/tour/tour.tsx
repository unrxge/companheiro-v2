'use client'

// A new account's first screen, full page. Two short steps ask who is here
// (a name, an age), what their practice looks like and what their work keeps
// returning to. Then the tour: the three parts of the app that fit what they
// said, and a last slide that names the rest and asks whether they are ready.
// Only the tour's slides are numbered, and Skip is only offered once the two
// steps are answered. Opened again from Settings, it is the tour alone.
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
import { MAX_PRACTICES, MAX_THEMES, MIN_AGE, PRACTICES, type Practice, type TourProfile } from '@/lib/tour'
import { slidesFor, type TourSlide } from './slides'

const hues = tokensFor('dark')
const FADE = 'linear-gradient(to bottom, #000 calc(100% - 28px), transparent 100%)'
const TITLE: React.CSSProperties = { ...typeRoles.display, margin: undefined, fontSize: 'clamp(27px, 3.6vw, 44px)', color: shell.text, textWrap: 'balance' as never }
const LEDE = 'mt-4 max-w-[46ch] text-[15px] leading-[1.65] lg:mt-3 lg:text-[17px] lg:leading-[1.55]'
const LEDE_STYLE: React.CSSProperties = { ...typeRoles.ui, margin: undefined, lineHeight: undefined, fontSize: undefined, color: shell.muted }

/** Starting points for the themes question; tapping one adds it. */
const THEME_IDEAS = ['Home & belonging', 'Love & distance', 'Grief & repair', 'Faith & doubt', 'Work & worth', 'The body', 'Nature & attention', 'Growing up']

type Stage = 'who' | 'practice' | 'tour'

export function Tour({
  firstRun,
  profile: saved,
  leaving = false,
  onAnswered,
  onLeave,
}: {
  /** A new account: ask before showing round. Null while that is still unknown. */
  firstRun: boolean | null
  /** What they answered before, when the tour is opened again later. */
  profile?: TourProfile | null
  /** Their answers are still being saved as they leave. */
  leaving?: boolean
  onAnswered?: (profile: TourProfile, themes: string[]) => void
  onLeave: () => void
}) {
  const [stage, setStage] = useState<Stage | null>(null)
  const [profile, setProfile] = useState<TourProfile | null>(null)
  const [themes, setThemes] = useState<string[]>([])
  const [name, setName] = useState('')
  const [age, setAge] = useState('')

  useEffect(() => {
    if (firstRun === null || stage !== null) return
    setStage(firstRun ? 'who' : 'tour')
  }, [firstRun, stage])
  const who = profile ?? saved ?? null

  // Nothing behind this page may scroll under it.
  useEffect(() => {
    const was = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = was }
  }, [])

  const [slideMood, setSlideMood] = useState<Hue>('violet')
  const mood: Hue = stage === 'tour' ? slideMood : stage === 'practice' ? 'violet' : 'tide'

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

      {stage === 'who' && <WhoStep name={name} age={age} onName={setName} onAge={setAge} onNext={() => setStage('practice')} />}
      {stage === 'practice' && (
        <PracticeStep
          name={name.trim()}
          onBack={() => setStage('who')}
          onNext={(practices, other, chosen) => {
            const next: TourProfile = { name: name.trim(), age: Number(age), practices, other }
            setProfile(next)
            setThemes(chosen)
            onAnswered?.(next, chosen)
            setStage('tour')
          }}
        />
      )}
      {stage === 'tour' && <Carousel firstRun={!!firstRun} who={who} themes={themes} leaving={leaving} onMood={setSlideMood} onLeave={onLeave} />}
    </div>
  )
}

// ── The two questions before the tour ───────────────────────────────────────

/** One centred column: the question on the shell, the answer on paper, one button. */
function Step({ eyebrow, title, lede, children, action }: { eyebrow: string; title: string; lede: string; children: React.ReactNode; action: React.ReactNode }) {
  return (
    <div className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="mx-auto my-auto flex w-full max-w-[520px] flex-col gap-6 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-2">
        <div>
          <p style={{ ...typeRoles.eyebrow, color: hues.tide }}>{eyebrow}</p>
          <h1 className="mt-3.5" style={TITLE}>{title}</h1>
          <p className={LEDE} style={LEDE_STYLE}>{lede}</p>
        </div>
        {children}
        {action}
      </div>
    </div>
  )
}

function WhoStep({ name, age, onName, onAge, onNext }: { name: string; age: string; onName: (v: string) => void; onAge: (v: string) => void; onNext: () => void }) {
  const { t } = useTheme()
  const years = Number(age)
  const tooYoung = age.length >= 2 && years < MIN_AGE
  const ready = name.trim().length > 0 && age.length > 0 && years >= MIN_AGE && years <= 120
  const submit = () => { if (ready) onNext() }
  return (
    <Step
      eyebrow="Welcome"
      title="First, who’s here?"
      lede="Two things about you, so Companheiro can speak to you and not to just anyone."
      action={<PrimaryButton size="lg" full onClick={submit} disabled={!ready}>Continue</PrimaryButton>}
    >
      <Container padding={12}>
        <Card padding={18}>
          <div className="flex flex-col gap-4">
            <div>
              <Eyebrow style={{ marginBottom: 6 }}>Your first name</Eyebrow>
              <TextField value={name} onChange={(v) => onName(v.slice(0, 60))} ariaLabel="Your first name" autoComplete="given-name" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
            </div>
            <div>
              <Eyebrow style={{ marginBottom: 6 }}>Your age</Eyebrow>
              <TextField value={age} onChange={(v) => onAge(v.replace(/\D/g, '').slice(0, 3))} ariaLabel="Your age" inputMode="numeric" style={{ maxWidth: 120 }} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} />
              <p role={tooYoung ? 'alert' : undefined} style={{ ...typeRoles.small, fontSize: 12, color: tooYoung ? t.danger : t.textMuted, marginTop: 8 }}>
                {tooYoung ? `Companheiro is for people aged ${MIN_AGE} and over.` : 'Never shown to anyone. It only helps Companheiro fit you.'}
              </p>
            </div>
          </div>
        </Card>
      </Container>
    </Step>
  )
}

function PracticeStep({ name, onBack, onNext }: { name: string; onBack: () => void; onNext: (practices: Practice[], other: string, themes: string[]) => void }) {
  const { t } = useTheme()
  const [practices, setPractices] = useState<Practice[]>([])
  const [other, setOther] = useState('')
  const [themes, setThemes] = useState<string[]>([])
  const [draft, setDraft] = useState('')

  const toggle = (p: Practice) => setPractices((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : cur.length < MAX_PRACTICES ? [...cur, p] : cur))
  const withDraft = (list: string[], raw: string) => {
    const label = raw.trim().replace(/\s+/g, ' ').slice(0, 60)
    if (label.length < 2 || list.length >= MAX_THEMES || list.some((x) => x.toLowerCase() === label.toLowerCase())) return list
    return [...list, label]
  }
  const add = (raw: string) => { setThemes((cur) => withDraft(cur, raw)); setDraft('') }
  // A theme typed but not yet added still counts.
  const chosen = withDraft(themes, draft)
  const full = themes.length >= MAX_THEMES
  const atLimit = practices.length >= MAX_PRACTICES
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
            <PrimaryButton size="lg" full onClick={() => onNext(practices, other.trim(), chosen)} disabled={!ready}>Show me round</PrimaryButton>
          </div>
        </div>
      }
    >
      <Container padding={12}>
        <div className="flex flex-col gap-3">
          <Card padding={18}>
            <p style={{ ...typeRoles.h3, fontSize: 16, color: t.textPrimary }}>What does your creative practice look like?</p>
            <p style={{ ...typeRoles.small, color: t.textMuted, marginTop: 2 }}>{atLimit ? 'That’s three. Tap one to swap it.' : 'Choose up to three.'}</p>
            <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
              {PRACTICES.map((p) => {
                const on = practices.includes(p.key)
                return (
                  <Pill key={p.key} hue="tide" size="md" selected={on} onClick={() => toggle(p.key)} style={{ padding: '9px 15px', fontSize: 13, color: on ? '#ffffff' : undefined, opacity: !on && atLimit ? 0.7 : 1 }}>
                    {p.label}
                  </Pill>
                )
              })}
            </div>
            <div style={{ marginTop: 12 }}>
              <TextField value={other} onChange={(v) => setOther(v.slice(0, 80))} placeholder="Something else? Say it in your own words." ariaLabel="Another kind of practice" />
            </div>
          </Card>

          <Card padding={18}>
            <p style={{ ...typeRoles.h3, fontSize: 16, color: t.textPrimary }}>What themes does your work keep returning to?</p>
            <p style={{ ...typeRoles.small, color: t.textMuted, marginTop: 2 }}>Up to four. They become the themes in your Idea Lab, and you can change them whenever you like.</p>
            {themes.length > 0 && (
              <div className="flex flex-wrap gap-2" style={{ marginTop: 12 }}>
                {themes.map((th) => (
                  <Pill key={th} hue="violet" size="md" selected onClick={() => setThemes(themes.filter((x) => x !== th))} style={{ padding: '9px 13px', fontSize: 13, color: '#ffffff' }}>
                    {th} <span aria-hidden style={{ opacity: 0.7 }}>✕</span><span className="sr-only">, remove</span>
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

// ── The tour: three parts chosen for them, then the rest by name ────────────

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
          {themes.map((th) => <Pill key={th} hue="violet">{th}</Pill>)}
        </div>
      )}
    </Container>
  )
}

function Carousel({ firstRun, who, themes, leaving, onMood, onLeave }: { firstRun: boolean; who: TourProfile | null; themes: string[]; leaving: boolean; onMood: (m: Hue) => void; onLeave: () => void }) {
  const reduce = useReducedMotion()
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const { shown, rest } = useMemo(() => slidesFor(who?.practices ?? []), [who])
  // The parts chosen for them, then one more that names the rest.
  const count = shown.length + 1
  const last = index === count - 1
  // How many times each slide has come up: its widget's key, so it plays from the start on every arrival.
  const [runs, setRuns] = useState(() => Array.from({ length: count }, () => 0))

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

  const names = [...shown.map((s) => s.where), 'Ready']
  const begin = firstRun ? 'Begin' : 'Done'

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
                    <span style={{ color: shell.muted }}>{i + 1} of {count} · </span>{s ? s.where : 'And more'}
                  </p>
                  <h2 className="mt-3.5 lg:mt-2.5" style={TITLE}>{s ? s.title : who?.name ? `That’s the heart of it, ${who.name}.` : 'That’s the heart of it.'}</h2>
                  <p className={LEDE} style={LEDE_STYLE}>
                    {s ? s.body : 'There’s more inside, and you’ll meet each part when you need it. Nothing here has to be learned first.'}
                  </p>
                  {!s && <p className={LEDE} style={{ ...LEDE_STYLE, color: shell.text }}>Ready to begin?</p>}
                </div>
                <div className="w-full">
                  {s ? <s.Widget key={runs[i]} active={i === index} themes={s.id === 'idea' && themes.length ? themes : undefined} /> : <AlsoInside rest={rest} themes={themes} />}
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
              className={`flex h-11 cursor-pointer items-center transition-[width] duration-300 ${i === index ? 'w-9' : 'w-5'}`}
              style={{ background: 'none', border: 'none', padding: 0 }}
            >
              <span style={{ display: 'block', width: '100%', height: 4, borderRadius: 2, backgroundColor: i === index ? shell.text : i < index ? shell.muted : shell.line, transition: 'background-color 0.3s ease' }} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 lg:gap-2.5">
          {index > 0 && (
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Back"
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
