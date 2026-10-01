'use client'

// Public landing page (signed-out visitors at `/`).
//
// Built against the design-taste-frontend skill. The shell is the app's own:
// ink plus the drifting Atmosphere at full strength, whose mood follows the
// section you are reading, the way the app shifts hue per module. Every
// visual is a real app component fed with sample data (see mockups.tsx); no
// photography. One accent (ember) for the page's own type, Geist only, pill
// buttons, the app's container/card radii. Motion carries the story and
// collapses to static under prefers-reduced-motion.

import Link from 'next/link'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { motion as m, useInView, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { Atmosphere } from '@/components/shell/atmosphere'
import { Container, Card } from '@/components/shell/page-shell'
import { Pill } from '@/components/ui/pill'
import { useTheme } from '@/components/theme/theme-provider'
import { useAttributedHref } from '@/lib/attribution'
import { LEGAL_PAGES } from '@/lib/legal'
import { alpha, shell, tokensFor, type as typeRoles, type Mood } from '@/lib/design-tokens'
import { CanvasMockup, RuleHeardMockup, VisionFinder } from './mockups'
import { SLIDES, type TourSlide } from '@/components/tour/slides'

const hues = tokensFor('dark')
const ember = hues.ember
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

// Tokens exposed as CSS variables so Tailwind classes can use them without
// hard-coding a colour in this file.
const vars = {
  '--ink': shell.ink,
  '--bone': shell.text,
  '--muted': shell.muted,
  '--line': shell.line,
  '--fill': shell.fill,
  '--ember': ember,
  '--ember-soft': alpha(ember, 0.16),
  colorScheme: 'dark',
} as React.CSSProperties

const SIGNUP = '/signup'
const LOGIN = '/login'

// ── Atmosphere mood follows the section in view ──────────────────────────────

const MoodContext = createContext<(m: Mood) => void>(() => {})

/** Sets the shell's mood while `ref` holds the middle of the viewport. */
function useSectionMood(ref: React.RefObject<Element | null>, mood: Mood) {
  const setMood = useContext(MoodContext)
  const inView = useInView(ref, { margin: '-45% 0px -45% 0px' })
  useEffect(() => {
    if (inView) setMood(mood)
  }, [inView, mood, setMood])
  return inView
}

// ── Shared pieces ────────────────────────────────────────────────────────────

function BeginButton() {
  const href = useAttributedHref(SIGNUP)
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[var(--bone)] px-6 py-3 text-[15px] font-semibold text-[var(--ink)] transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ember)]"
    >
      Begin
      <ArrowRight size={16} strokeWidth={2} className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

/** Fade + rise when the element enters the viewport. Static under reduced motion. */
function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion()
  return (
    <m.div
      className={className}
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.8, delay, ease: EASE }}
    >
      {children}
    </m.div>
  )
}

const H2 = 'text-balance text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-[var(--bone)] md:text-[44px]'

// ── Nav ──────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <header className="relative z-10 mx-auto flex h-16 w-full max-w-[1180px] items-center justify-between px-4 pt-[env(safe-area-inset-top)] md:h-[72px] md:px-8">
      <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em] text-[var(--bone)]">
        {/* The existing brand mark from /public, not a new drawing. */}
        <img src="/favicon.svg" alt="" width={22} height={22} />
        Companheiro
      </Link>
      <nav className="flex items-center gap-1">
        <a
          href="#pricing"
          className="rounded-full px-4 py-2 text-[14px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--bone)]"
        >
          Pricing
        </a>
        <Link
          href={LOGIN}
          className="rounded-full px-4 py-2 text-[14px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--bone)]"
        >
          Log in
        </Link>
      </nav>
    </header>
  )
}

// ── Hero: asymmetric split, the vision assembles from fragments ─────────────

// The hero's entrance is CSS, not motion: it is the first thing a new visitor
// sees, and a motion `initial` would keep it invisible in the server's HTML
// until the page's JavaScript had downloaded and run.
const ENTER = 'motion-safe:animate-in fade-in fill-mode-both ease-[cubic-bezier(0.16,1,0.3,1)]'
const ENTER_TEXT = `${ENTER} slide-in-from-bottom-[18px] animation-duration-[900ms]`

