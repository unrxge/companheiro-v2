'use client'

// The tour: seven slides, one part of the app each, in the order a new person
// will meet them (talk, find a question, shape the concept, track it, write
// it, be known), with Capture last. It opens once, right after an account is
// activated, and again from Settings.
//
// On a phone it is a page of its own. From 1024px it is a card over whatever
// is behind it (the tour page puts the Home screen there), which it blurs.
//
// The carousel is a native scroll-snap track, so a swipe on a phone is the
// browser's own; the buttons, dots and arrow keys scroll the same track.
// Each slide's visual (widgets.tsx) starts when its slide arrives. The shell
// mood follows the slide and stays in the cool hues (tide, violet, verdant):
// ember is what the landing page and sign-in look like, and this is inside.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Atmosphere } from '@/components/shell/atmosphere'
import { PrimaryButton } from '@/components/ui/buttons'
import { fonts, radius, shell, tokensFor, type as typeRoles, type Hue } from '@/lib/design-tokens'
import { BoardWidget, CaptureWidget, CheckInWidget, ConceptualiseWidget, PortraitWidget, SummonWidget, WritingWidget, type TourWidgetProps } from './widgets'

const hues = tokensFor('dark')
const FADE = 'linear-gradient(to bottom, #000 calc(100% - 28px), transparent 100%)'

const SLIDES: { where: string; title: string; body: string; mood: Hue; Widget: (p: TourWidgetProps) => React.ReactNode }[] = [
  {
    where: 'Check-in',
    title: 'Talk through what’s on your mind.',
    body: 'Check-in whenever something is on your mind, about your work or your day. Speak or type, press Send, and Companheiro answers you.',
    mood: 'tide',
    Widget: CheckInWidget,
  },
  {
    where: 'Idea Lab',
    title: 'Systemize your creativity.',
    body: 'No need to wait for the creative muse to “drop down from the heavens”. Pick a theme you care about, and the ‘Idea Lab’ gives you a question worth making something from, every time you sit down.',
    mood: 'violet',
    Widget: SummonWidget,
  },
  {
    where: 'Idea Lab · Conceptualise',
    title: 'Turn a rough idea into a clear one.',
    body: 'When an idea is still a cloud, too big or too many to put into words, ‘Conceptualise’ helps you pull its voice down from the abstract, one question at a time, until you can declare your concept in one clear sentence.',
    mood: 'verdant',
    Widget: ConceptualiseWidget,
  },
  {
    where: 'Project Board',
    title: 'Keep track of everything you’re making.',
    body: 'Every idea becomes a project. The board is there to help you finish more of them: you always see what you’re working on now, what’s waiting its turn, and how much you’ve already brought to the end.',
    mood: 'tide',
    Widget: BoardWidget,
  },
  {
    where: 'Writing',
    title: 'Stuck on a line? Talk it over.',
    body: 'Select any line to talk about it. Companheiro asks questions and reflects things back until you can see what you meant. The writing is always yours.',
    mood: 'violet',
    Widget: WritingWidget,
  },
  {
    where: 'Portrait',
    title: 'Discover your own patterns.',
    body: 'The more you use the app, the more of your own patterns you get to see: what keeps returning in your work, how you think things through, what actually helps you. ‘Portrait’ shows them to you, and you can remove any that aren’t true.',
    mood: 'verdant',
    Widget: PortraitWidget,
  },
  {
    where: 'Capture',
    title: 'Save work that inspires you.',
    body: 'Moved by someone else’s video, post or article? Paste its link from Instagram, YouTube or anywhere, and note what caught your eye.',
    mood: 'tide',
    Widget: CaptureWidget,
  },
]

