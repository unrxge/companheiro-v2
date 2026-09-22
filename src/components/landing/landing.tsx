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
import { ArrowRight } from 'lucide-react'
import { motion as m, useInView, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { Atmosphere } from '@/components/shell/atmosphere'
import { alpha, shell, tokensFor, type Mood } from '@/lib/design-tokens'
import { CanvasMockup, HeardMockup, LeftOffMockup, MovementStage, MOVEMENT_VISUALS, VisionFinder } from './mockups'

const ember = tokensFor('dark').ember
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
  return (
    <Link
      href={SIGNUP}
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
      <Link
        href={LOGIN}
        className="rounded-full px-4 py-2 text-[14px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--fill)] hover:text-[var(--bone)]"
      >
        Log in
      </Link>
    </header>
  )
}

// ── Hero: asymmetric split, the vision assembles from fragments ─────────────

function Hero() {
  const ref = useRef<HTMLElement>(null)
  useSectionMood(ref, 'ember')
  const reduce = useReducedMotion()
  const enter = (i: number) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 18 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.9, delay: 0.15 + i * 0.12, ease: EASE },
        }

  return (
    <section
      ref={ref}
      className="mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-12 px-4 pb-16 pt-8 md:px-8 md:pb-20 md:pt-12 lg:min-h-[calc(100dvh-72px)] lg:grid-cols-[1.15fr_0.85fr] lg:gap-14"
    >
      <div className="max-w-[640px]">
        <m.h1
          {...enter(0)}
          className="text-balance text-[44px] font-bold leading-[1.04] tracking-[-0.035em] text-[var(--bone)] md:text-[60px] xl:text-[72px]"
        >
          {/* Same pairing as the brand document: Geist headline, one word in Newsreader italic. */}
          You already have a{' '}
          <span className="font-[family-name:var(--font-newsreader)] font-normal italic tracking-[-0.01em] text-[var(--ember)]">vision</span>.
        </m.h1>
        <m.p {...enter(1)} className="mt-6 max-w-[44ch] text-[17px] leading-relaxed text-[var(--muted)] md:text-[18px]">
          It&rsquo;s scattered across your notes, drafts and half-finished things. Companheiro helps you find it, hold it, and build from it.
        </m.p>
        <m.div {...enter(2)} className="mt-9">
          <BeginButton />
        </m.div>
      </div>

      <m.div
        initial={reduce ? false : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.1, delay: 0.3, ease: EASE }}
        className="w-full max-w-[480px] lg:justify-self-end"
      >
        <VisionFinder />
      </m.div>
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
    <section ref={sectionRef} className="mx-auto w-full max-w-[1000px] px-4 py-24 md:px-8 md:py-40">
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

// ── Find, hold, talk: sticky stage on the left, movements on the right ──────

const MOVEMENTS: { title: string; body: string; mood: Mood }[] = [
  {
    title: 'Find the vision',
    body: 'Bring notes, drafts and voice memos. It asks one question at a time until your vision fits in a sentence you would stand behind.',
    mood: 'ochre',
  },
  {
    title: 'Hold it steady',
    body: 'Your vision is written down, dated and kept. When new work pulls away from it, you get a question, never a verdict.',
    mood: 'violet',
  },
  {
    title: 'Talk to it whenever',
    body: 'Speak or type when something comes up, for ten seconds or an hour. It remembers what mattered, so you never file anything.',
    mood: 'tide',
  },
]

function Movement({ index, active, onActive }: { index: number; active: boolean; onActive: (i: number) => void }) {
  const ref = useRef<HTMLLIElement>(null)
  const inView = useSectionMood(ref, MOVEMENTS[index].mood)
  useEffect(() => {
    if (inView) onActive(index)
  }, [inView, index, onActive])
  const mv = MOVEMENTS[index]
  const Visual = MOVEMENT_VISUALS[index]
  return (
    <li ref={ref} className="md:flex md:min-h-[62vh] md:items-center">
      <Reveal>
        <div
          className="border-l-2 pl-6 transition-colors duration-500 md:pl-8"
          style={{ borderColor: active ? ember : alpha(ember, 0.16) }}
        >
          <h3
            className="text-[22px] font-semibold tracking-[-0.02em] transition-colors duration-500 md:text-[28px]"
            style={{ color: active ? shell.text : shell.muted }}
          >
            {mv.title}
          </h3>
          <p className="mt-3 max-w-[42ch] text-[16px] leading-relaxed text-[var(--muted)] md:text-[17px]">{mv.body}</p>
        </div>
        {/* Below md there is no sticky stage: each movement carries its own visual. */}
        <div className="mt-8 md:hidden">
          <Visual />
        </div>
      </Reveal>
    </li>
  )
}

function HowItListens() {
  const [active, setActive] = useState(0)
  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 py-20 md:px-8 md:py-28">
      <Reveal>
        <h2 className={`max-w-[16ch] ${H2}`}>Find it. Hold it. Build from it.</h2>
      </Reveal>
      <div className="mt-12 grid grid-cols-1 gap-16 md:mt-4 md:grid-cols-[1fr_0.9fr] md:gap-16">
        <div className="hidden md:sticky md:top-[18vh] md:block md:self-start md:pt-[10vh]">
          <MovementStage active={active} />
        </div>
        <ol className="flex flex-col gap-16 md:gap-0">
          {MOVEMENTS.map((mv, i) => (
            <Movement key={mv.title} index={i} active={active === i} onActive={setActive} />
          ))}
        </ol>
      </div>
    </section>
  )
}