function Hero() {
  const ref = useRef<HTMLElement>(null)
  useSectionMood(ref, 'ember')

  return (
    <section
      ref={ref}
      className="mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-12 px-4 pb-16 pt-8 md:px-8 md:pb-20 md:pt-12 lg:min-h-[calc(100dvh-72px)] lg:grid-cols-[1.15fr_0.85fr] lg:gap-14"
    >
      <div className="max-w-[640px]">
        <h1
          className={`${ENTER_TEXT} delay-[150ms] text-balance text-[44px] font-bold leading-[1.04] tracking-[-0.035em] text-[var(--bone)] md:text-[60px] xl:text-[72px]`}
        >
          {/* Same pairing as the brand document: Geist headline, one word in Newsreader italic. */}
          You already have a{' '}
          <span className="font-[family-name:var(--font-newsreader)] font-normal italic tracking-[-0.01em] text-[var(--ember)]">vision</span>.
        </h1>
        <p className={`${ENTER_TEXT} delay-[270ms] mt-6 max-w-[44ch] text-[17px] leading-relaxed text-[var(--muted)] md:text-[18px]`}>
          It&rsquo;s scattered across your notes, drafts and half-finished things. Companheiro helps you find it, hold it, and build from it.
        </p>
        <div className={`${ENTER_TEXT} delay-[390ms] mt-9`}>
          <BeginButton />
        </div>
      </div>

      <div className={`${ENTER} slide-in-from-bottom-[24px] animation-duration-[1100ms] delay-[300ms] w-full max-w-[480px] lg:justify-self-end`}>
        <VisionFinder />
      </div>
    </section>
  )
}

// ── Manifesto: words come up as you read ─────────────────────────────────────

const MANIFESTO =
  'It usually starts as something you can\u2019t quite name. A line you keep coming back to. An image you can\u2019t put down. You call them separate ideas. Often they are one vision, seen from different sides. Companheiro helps you see it whole. And it begins with one good question.'

function Word({ word, progress, range }: { word: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.16, 1])
  return <m.span style={{ opacity }}>{word} </m.span>
}

function Manifesto() {
  const sectionRef = useRef<HTMLElement>(null)
  const ref = useRef<HTMLParagraphElement>(null)
  useSectionMood(sectionRef, 'violet')
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] })
  const words = MANIFESTO.split(' ')

  return (
    <section ref={sectionRef} className="mx-auto w-full max-w-[1000px] px-4 pb-20 pt-24 md:px-8 md:pb-28 md:pt-40">
      <p
        ref={ref}
        className="text-[28px] font-semibold leading-[1.22] tracking-[-0.025em] text-[var(--bone)] md:text-[44px] md:leading-[1.16]"
      >
        {reduce
          ? MANIFESTO
          : words.map((w, i) => (
              <Word key={i} word={w} progress={scrollYProgress} range={[i / words.length, (i + 1) / words.length]} />
            ))}
      </p>
    </section>
  )
}

// ── Inside: the app's parts, each with a working copy of its screen ─────────
// The same slides the tour shows after sign-up (components/tour/slides.tsx),
// laid down the page so nothing sits behind a Next button. There is no
// heading: the manifesto above ends on "one good question", and the first row
// is where that question comes from. Portrait and Capture are left for the
// tour itself. The Project Board is shown as the canvas, not the tour's widget.

const slideFor = (where: string) => SLIDES.find((s) => s.where === where) as TourSlide

// Only on this page: how a Check-in feels, where the tour says what it does.
const CHECK_IN_TITLE = 'Say it out loud. Feel it land.'

function InsideRow({ slide, flip, title }: { slide: TourSlide; flip: boolean; title?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useSectionMood(ref, slide.mood as Mood)
  // The widget starts once, when its row is properly on screen.
  const seen = useInView(ref, { once: true, amount: 0.4 })
  return (
    <div ref={ref} className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-16">
      <Reveal className={flip ? 'md:order-2' : ''}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: hues[slide.mood] }}>{slide.where}</p>
        <h3 className="mt-3 max-w-[18ch] text-balance text-[26px] font-bold leading-[1.1] tracking-[-0.025em] text-[var(--bone)] md:text-[36px]">{title ?? slide.title}</h3>
        <p className="mt-4 max-w-[44ch] text-[16px] leading-relaxed text-[var(--muted)] md:text-[17px]">{slide.body}</p>
      </Reveal>
      <Reveal delay={0.1} className={`mx-auto w-full max-w-[460px] ${flip ? 'md:order-1 md:mr-auto md:ml-0' : 'md:ml-auto md:mr-0'}`}>
        <slide.Widget active={seen} />
      </Reveal>
    </div>
  )
}

const CANVAS_FACTS = [
  'Any medium: essays, songs, photographs, film.',
  'Several visions at once, each on its own canvas.',
  'Images and recordings are for your eyes. It only reads what you write about them.',
]

