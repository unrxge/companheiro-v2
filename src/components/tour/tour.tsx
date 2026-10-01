'use client'

// The tour: six slides, one part of the app each, in the order a piece of
// work actually travels (kept, said, named, placed, made, known). It opens
// once, right after an account is activated, and again from Settings.
//
// The carousel is a native scroll-snap track, so a swipe on a phone is the
// browser's own; the buttons, dots and arrow keys scroll the same track.
// Each slide's visual (widgets.tsx) starts when its slide arrives. The shell
// mood follows the slide, the way the landing page's follows the section.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Atmosphere } from '@/components/shell/atmosphere'
import { PrimaryButton } from '@/components/ui/buttons'
import { fonts, radius, shell, tokensFor, type as typeRoles, type Mood } from '@/lib/design-tokens'
import { BoardWidget, CaptureWidget, ConceptWidget, PortraitWidget, TalkWidget, WritingWidget, type TourWidgetProps } from './widgets'

const ember = tokensFor('dark').ember
const FADE = 'linear-gradient(to bottom, #000 calc(100% - 28px), transparent 100%)'

const SLIDES: { where: string; title: string; body: string; mood: Mood; Widget: (p: TourWidgetProps) => React.ReactNode }[] = [
  {
    where: 'Capture',
    title: 'It starts with what you already have.',
    body: 'A line you overheard. A link. A picture you can’t put down. Keep it in a second, and decide later what it is.',
    mood: 'ember',
    Widget: CaptureWidget,
  },
  {
    where: 'Check in',
    title: 'Say where you are.',
    body: 'Speak or type, for ten seconds or ten minutes. It shows you what it heard, so you can correct it. Nobody is counting days.',
    mood: 'tide',
    Widget: TalkWidget,
  },
  {
    where: 'Idea Lab',
    title: 'One question at a time, until it has a name.',
    body: 'Bring an idea you already carry. It asks, you answer in your own words, and you leave with a sentence you’d stand behind.',
    mood: 'ochre',
    Widget: ConceptWidget,
  },
  {
    where: 'Project Board',
    title: 'See all of it at once.',
    body: 'Every idea gets a place: waiting, in motion, or finished. Working on one thing now doesn’t mean losing the rest.',
    mood: 'verdant',
    Widget: BoardWidget,
  },
  {
    where: 'Writing',
    title: 'Then make it, a step at a time.',
    body: 'One page walks with each piece, from the first sentence to after it’s out. The assistant asks. Every line that stays is one you chose.',
    mood: 'violet',
    Widget: WritingWidget,
  },
  {
    where: 'Portrait',
    title: 'It learns how to walk beside you.',
    body: 'It notices how you work and which kind of help actually helps. All of it is yours to read, and it forgets any line you ask it to.',
    mood: 'ember',
    Widget: PortraitWidget,
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

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden" style={{ background: shell.ink, fontFamily: fonts.ui }}>
      <Atmosphere mood={SLIDES[index].mood} cycle={false} />

      <header className="relative z-[1] mx-auto flex w-full max-w-[520px] shrink-0 items-center justify-between px-5 pb-2 pt-[max(16px,env(safe-area-inset-top))] lg:max-w-[1080px] lg:px-8 lg:pt-6">
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
            <div className="mx-auto grid w-full max-w-[520px] grid-cols-1 gap-5 px-5 pb-7 pt-1 md:my-auto lg:max-w-[1080px] lg:grid-cols-[1fr_minmax(0,440px)] lg:items-center lg:gap-20 lg:px-8">
              <div>
                <p style={{ ...typeRoles.eyebrow, color: ember }}>
                  {s.where}
                </p>
                <h2 style={{ ...typeRoles.display, fontSize: 'clamp(27px, 4.2vw, 46px)', color: shell.text, marginTop: 10, textWrap: 'balance' as never }}>{s.title}</h2>
                <p className="max-w-[46ch] text-[15px] lg:text-[17px]" style={{ ...typeRoles.ui, fontSize: undefined, color: shell.muted, marginTop: 12 }}>
                  {s.body}
                </p>
                {firstRun && i === SLIDES.length - 1 && (
                  <p className="max-w-[46ch] text-[15px] lg:text-[17px]" style={{ ...typeRoles.ui, fontSize: undefined, color: shell.text, marginTop: 12 }}>
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

      <footer className="relative z-[1] mx-auto flex w-full max-w-[520px] shrink-0 flex-col gap-1 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-1 lg:max-w-[1080px] lg:flex-row lg:items-center lg:justify-between lg:px-8 lg:pb-8">
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
              <span style={{ display: 'block', width: '100%', height: 4, borderRadius: 2, backgroundColor: i === index ? ember : i < index ? shell.muted : shell.line, transition: 'background-color 0.3s ease' }} />
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
  )
}