// ── The canvas: full-width, draggable ───────────────────────────────────────

const CANVAS_FACTS = [
  'Any medium: essays, songs, photographs, film.',
  'Several visions at once, each on its own canvas.',
  'Images and recordings are for your eyes. It only reads what you write about them.',
]

function WholeVision() {
  const ref = useRef<HTMLElement>(null)
  useSectionMood(ref, 'verdant')
  return (
    <section ref={ref} className="mx-auto w-full max-w-[1180px] px-4 py-20 md:px-8 md:py-32">
      <Reveal>
        <h2 className={`max-w-[18ch] ${H2}`}>See the whole vision at once.</h2>
        <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-[var(--muted)]">
          Every piece laid out side by side on a canvas that goes as far as you need. Threads show what connects, so the shape of the work is visible.
        </p>
      </Reveal>
      <Reveal delay={0.1} className="mt-12 md:mt-16">
        <CanvasMockup />
      </Reveal>
      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3 md:gap-10">
        {CANVAS_FACTS.map((f, i) => (
          <Reveal key={f} delay={i * 0.06}>
            <p className="max-w-[34ch] border-t border-[var(--line)] pt-4 text-[15px] leading-relaxed text-[var(--muted)]">{f}</p>
          </Reveal>
        ))}
      </div>
    </section>
  )
}

// ── Being heard: the real conversation surface, stacked ─────────────────────

function Heard() {
  const ref = useRef<HTMLElement>(null)
  useSectionMood(ref, 'tide')
  return (
    <section ref={ref} className="mx-auto w-full max-w-[860px] px-4 py-20 md:px-8 md:py-32">
      <Reveal>
        <h2 className={`max-w-[20ch] ${H2}`}>The moment it clicks is hearing it said back.</h2>
      </Reveal>
      <Reveal delay={0.1} className="mt-12 md:mt-16">
        <HeardMockup />
      </Reveal>
      <p className="mt-6 text-[13px] text-[var(--muted)]">An example conversation, written to show how it responds.</p>
    </section>
  )
}

// ── What it will never do: 2 x 2 ─────────────────────────────────────────────

const NEVER = [
  { title: 'Make the work for you', body: 'It can ask and suggest. Every sentence you keep is one you chose.' },
  { title: 'Tell you whether it’s good', body: 'It helps you see what you meant. It never grades what you made.' },
  { title: 'Keep score', body: 'No likes, no views, no streaks. Nothing here measures how the work performed.' },
  { title: 'Speak for you', body: 'It talks only to you. It never posts or sends anything in your name.' },
]

function Never() {
  const ref = useRef<HTMLElement>(null)
  useSectionMood(ref, 'ember')
  return (
    <section ref={ref} className="mx-auto w-full max-w-[1180px] px-4 py-20 md:px-8 md:py-32">
      <Reveal>
        <h2 className={H2}>What it will never do.</h2>
      </Reveal>
      <div className="mt-12 grid grid-cols-1 gap-x-16 gap-y-12 border-t border-[var(--line)] pt-12 md:mt-16 md:grid-cols-2 md:gap-y-16 md:pt-16">
        {NEVER.map((n, i) => (
          <Reveal key={n.title} delay={(i % 2) * 0.08}>
            <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-[var(--bone)] md:text-[22px]">{n.title}</h3>
            <p className="mt-2 max-w-[40ch] text-[16px] leading-relaxed text-[var(--muted)]">{n.body}</p>
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
        <LeftOffMockup />
      </Reveal>
      <Reveal delay={0.1} className="order-1 md:order-2">
        <h2 className={`max-w-[16ch] ${H2} md:text-[52px]`}>It remembers where you left off.</h2>
        <p className="mt-5 max-w-[44ch] text-[17px] leading-relaxed text-[var(--muted)]">
          Come back tomorrow or in three months. Your vision, your words and every decision will be where you left them.
        </p>
        <div className="mt-8">
          <BeginButton />
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 border-t border-[var(--line)] px-4 pb-[max(32px,env(safe-area-inset-bottom))] pt-6 text-[13px] text-[var(--muted)] md:flex-row md:items-center md:justify-between md:px-8">
      <span>&copy; {new Date().getFullYear()} Companheiro</span>
      <Link href={LOGIN} className="self-start transition-colors hover:text-[var(--bone)] md:self-auto">
        Log in
      </Link>
    </footer>
  )
}

export function Landing() {
  const [mood, setMood] = useState<Mood>('ember')
  return (
    <MoodContext.Provider value={setMood}>
      <div style={vars} className="relative min-h-[100dvh] overflow-x-clip bg-[var(--ink)] font-[family-name:var(--font-geist-sans)] text-[var(--bone)]">
        <Atmosphere mood={mood} intensity={1} />
        <div className="relative z-[1]">
          <Nav />
          <main>
            <Hero />
            <Manifesto />
            <HowItListens />
            <WholeVision />
            <Heard />
            <Never />
            <Closing />
          </main>
          <Footer />
        </div>
      </div>
    </MoodContext.Provider>
  )
}