/** The Project Board's place in the run: the whole canvas, full width. */
function BoardCanvas() {
  const ref = useRef<HTMLDivElement>(null)
  useSectionMood(ref, 'verdant')
  return (
    <div ref={ref}>
      <Reveal>
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: hues.tide }}>Project Board</p>
        <h3 className="mt-3 max-w-[18ch] text-balance text-[26px] font-bold leading-[1.1] tracking-[-0.025em] text-[var(--bone)] md:text-[36px]">See the whole vision at once.</h3>
        <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-[var(--muted)] md:text-[17px]">
          Every piece laid out side by side on a canvas that goes as far as you need. Threads show what connects, so the shape of the work is visible.
        </p>
      </Reveal>
      <Reveal delay={0.1} className="mt-8 md:mt-12">
        <CanvasMockup />
      </Reveal>
      <div className="mt-8 grid grid-cols-1 gap-5 md:mt-10 md:grid-cols-3 md:gap-10">
        {CANVAS_FACTS.map((f, i) => (
          <Reveal key={f} delay={i * 0.06}>
            <p className="max-w-[34ch] border-t border-[var(--line)] pt-4 text-[15px] leading-relaxed text-[var(--muted)]">{f}</p>
          </Reveal>
        ))}
      </div>
    </div>
  )
}

function Inside() {
  return (
    <section className="mx-auto flex w-full max-w-[1180px] flex-col gap-20 px-4 pb-20 md:gap-32 md:px-8 md:pb-28">
      <InsideRow slide={slideFor('Idea')} flip={false} />
      <InsideRow slide={slideFor('Conceptualise')} flip />
      <BoardCanvas />
      <InsideRow slide={slideFor('Writing')} flip={false} />
      <InsideRow slide={slideFor('Check-in')} flip title={CHECK_IN_TITLE} />
    </section>
  )
}

// ── What it will never do: four cards, each crossing out what others do ─────

const NEVER = [
  { not: 'Here’s a draft I wrote for you', title: 'Make the work for you', body: 'It can ask and suggest. Every sentence you keep is one you chose.' },
  { not: 'This piece scores 8 out of 10', title: 'Tell you whether it’s good', body: 'It helps you see what you meant. It never grades what you made.' },
  { not: '12-day streak · 340 views', title: 'Keep score', body: 'No likes, no views, no streaks. Nothing here measures how the work performed.' },
  { not: 'Posted on your behalf', title: 'Speak for you', body: 'It talks only to you. It never posts or sends anything in your name.' },
]

