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
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { motion as m, useInView, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { Atmosphere } from '@/components/shell/atmosphere'
import { Container, Card } from '@/components/shell/page-shell'
import { Pill } from '@/components/ui/pill'
import { useTheme } from '@/components/theme/theme-provider'
import { useAttributedHref } from '@/lib/attribution'
import { LEGAL_PAGES } from '@/lib/legal'
import { CONTACT_EMAIL } from '@/lib/site'
import { formatMoney } from '@/lib/billing/price-format'
import { usePrices } from '@/lib/billing/use-prices'
import { alpha, shell, tokensFor, type as typeRoles, type Hue, type Mood } from '@/lib/design-tokens'
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

/**
 * Plays what is inside as it comes into view, and keeps it moving until the
 * person touches it. Someone reading the paragraph beside a widget would
 * otherwise arrive to find its animation already over and take it for a
 * picture.
 *
 * A widget that `loops` is handed three things: `active` (it has been seen),
 * `onDone` and `replay`. It calls `onDone` each time it finishes a stretch of
 * its own animation, optionally with how long to hold there. The hold counts
 * stillness: it starts again whenever the pointer moves inside the widget, so
 * a cursor resting on it, or not on it at all, lets it run out. Then `replay`
 * goes up and the widget does whatever comes next, which is its own business:
 * wind back in reverse and play again, or move on to its next step (see
 * useRewind in mockups.tsx). A press, a tap or a key ends it for good.
 *
 * Once it has scrolled right out of sight a fresh copy takes its place, so
 * coming back to it is a clean first play. A widget that does not loop only
 * gets `active`, and is never replaced.
 */
const HOLD_MS = 4000

type Looping = { active: boolean; replay?: number; onDone?: (holdMs?: number) => void }

function Replay({ children, loops = false, className }: { children: (p: Looping) => React.ReactNode; loops?: boolean; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  // Present once a third of it shows, gone only when none of it does: a widget
  // that changes height as it plays must not count as leaving and returning.
  const enough = useInView(ref, { amount: 0.3 })
  const any = useInView(ref)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    if (enough) setInView(true)
    else if (!any) setInView(false)
  }, [enough, any])
  const [copy, setCopy] = useState(0)
  const [replay, setReplay] = useState(0)
  const [seen, setSeen] = useState(false)
  const [engaged, setEngaged] = useState(false)
  // What the widget last finished, and how long to stay on it.
  const [hold, setHold] = useState<{ ms: number; n: number } | null>(null)
  const wasIn = useRef(false)
  const replays = loops && !engaged && !reduce
  const onDone = useCallback((ms: number = HOLD_MS) => setHold((h) => ({ ms, n: (h?.n ?? 0) + 1 })), [])

  // Arriving plays it. Leaving swaps in a fresh copy while nobody can see it.
  useEffect(() => {
    if (inView) {
      wasIn.current = true
      setSeen(true)
      return
    }
    if (!wasIn.current || !replays) return
    wasIn.current = false
    setSeen(false)
    setHold(null)
    setReplay(0)
    setCopy((c) => c + 1)
    // only crossing the edge of the screen matters here; the hold below handles the rest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView])

  // Finished, then left still for the hold: on to whatever the widget does next.
  useEffect(() => {
    const el = ref.current
    if (!el || !hold || !inView || !replays) return
    let id = 0
    const arm = (ms: number) => {
      window.clearTimeout(id)
      id = window.setTimeout(() => {
        // Nobody is watching a hidden tab; look again shortly.
        if (document.visibilityState !== 'visible') return arm(1000)
        setHold(null)
        setReplay((r) => r + 1)
      }, ms)
    }
    arm(hold.ms)
    // Movement inside it means they are with it: the stillness is counted afresh.
    const onMove = () => arm(hold.ms)
    el.addEventListener('pointermove', onMove)
    return () => {
      window.clearTimeout(id)
      el.removeEventListener('pointermove', onMove)
    }
  }, [hold, inView, replays])

  const engage = () => setEngaged(true)
  return (
    <div ref={ref} className={className} onPointerDownCapture={engage} onKeyDownCapture={engage}>
      <Fragment key={copy}>{children(loops ? { active: seen, replay, onDone } : { active: seen })}</Fragment>
    </div>
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
        <div className={`${ENTER_TEXT} delay-[390ms] mt-8 flex flex-wrap items-center gap-x-5 gap-y-3`}>
          <BeginButton />
          <p className="text-[13px] text-[var(--muted)]">30 days free. No card needed.</p>
        </div>
      </div>

      <div className={`${ENTER} slide-in-from-bottom-[24px] animation-duration-[1100ms] delay-[300ms] w-full max-w-[480px] lg:justify-self-end`}>
        <Replay loops>{(p) => <VisionFinder {...p} />}</Replay>
      </div>
    </section>
  )
}

// ── Manifesto: words come up as you read ─────────────────────────────────────

const MANIFESTO =
  'It usually starts as something you can\u2019t quite name. A line you keep coming back to. An image you can\u2019t put down. You call them separate ideas. Often they are one vision, seen from different sides. Companheiro helps you see it whole.'

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
// heading: the manifesto runs straight into the first row. Portrait and
// Capture are left for the tour itself. The Project Board is shown as the
// canvas, not the tour's widget.

const slideFor = (where: string) => SLIDES.find((s) => s.where === where) as TourSlide

// Only on this page: how a Check-in feels, where the tour says what it does.
const CHECK_IN_TITLE = 'Say it out loud. Feel it land.'
// Only on this page: straight after the manifesto, "Systemise your creativity"
// read like the productivity software the refusals below promise this is not.
const IDEA_TITLE = 'A question worth making something from.'
const IDEA_BODY = 'No need to wait for the creative muse. Pick a theme you care about, and the ‘Idea Lab’ gives you one, every time you sit down.'
// Only on this page: the tour's line ends on "one clear sentence", which the page said too often.
const CONCEPT_BODY = 'Find the voice of your idea outside of the fog of the abstract. ‘Conceptualise’ helps you define the outline of what you want to express, one question at a time, until the concept is clear enough to declare.'

function InsideRow({ slide, flip, title, body, loops }: { slide: TourSlide; flip: boolean; title?: string; body?: string; /** The widget keeps itself moving until it is touched (see Replay). */ loops?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useSectionMood(ref, slide.mood as Mood)
  return (
    <div ref={ref} className="grid grid-cols-1 items-center gap-8 md:grid-cols-2 md:gap-16">
      <Reveal className={flip ? 'md:order-2' : ''}>
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: hues[slide.mood] }}>{slide.where}</p>
        <h3 className="mt-3 max-w-[18ch] text-balance text-[26px] font-bold leading-[1.1] tracking-[-0.025em] text-[var(--bone)] md:text-[36px]">{title ?? slide.title}</h3>
        <p className="mt-4 max-w-[44ch] text-[16px] leading-relaxed text-[var(--muted)] md:text-[17px]">{body ?? slide.body}</p>
      </Reveal>
      <Reveal delay={0.1} className={`mx-auto w-full max-w-[460px] ${flip ? 'md:order-1 md:mr-auto md:ml-0' : 'md:ml-auto md:mr-0'}`}>
        <Replay loops={loops}>{(p) => <slide.Widget {...p} />}</Replay>
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
        <h3 className="mt-3 max-w-[20ch] text-balance text-[26px] font-bold leading-[1.1] tracking-[-0.025em] text-[var(--bone)] md:text-[36px]">Hold every project to what it was meant to be.</h3>
        <p className="mt-4 max-w-[56ch] text-[16px] leading-relaxed text-[var(--muted)] md:text-[17px]">
          For the studio of one and the director carrying several projects at once. Each gets its own canvas: the vision and its rules, the pieces, the threads between them, and the reference images, voice notes and task lists you keep beside the work.
        </p>
      </Reveal>
      <Reveal delay={0.1} className="mt-8 md:mt-12">
        <Replay loops>{(p) => <CanvasMockup {...p} />}</Replay>
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
      <InsideRow slide={slideFor('Idea')} flip={false} title={IDEA_TITLE} body={IDEA_BODY} loops />
      <InsideRow slide={slideFor('Conceptualise')} flip body={CONCEPT_BODY} loops />
      <BoardCanvas />
      <InsideRow slide={slideFor('Writing')} flip={false} loops />
      <InsideRow slide={slideFor('Check-in')} flip title={CHECK_IN_TITLE} />
    </section>
  )
}

// ── Who it's for: six kinds of makers, and what each one does with it ───────
// The page above shows the parts; this says whose they are. Each audience
// gets who it is in a sentence, the use in four steps built only from things
// the product does today on the plan named, a promise about what it will not
// do, and their plan. The first four start on Practice (two of them reach into
// Direction for images and recordings); the last two are Direction's, set
// apart by a divider, a warmer tab and a white panel. `/?for=writers` opens on
// that audience, so a post or a bio link can land someone on their own case;
// the Begin link carries `landing=for-…` into sign-up, where the admin page
// shows which case worked.

/** A plan's name, linked to its card in the pricing section. With no words of its own it says "Practice, €9 a month", in the visitor's currency. */
function PlanLink({ plan, children }: { plan: 'practice' | 'direction'; children?: React.ReactNode }) {
  const prices = usePrices()
  return (
    <a href={`#plan-${plan}`} className="font-semibold text-[var(--bone)] underline decoration-[var(--line)] underline-offset-4 transition-colors hover:decoration-[var(--bone)]">
      {children ?? `${plan === 'practice' ? 'Practice' : 'Direction'}, ${prices.money(plan, 'monthly')} a month`}
    </a>
  )
}

type Audience = {
  key: string
  tab: string
  name: string
  hue: Hue
  /** Which side of the divider the tab sits on. */
  tier: 'practice' | 'direction'
  /** The eyebrow over the name. */
  plans: string
  who: string
  steps: React.ReactNode[]
  never: string
  footer: React.ReactNode
}

const AUDIENCES: Audience[] = [
  {
    key: 'back',
    tab: 'Creatives',
    name: 'Rekindling your passion for making',
    hue: 'ember',
    tier: 'practice',
    plans: 'Practice',
    who: 'You made things once and fell out of practice, but you still remember how it felt when making was part of your week.',
    steps: [
      'Pick a theme you care about and get one question to start from.',
      'Answer it, a question at a time, until the idea has a shape you recognise.',
      'Write it a part at a time. When you are stuck, it asks what you meant.',
      'Come and go as life allows. Nothing was counting while you were away.',
    ],
    never: 'No streaks, no targets, nobody keeping track of your days.',
    footer: <><PlanLink plan="practice" />. Two projects at a time is the point, not the limit.</>,
  },
  {
    key: 'writers',
    tab: 'Writers',
    name: 'Writers with a vision',
    hue: 'tide',
    tier: 'practice',
    plans: 'Practice',
    who: 'You have imagination, a vision for the work, and the ambition to see it crafted and expressed to its fullest.',
    steps: [
      'Bring a draft you already have, or start from a question.',
      'Say what the piece is for, and keep it beside the draft as you write.',
      'Select a passage and talk it over until it says what you meant.',
      'When a piece is out in the world, note what it opened. It comes back as your next ideas.',
    ],
    never: 'It never asks you to aim smaller, and never steers the work toward anyone’s vision but yours.',
    footer: <><PlanLink plan="practice" />. One project holds as many pieces as it needs: a collection, a series, a book.</>,
  },
  {
    key: 'film',
    tab: 'Creator',
    name: 'Cinematographers, photographers and creators',
    hue: 'verdant',
    tier: 'practice',
    plans: 'Practice / Direction',
    who: 'You think in frames, whether it is a film, a photo series or the next thing you post, and it starts as a feeling before it is a shot.',
    steps: [
      'Start from a question, or bring the idea you already have, and find what the piece is really about.',
      'Write the words it needs: the treatment, the script, the caption.',
      'Say what the work must never do. It comes back as a question when a new piece drifts.',
      <>On <PlanLink plan="direction">Direction</PlanLink>, keep stills, reference frames and voice notes on the project&rsquo;s canvas, and run threads across a series.</>,
    ],
    never: 'It never looks at your images or footage, and never measures how a post performed.',
    footer: (
      <>
        <PlanLink plan="practice" />. Shape the idea and write its words;{' '}
        <PlanLink plan="direction" />. Add images and recordings, and carry as many projects as you shoot.
      </>
    ),
  },
  {
    key: 'songs',
    tab: 'Songwriters',
    name: 'Songwriters',
    hue: 'violet',
    tier: 'practice',
    plans: 'Practice / Direction',
    who: 'You hum before you write, and the song usually knows what it is about before you do.',
    steps: [
      'Speak the idea. Everything here takes your voice as readily as your typing.',
      'Find what the song is about before the tune hardens.',
      'Write the lyric in parts you name yourself, and talk over the line that will not sit.',
      <>On <PlanLink plan="direction">Direction</PlanLink>, keep your recordings beside the lyric on the project&rsquo;s canvas.</>,
    ],
    never: 'You can upload recordings, but Companheiro never listens to them. Those are for your ears only.',
    footer: (
      <>
        <PlanLink plan="practice" />. Craft the words and devise the vision;{' '}
        <PlanLink plan="direction" />. Upload audio recordings and talk to your long-term vision.
      </>
    ),
  },
  {
    key: 'studios',
    tab: 'Professionals',
    name: 'One-person studios',
    hue: 'tide',
    tier: 'direction',
    plans: 'Direction',
    who: 'You are the whole studio: client projects, your own work, and one head to hold all of it.',
    steps: [
      'Paste the brief and talk it through until you know what the project is really for.',
      'Give each project its own canvas: its pieces, images, recordings and a task list.',
      'Run threads across the pieces, so what connects them stays in view.',
      'Mention a constraint once. It comes back as a question when new work runs against it.',
    ],
    never: 'It never posts, sends or speaks to a client in your name.',
    footer: <><PlanLink plan="direction" />. As many projects in progress as you carry, each on its own canvas.</>,
  },
  {
    key: 'directors',
    tab: 'Directors',
    name: 'Creative directors',
    hue: 'violet',
    tier: 'direction',
    plans: 'Direction',
    who: 'You direct work other people make, or a project that runs for years: a documentary, a photo book, an album.',
    steps: [
      'Write down what the project is meant to be, and the rules it must keep.',
      'Talk the whole project through from its canvas whenever something shifts.',
      'When a new piece pulls away from a rule, you get a question, never a verdict.',
      'Change the piece or change the rule. Either way, somebody decided.',
    ],
    never: 'It never scores the work and never measures how it performed.',
    footer: <><PlanLink plan="direction" />. Yearly suits a project that runs for years, with two months free.</>,
  },
]

function AudienceBegin({ audience }: { audience: Audience }) {
  const href = useAttributedHref(`${SIGNUP}?landing=for-${audience.key}`)
  return (
    <Link
      href={href}
      className="group inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[var(--bone)] px-5 py-2.5 text-[14px] font-semibold text-[var(--ink)] transition-[transform,opacity] duration-300 hover:opacity-90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ember)]"
    >
      Begin
      <ArrowRight size={15} strokeWidth={2} className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
    </Link>
  )
}

// Direction's tabs are a step brighter than Practice's; its panels are the
// same glass, in the same family of colours, so no audience reads as the
// one the page is really for.
const PRACTICE_TAB = { rest: { backgroundColor: shell.fill, color: shell.muted }, on: { backgroundColor: shell.text, color: shell.ink } }
const DIRECTION_TAB = { rest: { backgroundColor: alpha(shell.text, 0.14), color: alpha(shell.text, 0.82) }, on: { backgroundColor: shell.text, color: shell.ink } }

function WhoFor() {
  const ref = useRef<HTMLElement>(null)
  const [index, setIndex] = useState(0)
  const audience = AUDIENCES[index]
  useSectionMood(ref, audience.hue as Mood)
  // A link can open on one audience. Read in the browser: the page itself is static.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('for')
    const i = AUDIENCES.findIndex((a) => a.key === wanted)
    if (i >= 0) setIndex(i)
  }, [])
  const hue = hues[audience.hue]

  return (
    <section id="who" ref={ref} className="mx-auto w-full max-w-[1180px] scroll-mt-8 px-4 py-20 md:px-8 md:py-32">
      <Reveal>
        <h2 className={`max-w-[16ch] ${H2}`}>Who it&rsquo;s for.</h2>
        <p className="mt-5 max-w-[50ch] text-[17px] leading-relaxed text-[var(--muted)]">
          Six kinds of makers, and what each one does with it. Pick the one closest to you.
        </p>
      </Reveal>

      <Reveal delay={0.08} className="mt-9 md:mt-12">
        {/* Bleeds to the screen edge on a phone so the row can be swiped, not wrapped. */}
        <div
          role="tablist"
          aria-label="Who it is for"
          className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {AUDIENCES.map((a, i) => {
            const look = a.tier === 'direction' ? DIRECTION_TAB : PRACTICE_TAB
            const firstOfDirection = a.tier === 'direction' && AUDIENCES[i - 1]?.tier !== 'direction'
            return (
              <span key={a.key} className="flex shrink-0 items-center gap-1.5">
                {/* Where Practice's makers end and Direction's begin. */}
                {firstOfDirection && <span aria-hidden className="mx-2 h-6 w-px shrink-0 bg-[var(--line)]" />}
                <button
                  type="button"
                  role="tab"
                  id={`who-tab-${a.key}`}
                  aria-selected={i === index}
                  aria-controls="who-panel"
                  onClick={() => setIndex(i)}
                  className="shrink-0 cursor-pointer rounded-full px-4 py-2.5 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ember)]"
                  style={i === index ? look.on : look.rest}
                >
                  {a.tab}
                </button>
              </span>
            )
          })}
        </div>

        <m.div
          key={audience.key}
          id="who-panel"
          role="tabpanel"
          aria-labelledby={`who-tab-${audience.key}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          className="mt-4 overflow-hidden rounded-[28px] border border-[var(--line)] bg-[var(--fill)]"
          style={{ borderTop: `2px solid ${alpha(hue, 0.7)}` }}
        >
          <div className="grid grid-cols-1 gap-8 p-6 md:grid-cols-[0.9fr_1.1fr] md:gap-14 md:p-10">
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: hue }}>{audience.plans}</p>
              <h3 className="mt-3 text-balance text-[26px] font-bold leading-[1.1] tracking-[-0.025em] text-[var(--bone)] md:text-[34px]">{audience.name}</h3>
              <p className="mt-4 max-w-[40ch] text-[16px] leading-relaxed text-[var(--muted)] md:text-[17px]">{audience.who}</p>
              <p className="mt-6 flex max-w-[40ch] items-start gap-2.5 text-[15px] leading-relaxed text-[var(--bone)]">
                <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: hue }} />
                {audience.never}
              </p>
            </div>
            <div>
              <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">How you&rsquo;d use it</p>
              <ol className="mt-4 flex flex-col">
                {audience.steps.map((step, i) => (
                  <li key={i} className="flex items-start gap-4 border-t border-[var(--line)] py-4 first:border-t-0 first:pt-0 last:pb-0">
                    <span className="w-5 shrink-0 text-[15px] font-semibold tabular-nums" style={{ color: hue }}>{i + 1}</span>
                    <span className="text-[16px] leading-relaxed text-[var(--bone)]">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="flex flex-col gap-4 border-t border-[var(--line)] px-6 py-5 md:flex-row md:items-center md:justify-between md:px-10">
            <p className="max-w-[64ch] text-[15px] leading-relaxed text-[var(--muted)]">{audience.footer}</p>
            <AudienceBegin audience={audience} />
          </div>
        </m.div>
      </Reveal>
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
        <Replay loops>{(p) => <RuleHeardMockup {...p} />}</Replay>
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
// Every line under a plan must be something lib/billing/entitlements.ts
// actually gives that plan; change the two together.

type Billing = 'month' | 'year'

const PLANS = [
  {
    id: 'practice',
    name: 'Practice',
    line: 'For one or two visions at a time, in words.',
    features: [
      'Two active projects at a time',
      'One project holds as many pieces as it needs',
      'Unlimited personal check-ins',
      'Define and conceptualise new ideas',
      'Find and hold your vision',
      'Access to the writing suite, with questions when you are stuck',
      'A task list on your canvas',
      'Bring in another by resting one for 14 days',
    ],
  },
  {
    id: 'direction',
    name: 'Direction',
    line: 'For many visions at once, in any medium.',
    features: [
      'Everything in Practice',
      'Have access to unlimited active projects',
      'The full canvas: threads that run across your pieces',
      'Images and recordings beside your words',
      'Talk the whole vision through, from its canvas',
    ],
  },
] as const

/**
 * A plan's own button is for someone who has decided: it carries the plan
 * through sign-up straight to checkout, with no free month in between
 * (lib/billing/chosen-plan.ts). The free month stays one line below it.
 */
function PlanButton({ lead, plan, billing }: { lead: boolean; plan: 'practice' | 'direction'; billing: Billing }) {
  const { t } = useTheme()
  const href = useAttributedHref(`${SIGNUP}?plan=${plan}&interval=${billing === 'year' ? 'yearly' : 'monthly'}`)
  const freeHref = useAttributedHref(SIGNUP)
  return (
    <>
      <Link
        href={href}
        className="group inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 py-3 text-[15px] font-semibold transition-transform duration-300 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ember)]"
        style={lead ? { backgroundColor: t.inverseBg, color: t.inverseText } : { backgroundColor: t.cardBgInner, color: t.textPrimary }}
      >
        Subscribe
        <ArrowRight size={16} strokeWidth={2} className="transition-transform duration-300 group-hover:translate-x-0.5" aria-hidden />
      </Link>
      <p style={{ ...typeRoles.small, color: t.textMuted, marginTop: 10, textAlign: 'center' }}>
        or{' '}
        <Link href={freeHref} style={{ color: t.textSecondary, textDecoration: 'underline', textUnderlineOffset: 3 }}>
          try everything free for 30 days
        </Link>
      </p>
    </>
  )
}

function PlanCard({ plan, billing, lead }: { plan: (typeof PLANS)[number]; billing: Billing; lead: boolean }) {
  const { t } = useTheme()
  // In the visitor's own currency once Stripe has answered (lib/billing/use-prices.ts).
  const prices = usePrices()
  const amount = prices.money(plan.id, billing === 'year' ? 'yearly' : 'monthly')
  const perMonth = billing === 'year' ? formatMoney(Math.round(prices.amounts[plan.id].yearly / 12), prices.currency) : null
  return (
    <Card padding={lead ? 30 : 26} style={{ height: '100%', display: 'flex', flexDirection: 'column', borderTop: lead ? `3px solid ${t.ember}` : undefined }}>
      <div className="flex items-center justify-between gap-3">
        <p style={{ ...typeRoles.h2, fontSize: lead ? 26 : 22, color: t.textPrimary }}>{plan.name}</p>
        {lead && <Pill hue="ember">Many visions</Pill>}
      </div>
      <p style={{ ...typeRoles.ui, color: t.textSecondary, marginTop: 6 }}>{plan.line}</p>
      <div className="mt-6 flex items-baseline gap-1.5">
        <span style={{ ...typeRoles.display, fontSize: lead ? 48 : 40, color: t.textPrimary }}>{amount}</span>
        <span style={{ ...typeRoles.ui, color: t.textMuted }}>a {billing}</span>
      </div>
      <p style={{ ...typeRoles.small, color: t.textMuted, marginTop: 4, minHeight: '1.5em' }}>
        {perMonth ? `${perMonth} a month, two months free` : 'Or yearly, with two months free'}
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
        <PlanButton lead={lead} plan={plan.id} billing={billing} />
      </div>
    </Card>
  )
}

const PRICING_FACTS = [
  { title: '30 days free', body: 'No card needed to start, and everything in Direction to try.' },
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
          Practice for two projects in words. Direction for many, in any medium. Move between them whenever you like.
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
            <div id="plan-practice" className="scroll-mt-24"><PlanCard plan={PLANS[0]} billing={billing} lead={false} /></div>
            <div id="plan-direction" className="scroll-mt-24"><PlanCard plan={PLANS[1]} billing={billing} lead /></div>
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
          Bring one note, one draft, one brief, one thing you keep circling. The vision is usually already in there.
        </p>
        <div className="mt-10">
          <BeginButton />
        </div>
        <p className="mt-5 text-[13px] text-[var(--muted)]">30 days free. No card needed.</p>
      </Reveal>
    </section>
  )
}

// ── Who makes it: the one piece of proof the page can honestly carry ────────

function Maker() {
  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 pb-16 md:px-8 md:pb-24">
      <Reveal>
        <div className="grid grid-cols-1 gap-3 border-t border-[var(--line)] pt-8 md:grid-cols-[220px_1fr] md:gap-10">
          <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">Who makes it</p>
          <p className="max-w-[58ch] text-[17px] leading-relaxed text-[var(--bone)]">
            Companheiro is built and run by one person, not a team.
            {CONTACT_EMAIL ? (
              <>
                {' '}If something here is unclear, or it isn&rsquo;t working for the way you make things,{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="underline decoration-[var(--line)] underline-offset-4 transition-colors hover:text-white">
                  write to me
                </a>{' '}
                and I&rsquo;ll answer myself.
              </>
            ) : null}
          </p>
        </div>
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
            <WhoFor />
            <Never />
            <Closing />
            <Pricing />
            <FinalCta />
            <Maker />
          </main>
          <Footer />
        </div>
      </div>
    </MoodContext.Provider>
  )
}