export function Tour({ firstRun, onLeave }: { firstRun: boolean; onLeave: () => void }) {
  const reduce = useReducedMotion()
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  // How many times each slide has come up: its widget's key, so it plays from the start on every arrival.
  const [runs, setRuns] = useState(() => SLIDES.map(() => 0))
  const last = index === SLIDES.length - 1

  useEffect(() => {
    setRuns((r) => r.map((n, i) => (i === index ? n + 1 : n)))
  }, [index])

  const go = useCallback(
    (i: number) => {
      const el = track.current
      if (!el) return
      const to = Math.max(0, Math.min(SLIDES.length - 1, i))
      el.scrollTo({ left: to * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' })
    },
    [reduce]
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

  // The page behind (Home, on a desktop) must not scroll under the card.
  useEffect(() => {
    const was = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = was }
  }, [])

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-[#0d0c0b] lg:items-center lg:justify-center lg:bg-[rgba(13,12,11,0.55)] lg:p-8 lg:backdrop-blur-[16px]" style={{ fontFamily: fonts.ui }}>
    {/* The transform makes this the box the (fixed) Atmosphere fills, so on a desktop the sky stays inside the card. */}
    <div
      role="dialog"
      aria-modal="true"
      aria-label="How Companheiro works"
      className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden lg:h-[calc(100dvh-64px)] lg:max-h-[720px] lg:max-w-[1040px] lg:flex-none lg:rounded-[28px] lg:border lg:border-[rgba(236,233,226,0.14)] lg:shadow-[0_40px_120px_rgba(0,0,0,0.6)]"
      style={{ background: shell.ink, transform: 'translateZ(0)' }}
    >
      <Atmosphere mood={SLIDES[index].mood} cycle={false} />

      <header className="relative z-[1] mx-auto flex w-full max-w-[520px] shrink-0 items-center justify-between px-5 pb-4 pt-[max(18px,env(safe-area-inset-top))] lg:pb-2 lg:max-w-[1080px] lg:px-10 lg:pt-5">
        <span className="flex items-center gap-2.5" style={{ ...typeRoles.ui, fontWeight: 600, letterSpacing: '-0.01em', color: shell.text }}>
          <img src="/favicon.svg" alt="" width={20} height={20} />
          Companheiro
        </span>
        <button
          type="button"
          onClick={onLeave}
          className="cursor-pointer rounded-full px-4 transition-colors hover:bg-[rgba(236,233,226,0.06)]"
          style={{ ...typeRoles.small, fontSize: 14, fontWeight: 500, color: shell.muted, background: 'none', border: 'none', height: 44, marginRight: -16 }}
        >
          {firstRun ? 'Skip' : 'Close'}
        </button>
      </header>

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
        {SLIDES.map((s, i) => (
          <section
            key={s.where}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${SLIDES.length}: ${s.where}`}
            inert={i !== index}
            className="flex w-full shrink-0 snap-center snap-always flex-col overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {/* Auto margins centre it when there is room (tablet, desktop) and, unlike align-content, never push the top out of reach when there is not. */}
            <div className="mx-auto grid w-full max-w-[520px] grid-cols-1 gap-7 px-5 pb-8 pt-3 md:my-auto lg:gap-5 lg:pb-7 lg:pt-1 lg:max-w-[1080px] lg:grid-cols-[1fr_minmax(0,440px)] lg:items-center lg:gap-16 lg:px-10">
              <div>
                <p style={{ ...typeRoles.eyebrow, color: hues[s.mood] }}>
                  {s.where}
                </p>
                <h2 className="mt-3.5 lg:mt-2.5" style={{ ...typeRoles.display, margin: undefined, fontSize: 'clamp(27px, 3.4vw, 40px)', color: shell.text, textWrap: 'balance' as never }}>{s.title}</h2>
                <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.65] lg:mt-3 lg:text-[17px] lg:leading-[1.55]" style={{ ...typeRoles.ui, margin: undefined, lineHeight: undefined, fontSize: undefined, color: shell.muted }}>
                  {s.body}
                </p>
                {firstRun && i === SLIDES.length - 1 && (
                  <p className="mt-4 max-w-[46ch] text-[15px] leading-[1.65] lg:mt-3 lg:text-[17px] lg:leading-[1.55]" style={{ ...typeRoles.ui, margin: undefined, lineHeight: undefined, fontSize: undefined, color: shell.text }}>
                    Next, three short questions, so it’s built around your themes.
                  </p>
                )}
              </div>
              <div className="w-full">
                <s.Widget key={runs[i]} active={i === index} />
              </div>
            </div>
          </section>
        ))}
      </div>

      <footer className="relative z-[1] mx-auto flex w-full max-w-[520px] shrink-0 flex-col gap-3 px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 lg:gap-1 lg:pt-1 lg:max-w-[1080px] lg:flex-row lg:items-center lg:justify-between lg:px-10 lg:pb-7">
        <div className="flex items-center justify-center gap-1.5 lg:justify-start">
          {SLIDES.map((s, i) => (
            <button
              key={s.where}
              type="button"
              onClick={() => go(i)}
              aria-label={`${i + 1} of ${SLIDES.length}: ${s.where}`}
              aria-current={i === index ? 'step' : undefined}
              className="flex h-7 cursor-pointer items-center lg:h-11"
              style={{ background: 'none', border: 'none', padding: 0, width: i === index ? 36 : 20, transition: 'width 0.3s ease' }}
            >
              <span style={{ display: 'block', width: '100%', height: 4, borderRadius: 2, backgroundColor: i === index ? shell.text : i < index ? shell.muted : shell.line, transition: 'background-color 0.3s ease' }} />
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          {index > 0 && (
            <button
              type="button"
              onClick={() => go(index - 1)}
              aria-label="Back"
              className="flex shrink-0 cursor-pointer items-center justify-center transition-colors hover:bg-[rgba(236,233,226,0.12)]"
              style={{ width: 48, height: 46, borderRadius: radius.field, border: `1px solid ${shell.line}`, backgroundColor: shell.fill, color: shell.text }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div className="flex-1 lg:w-[240px] lg:flex-none">
            <PrimaryButton size="lg" full onClick={last ? onLeave : () => go(index + 1)}>
              {!last ? 'Next' : firstRun ? 'Begin with your world' : 'Done'}
            </PrimaryButton>
          </div>
        </div>
      </footer>
    </div>
    </div>
  )
}