function Never() {
  const ref = useRef<HTMLElement>(null)
  useSectionMood(ref, 'ember')
  return (
    <section ref={ref} className="mx-auto w-full max-w-[1180px] px-4 py-20 md:px-8 md:py-32">
      <Reveal>
        <h2 className={H2}>What it will never do.</h2>
        <p className="mt-5 max-w-[48ch] text-[17px] leading-relaxed text-[var(--muted)]">
          Four things other tools are built to do, and this one is built to refuse.
        </p>
      </Reveal>
      <div className="mt-10 grid grid-cols-1 gap-4 md:mt-14 md:grid-cols-2 md:gap-5">
        {NEVER.map((n, i) => (
          <Reveal key={n.title} delay={(i % 2) * 0.08}>
            <div className="relative h-full overflow-hidden rounded-[24px] border border-[var(--line)] bg-[var(--fill)] p-6 transition-colors duration-500 hover:border-[rgba(236,233,226,0.22)] md:p-8">
              {/* The number sits behind, large and faint. */}
              <span aria-hidden className="pointer-events-none absolute -right-2 -top-6 select-none text-[120px] font-bold leading-none tracking-[-0.05em] md:text-[150px]" style={{ color: alpha(ember, 0.07) }}>
                {i + 1}
              </span>
              {/* What another tool would say here, crossed out. */}
              <p aria-hidden className="relative inline-flex max-w-full items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-medium" style={{ backgroundColor: alpha(ember, 0.12), color: alpha(ember, 0.95) }}>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: ember }} />
                <span className="truncate line-through decoration-[1.5px]">{n.not}</span>
              </p>
              <h3 className="relative mt-6 text-[22px] font-semibold tracking-[-0.02em] text-[var(--bone)] md:text-[26px]">{n.title}</h3>
              <p className="relative mt-2.5 max-w-[38ch] text-[16px] leading-relaxed text-[var(--muted)]">{n.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

// ── Closing: mockup left, promise right ──────────────────────────────────────

function Closing() {
  const ref = useRef<HTMLElement>(null)
  useSectionMood(ref, 'ochre')
  return (
    <section
      ref={ref}
      className="mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-12 px-4 py-20 md:grid-cols-[0.9fr_1.1fr] md:gap-20 md:px-8 md:py-32"
    >
      <Reveal className="order-2 w-full max-w-[480px] md:order-1">
        <RuleHeardMockup />
      </Reveal>
      <Reveal delay={0.1} className="order-1 md:order-2">
        <h2 className={`max-w-[16ch] ${H2} md:text-[52px]`}>Say a rule once. It keeps it for you.</h2>
        <p className="mt-5 max-w-[44ch] text-[17px] leading-relaxed text-[var(--muted)]">
          Mention a line you won&rsquo;t cross while you talk the work through, and it asks whether to keep it. Kept rules come back as a question when new work runs against them, and never become rules without you.
        </p>
      </Reveal>
    </section>
  )
}

// ── Pricing: two plans, Direction leads ─────────────────────────────────────
// Figures from the v5 working document (Practice and Direction). Not final:
// update here when the plan is.

type Billing = 'month' | 'year'

const PLANS = [
  {
    id: 'practice',
    name: 'Practice',
    line: 'For one vision at a time, in words.',
    price: { month: 9, year: 90 },
    features: [
      'One active project at a time',
      'Unlimited personal check-ins',
      'Define and conceptualise new ideas',
      'Find, hold and talk to your vision',
      'Access to the writing suite',
      'Switch projects by resting one for 14 days',
    ],
  },
  {
    id: 'direction',
    name: 'Direction',
    line: 'For many visions at once, in any medium.',
    price: { month: 29, year: 290 },
    features: [
      'Everything in Practice',
      'Have access to unlimited active projects',
      'The full canvas for every vision',
      'Images and recordings beside your words',
      'Talk through direction whenever you need to',
    ],
  },
] as const

function PlanButton({ lead }: { lead: boolean }) {
  const { t } = useTheme()
  const href = useAttributedHref(SIGNUP)
  return (
    <Link
      href={href}
      className="group inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 py-3 text-[15px] font-semibold transition-transform duration-300 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ember)]"
      style={lead ? { backgroundColor: t.inverseBg, color: t.inverseText } : { backgroundColor: t.cardBgInner, color: t.textPrimary }}
    >
      Begin
      <ArrowRight size={16} strokeWidth={2} className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

function PlanCard({ plan, billing, lead }: { plan: (typeof PLANS)[number]; billing: Billing; lead: boolean }) {
  const { t } = useTheme()
  const amount = plan.price[billing]
  const perMonth = billing === 'year' ? (plan.price.year / 12).toFixed(2).replace(/\.00$/, '') : null
  return (
    <Card padding={lead ? 30 : 26} style={{ height: '100%', display: 'flex', flexDirection: 'column', borderTop: lead ? `3px solid ${t.ember}` : undefined }}>
      <div className="flex items-center justify-between gap-3">
        <p style={{ ...typeRoles.h2, fontSize: lead ? 26 : 22, color: t.textPrimary }}>{plan.name}</p>
        {lead && <Pill hue="ember">Many visions</Pill>}
      </div>
      <p style={{ ...typeRoles.ui, color: t.textSecondary, marginTop: 6 }}>{plan.line}</p>
      <div className="mt-6 flex items-baseline gap-1.5">
        <span style={{ ...typeRoles.display, fontSize: lead ? 48 : 40, color: t.textPrimary }}>&euro;{amount}</span>
        <span style={{ ...typeRoles.ui, color: t.textMuted }}>a {billing}</span>
      </div>
      <p style={{ ...typeRoles.small, color: t.textMuted, marginTop: 4, minHeight: '1.5em' }}>
        {perMonth ? `\u20ac${perMonth} a month, two months free` : 'Or yearly, with two months free'}
      </p>
      <ul className="mt-6 flex flex-1 flex-col gap-3">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-3">
            <Check size={16} strokeWidth={2} aria-hidden style={{ color: lead ? t.ember : t.verdant, marginTop: 3, flexShrink: 0 }} />
            <span style={{ ...typeRoles.ui, color: t.textPrimary }}>{f}</span>
          </li>
        ))}
      </ul>
      <div className="mt-8">
        <PlanButton lead={lead} />
      </div>
    </Card>
  )
}

const PRICING_FACTS = [
  { title: '30 days free', body: 'No card needed to start.' },
  // Every line here must be something the product actually does today.
  { title: 'Cancel whenever', body: 'From Settings, in a moment. A full refund if you cancel within 14 days of your first payment.' },
  { title: 'Your work stays yours', body: 'If you stop paying, everything you made stays readable and exportable.' },
]

function Pricing() {
  const ref = useRef<HTMLElement>(null)
  useSectionMood(ref, 'violet')
  const [billing, setBilling] = useState<Billing>('month')
  return (
    <section id="pricing" ref={ref} className="mx-auto w-full max-w-[1180px] scroll-mt-8 px-4 py-20 md:px-8 md:py-32">
      <Reveal>
        <h2 className={`max-w-[18ch] ${H2}`}>Two ways to hold a vision.</h2>
        <p className="mt-5 max-w-[48ch] text-[17px] leading-relaxed text-[var(--muted)]">
          Practice for one project in words. Direction for many, in any medium. Move between them whenever you like.
        </p>
      </Reveal>

      <Reveal delay={0.08} className="mt-10 md:mt-12">
        <div role="radiogroup" aria-label="Billing period" className="inline-flex gap-1 rounded-full p-1" style={{ backgroundColor: shell.fill }}>
          {(['month', 'year'] as const).map((b) => (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={billing === b}
              onClick={() => setBilling(b)}
              className="cursor-pointer rounded-full px-4 py-2 text-[14px] font-medium transition-colors"
              style={billing === b ? { backgroundColor: shell.text, color: shell.ink } : { color: shell.muted }}
            >
              {b === 'month' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
      </Reveal>

      <Reveal delay={0.12} className="mt-6">
        <Container padding={16}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[0.85fr_1.15fr]">
            <PlanCard plan={PLANS[0]} billing={billing} lead={false} />
            <PlanCard plan={PLANS[1]} billing={billing} lead />
          </div>
        </Container>
      </Reveal>

      <p className="mt-4 text-[13px] text-[var(--muted)]">
        Plans renew automatically until you cancel. Fair-use limits apply. See the{' '}
        <Link href="/terms#plans" className="underline underline-offset-4 hover:text-[var(--bone)]">Terms</Link> and{' '}
        <Link href="/refunds" className="underline underline-offset-4 hover:text-[var(--bone)]">refund policy</Link>.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-10">
        {PRICING_FACTS.map((f, i) => (
          <Reveal key={f.title} delay={i * 0.06}>
            <div className="border-t border-[var(--line)] pt-4">
              <p className="text-[16px] font-semibold text-[var(--bone)]">{f.title}</p>
              <p className="mt-1 max-w-[34ch] text-[15px] leading-relaxed text-[var(--muted)]">{f.body}</p>
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

// ── Final call to action: the bookend to the hero ───────────────────────────

function FinalCta() {
  const ref = useRef<HTMLElement>(null)
  useSectionMood(ref, 'ember')
  return (
    <section ref={ref} className="mx-auto flex w-full max-w-[1000px] flex-col items-center px-4 pb-28 pt-16 text-center md:px-8 md:pb-40 md:pt-24">
      <Reveal className="flex flex-col items-center">
        <h2 className="text-balance text-[40px] font-bold leading-[1.06] tracking-[-0.035em] text-[var(--bone)] md:text-[64px]">
          Start with what you{' '}
          <span className="font-[family-name:var(--font-newsreader)] font-normal italic tracking-[-0.01em] text-[var(--ember)]">already</span> have.
        </h2>
        <p className="mt-6 max-w-[40ch] text-[17px] leading-relaxed text-[var(--muted)] md:text-[18px]">
          Bring one note, one draft, one thing you keep circling. The vision is usually already in there.
        </p>
        <div className="mt-10">
          <BeginButton />
        </div>
        <p className="mt-5 text-[13px] text-[var(--muted)]">30 days free. No card needed.</p>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 border-t border-[var(--line)] px-4 pb-[max(32px,env(safe-area-inset-bottom))] pt-6 text-[13px] text-[var(--muted)] md:flex-row md:items-center md:justify-between md:px-8">
      <span>&copy; {new Date().getFullYear()} Companheiro</span>
      <nav aria-label="Legal">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {LEGAL_PAGES.filter((p) => p.href !== '/legal').map((p) => (
            <li key={p.href}>
              <Link href={p.href} className="transition-colors hover:text-[var(--bone)]">
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  )
}

export function Landing() {
  const [mood, setMood] = useState<Mood>('ember')
  return (
    <MoodContext.Provider value={setMood}>
      <div style={vars} className="relative min-h-[100dvh] overflow-x-clip bg-[var(--ink)] font-[family-name:var(--font-geist-sans)] text-[var(--bone)]">
        <Atmosphere mood={mood} intensity={1} cycle={false} />
        <div className="relative z-[1]">
          <Nav />
          <main>
            <Hero />
            <Manifesto />
            <Inside />
            <Never />
            <Closing />
            <Pricing />
            <FinalCta />
          </main>
          <Footer />
        </div>
      </div>
    </MoodContext.Provider>
  )
}
