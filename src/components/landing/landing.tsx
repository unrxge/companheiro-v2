'use client'

// Public landing page (signed-out visitors at `/`).
//
// Built against the design-taste-frontend skill: one theme (the Inner Weather
// shell is constant ink by brand decision, so the page does not flip with
// prefers-color-scheme), one accent (ember), Geist only, pill buttons +
// 22px image radius. Motion is limited to reveals that carry the story, and
// everything collapses to static under prefers-reduced-motion.

import Image from 'next/image'
import Link from 'next/link'
import { useRef } from 'react'
import { ArrowRight } from 'lucide-react'
import { motion as m, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'
import { Atmosphere } from '@/components/shell/atmosphere'
import { alpha, radius, shell, tokensFor } from '@/lib/design-tokens'

const ember = tokensFor('dark').ember
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

// Tokens exposed as CSS variables so Tailwind classes can use them without
// hard-coding a colour in this file.
const vars = {
  '--ink': shell.ink,
  '--ink-2': shell.ink2,
  '--bone': shell.text,
  '--muted': shell.muted,
  '--line': shell.line,
  '--fill': shell.fill,
  '--ember': ember,
  '--ember-soft': alpha(ember, 0.16),
  '--r-img': `${radius.card}px`,
  colorScheme: 'dark',
} as React.CSSProperties

const SIGNUP = '/signup'
const LOGIN = '/login'

// ── Shared pieces ────────────────────────────────────────────────────────────

function BeginButton({ className = '' }: { className?: string }) {
  return (
    <Link
      href={SIGNUP}
      className={`group inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[var(--bone)] px-6 py-3 text-[15px] font-semibold text-[var(--ink)] transition-[transform,background-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-white/90 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ember)] ${className}`}
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

// ── Hero: asymmetric split ───────────────────────────────────────────────────

function Hero() {
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
    <section className="mx-auto grid w-full max-w-[1180px] grid-cols-1 items-center gap-10 px-4 pb-16 pt-8 md:px-8 md:pb-20 md:pt-12 lg:min-h-[calc(100dvh-72px)] lg:grid-cols-[1.2fr_0.8fr] lg:gap-14">
      <div className="max-w-[640px]">
        <m.h1
          {...enter(0)}
          className="text-[40px] font-bold leading-[1.04] tracking-[-0.035em] text-balance text-[var(--bone)] md:text-[52px] xl:text-[60px]"
        >
          You <span className="text-[var(--ember)]">already</span> know what you want to make.
        </m.h1>
        <m.p {...enter(1)} className="mt-6 max-w-[44ch] text-[17px] leading-relaxed text-[var(--muted)] md:text-[18px]">
          You just can&rsquo;t say it yet. Companheiro listens while you talk it through, and hands it back in words you recognise.
        </m.p>
        <m.div {...enter(2)} className="mt-9">
          <BeginButton />
        </m.div>
      </div>

      <m.div
        initial={reduce ? false : { opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.4, delay: 0.1, ease: EASE }}
        className="relative aspect-[4/3] w-full overflow-hidden rounded-[var(--r-img)] bg-[var(--ink-2)] lg:aspect-[4/5] lg:max-h-[min(72dvh,660px)] lg:justify-self-end"
      >
        <Image
          src="https://picsum.photos/id/338/1000/1250"
          alt="A person in a hooded jumper standing at the edge of the sea, looking out at the water."
          fill
          priority
          sizes="(min-width: 1024px) 40vw, 100vw"
          className="object-cover object-[60%_center]"
        />
      </m.div>
    </section>
  )
}

// ── Manifesto: words come up as you read ─────────────────────────────────────

const MANIFESTO =
  'It usually starts as something you can’t quite name. A line you keep coming back to. A feeling that wants a form. Most tools expect you to know what it is already. Companheiro starts before that.'

function Word({ word, progress, range }: { word: string; progress: MotionValue<number>; range: [number, number] }) {
  const opacity = useTransform(progress, range, [0.16, 1])
  return <m.span style={{ opacity }}>{word} </m.span>
}

function Manifesto() {
  const ref = useRef<HTMLParagraphElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.85', 'end 0.45'] })
  const words = MANIFESTO.split(' ')

  return (
    <section className="mx-auto w-full max-w-[1000px] px-4 py-24 md:px-8 md:py-40">
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

// ── How it works: pinned heading + image, sequence on the right ──────────────

const MOVEMENTS = [
  {
    title: 'Talk it through',
    body: 'Say it however it comes out. Speak or type, for ten seconds or an hour. Nothing needs sorting first.',
  },
  {
    title: 'Answer one question at a time',
    body: 'It asks, gently and in order, until the idea fits in a sentence you would stand behind.',
  },
  {
    title: 'Keep hold of it',
    body: 'It remembers what you said mattered, and tells you plainly when the work starts drifting away from it.',
  },
]

function HowItListens() {
  return (
    <section className="mx-auto grid w-full max-w-[1180px] grid-cols-1 gap-12 px-4 py-20 md:grid-cols-[0.95fr_1.05fr] md:gap-20 md:px-8 md:py-32">
      <div className="md:sticky md:top-24 md:self-start">
        <Reveal>
          <h2 className="max-w-[16ch] text-balance text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-[var(--bone)] md:text-[44px]">
            It listens first. Then it asks.
          </h2>
        </Reveal>
        <Reveal delay={0.1} className="relative mt-10 aspect-[16/10] w-full overflow-hidden rounded-[var(--r-img)] bg-[var(--ink-2)]">
          <Image
            src="https://picsum.photos/id/334/1200/750"
            alt="Someone walking along a misty shoreline carrying a guitar."
            fill
            sizes="(min-width: 768px) 45vw, 100vw"
            className="object-cover"
          />
        </Reveal>
      </div>

      <ol className="flex flex-col gap-14 md:gap-24 md:pt-40">
        {MOVEMENTS.map((mv, i) => (
          <li key={mv.title}>
            <Reveal delay={i * 0.06} className="border-l-2 border-[var(--ember-soft)] pl-6 md:pl-8">
              <h3 className="text-[22px] font-semibold tracking-[-0.02em] text-[var(--bone)] md:text-[26px]">{mv.title}</h3>
              <p className="mt-3 max-w-[42ch] text-[16px] leading-relaxed text-[var(--muted)] md:text-[17px]">{mv.body}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  )
}

// ── Being heard: an example exchange, offset ─────────────────────────────────

function Heard() {
  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 py-20 md:px-8 md:py-32">
      <Reveal>
        <h2 className="max-w-[20ch] text-balance text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-[var(--bone)] md:text-[44px]">
          The moment it clicks is hearing it said back.
        </h2>
      </Reveal>

      <div className="mt-14 grid grid-cols-1 gap-8 md:mt-20 md:grid-cols-12 md:gap-6">
        <Reveal className="md:col-span-6">
          <p className="text-[13px] font-medium text-[var(--muted)]">You, talking</p>
          <p className="mt-3 text-[18px] leading-[1.55] text-[var(--muted)] md:text-[20px]">
            &ldquo;I keep trying to write about my dad&rsquo;s garage, but it turns into a list of tools. I don&rsquo;t care about the tools. It&rsquo;s more that we never really talked in there.&rdquo;
          </p>
        </Reveal>

        <Reveal delay={0.35} className="md:col-span-6 md:col-start-6 md:mt-24">
          <div className="border-l-2 border-[var(--ember)] pl-6 md:pl-8">
            <p className="text-[13px] font-medium text-[var(--ember)]">Companheiro</p>
            <p className="mt-3 text-[22px] font-medium leading-[1.4] tracking-[-0.015em] text-[var(--bone)] md:text-[26px]">
              &ldquo;Then maybe the garage isn&rsquo;t the subject. The silence is, and what it taught you. The tools could be the way in. Does that sound right?&rdquo;
            </p>
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.1}>
        <p className="mt-12 text-[13px] text-[var(--muted)] md:mt-16">An example conversation, written to show how it responds.</p>
      </Reveal>
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
  return (
    <section className="mx-auto w-full max-w-[1180px] px-4 py-20 md:px-8 md:py-32">
      <Reveal>
        <h2 className="text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-[var(--bone)] md:text-[44px]">What it will never do.</h2>
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

// ── Closing: full-bleed image band ───────────────────────────────────────────

function Closing() {
  return (
    <section className="px-4 pb-10 pt-10 md:px-8 md:pb-16">
      <div className="relative mx-auto w-full max-w-[1180px] overflow-hidden rounded-[var(--r-img)] bg-[var(--ink-2)]">
        <Image
          src="https://picsum.photos/id/213/1800/1000"
          alt="Early light over a calm sea covered in low fog."
          fill
          sizes="(min-width: 1180px) 1180px, 100vw"
          className="object-cover"
        />
        {/* Scrim so bone text holds AA contrast over the bright sky. */}
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[var(--ink)] via-[var(--ink)]/70 to-[var(--ink)]/20" />
        <div className="relative flex min-h-[460px] flex-col justify-end px-6 py-10 md:min-h-[560px] md:px-14 md:py-14">
          <Reveal>
            <h2 className="max-w-[16ch] text-balance text-[34px] font-bold leading-[1.06] tracking-[-0.03em] text-[var(--bone)] md:text-[52px]">
              It remembers where you left off.
            </h2>
            <p className="mt-5 max-w-[44ch] text-[17px] leading-relaxed text-[var(--bone)]/80">
              Come back tomorrow or in three months. Your ideas, your words and what you decided will be where you left them.
            </p>
            <div className="mt-8">
              <BeginButton />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-[1180px] flex-col gap-4 px-4 pb-[max(32px,env(safe-area-inset-bottom))] pt-6 text-[13px] text-[var(--muted)] md:flex-row md:items-center md:justify-between md:px-8">
      <span>&copy; {new Date().getFullYear()} Companheiro</span>
      <Link href={LOGIN} className="self-start transition-colors hover:text-[var(--bone)] md:self-auto">
        Log in
      </Link>
    </footer>
  )
}

export function Landing() {
  return (
    <div style={vars} className="relative min-h-[100dvh] overflow-x-clip bg-[var(--ink)] font-[family-name:var(--font-geist-sans)] text-[var(--bone)]">
      <Atmosphere mood="ember" intensity={0.55} />
      <div className="relative z-[1]">
        <Nav />
        <main>
          <Hero />
          <Manifesto />
          <HowItListens />
          <Heard />
          <Never />
          <Closing />
        </main>
        <Footer />
      </div>
    </div>
  )
}
