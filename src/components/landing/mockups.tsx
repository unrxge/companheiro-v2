'use client'

// Landing-page visuals. Every one is built from the app's real components
// (Container, Card, MicButton, SignalCards, WeatherStrip, PhaseDots,
// FacetCloud, Thread, StageRibbon) fed with sample data, so the page shows
// the product in its own design language rather than stock photography.
// Nothing here reads the database.

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion as m, useInView, useReducedMotion } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { Container, Card } from '@/components/shell/page-shell'
import { MicButton } from '@/components/ui/mic-button'
import { Pill } from '@/components/ui/pill'
import { Thread, type ThreadMessage } from '@/components/conversation/thread'
import { FacetCloud, PhaseDots, SignalCards, StageRibbon, WeatherStrip, type WeatherDay } from '@/components/widgets'
import { type as typeRoles, type Arc } from '@/lib/design-tokens'

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1]

/** Reveals `text` a character at a time once `start` is true. Instant under reduced motion. */
function useTypewriter(text: string, start: boolean, msPerChar = 26) {
  const reduce = useReducedMotion()
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!start) return
    if (reduce) {
      setN(text.length)
      return
    }
    setN(0)
    const id = window.setInterval(() => {
      setN((prev) => {
        if (prev >= text.length) {
          window.clearInterval(id)
          return prev
        }
        return prev + 1
      })
    }, msPerChar)
    return () => window.clearInterval(id)
  }, [text, start, msPerChar, reduce])
  return { shown: text.slice(0, n), done: n >= text.length }
}

function Label({ children }: { children: React.ReactNode }) {
  const { t } = useTheme()
  return <p style={{ ...typeRoles.small, fontWeight: 600, color: t.textMuted }}>{children}</p>
}

// ── Hero: talking it through ─────────────────────────────────────────────────

const HERO_WORDS =
  'I keep coming back to the same image. Dad’s garage, the radio on, neither of us talking. I don’t know what it wants to be yet.'

export function TalkMockup() {
  const { t } = useTheme()
  const reduce = useReducedMotion()
  const [started, setStarted] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setStarted(true), reduce ? 0 : 900)
    return () => window.clearTimeout(id)
  }, [reduce])
  const { shown, done } = useTypewriter(HERO_WORDS, started)
  const [stage, setStage] = useState(0) // 0 typing, 1 signals, 2 reply
  useEffect(() => {
    if (!done) return
    if (reduce) {
      setStage(2)
      return
    }
    const a = window.setTimeout(() => setStage(1), 450)
    const b = window.setTimeout(() => setStage(2), 1500)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [done, reduce])

  return (
    <Container padding={16} style={{ width: '100%' }}>
      <Card padding={22}>
        <div className="flex items-center justify-between gap-4">
          <Label>Tuesday, 21:40</Label>
          <MicButton recording={started && !done} onToggle={() => {}} size={40} />
        </div>
        <p
          aria-label={HERO_WORDS}
          style={{ ...typeRoles.quote, color: t.textPrimary, marginTop: 18, minHeight: '5.8em' }}
        >
          <span aria-hidden>{shown}</span>
          {!done && (
            <span
              aria-hidden
              className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[3px] animate-pulse motion-reduce:animate-none"
              style={{ backgroundColor: t.ember }}
            />
          )}
        </p>
        <m.div
          initial={false}
          animate={{ opacity: stage >= 1 ? 1 : 0, y: stage >= 1 ? 0 : 8 }}
          transition={{ duration: 0.6, ease: EASE }}
          style={{ marginTop: 18 }}
        >
          <SignalCards signals={{ energy: 'low', inner_weather: 'quiet, circling', arc_texture: 'Beginning' }} />
        </m.div>
      </Card>
      <m.div
        initial={false}
        animate={{ opacity: stage >= 2 ? 1 : 0, y: stage >= 2 ? 0 : 8 }}
        transition={{ duration: 0.7, ease: EASE }}
        style={{ padding: '18px 8px 6px' }}
      >
        <p style={{ ...typeRoles.ui, color: t.textSecondary }}>
          That&rsquo;s the third time the garage has come up this week. What do you think the quiet was keeping safe?
        </p>
      </m.div>
    </Container>
  )
}

// ── How it listens: one visual per movement ─────────────────────────────────

const ARCS: Arc[] = ['Beginning', 'Beginning', 'Breakaway', 'Expansion', 'Expansion', 'Integration']
const WEATHER = ['quiet, circling', 'restless', 'foggy but clearing', 'steady', 'tender', 'open', 'raw', 'settled']
const SAMPLE_DAYS: WeatherDay[] = Array.from({ length: 30 }, (_, i) => {
  const skip = i % 7 === 3 || i % 11 === 5
  const wrote = skip && i % 11 === 5
  return {
    date: `${((i + 22) % 31) + 1} ${i < 9 ? 'Aug' : 'Sep'}`,
    energy: skip ? null : (['low', 'medium', 'high'] as const)[(i * 7 + 2) % 3],
    arc: skip ? null : ARCS[Math.floor(i / 5) % ARCS.length],
    weather: skip ? null : WEATHER[i % WEATHER.length],
    writingMinutes: wrote ? 25 + ((i * 13) % 60) : undefined,
  }
})

function TalkVisual() {
  const { t } = useTheme()
  return (
    <Container padding={16}>
      <Card padding={22}>
        <Label>The last thirty days</Label>
        <div style={{ marginTop: 16 }}>
          <WeatherStrip days={SAMPLE_DAYS} />
        </div>
        <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 14 }}>
          Every time you talk, it notes your energy and mood. Hover a day to see it.
        </p>
      </Card>
    </Container>
  )
}

const PHASES = ['First Contact', 'Expansion', 'The Reader', 'The Principle', 'Declaration']

function QuestionVisual() {
  const { t } = useTheme()
  return (
    <Container padding={16}>
      <Card padding={22}>
        <PhaseDots phase={3} labels={PHASES} />
        <p style={{ ...typeRoles.ui, color: t.textSecondary, marginTop: 20 }}>Who is this for, and what should they be left holding on the last line?</p>
        <p style={{ ...typeRoles.ui, fontWeight: 500, color: t.textPrimary, marginTop: 12, textAlign: 'right' }}>For him, I think. That I noticed.</p>
        <Card inner padding={16} style={{ marginTop: 20 }}>
          <Pill hue="ember">Core concept</Pill>
          <p style={{ ...typeRoles.h3, fontSize: 16, color: t.textPrimary, marginTop: 10 }}>What the Garage Kept</p>
          <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 4 }}>
            A son writes the conversation he and his father never had, using only the things left in the garage.
          </p>
        </Card>
      </Card>
    </Container>
  )
}

function KeepVisual() {
  const { t } = useTheme()
  return (
    <Container padding={16}>
      <Card padding={22}>
        <Label>What it has noticed about you</Label>
        <div style={{ marginTop: 16 }}>
          <FacetCloud
            align="left"
            facets={[
              { id: '1', statement: 'needs a question, not advice', weight: 1, freshness: 1 },
              { id: '2', statement: 'ideas arrive as images', weight: 0.7, freshness: 0.95 },
              { id: '3', statement: 'circles a subject before naming it', weight: 0.55, freshness: 0.8 },
              { id: '4', statement: 'writes best late', weight: 0.3, freshness: 0.6 },
              { id: '5', statement: 'drops pieces at the halfway mark', weight: 0.2, freshness: 0.45 },
            ]}
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Pill hue="verdant" dot>
            Confirmed by you
          </Pill>
          <span style={{ ...typeRoles.small, color: t.textMuted }}>Nothing is kept until you say it&rsquo;s right.</span>
        </div>
      </Card>
    </Container>
  )
}

export const MOVEMENT_VISUALS = [TalkVisual, QuestionVisual, KeepVisual]

// ── Being heard: the real conversation surface, replying as you watch ────────

const USER_MSG =
  'I keep trying to write about my dad’s garage, but it turns into a list of tools. I don’t care about the tools. It’s more that we never really talked in there.'
const REPLY =
  'Then maybe the garage isn’t the subject. The silence is, and what it taught you. The tools could be the way in. Does that sound right?'

export function HeardMockup() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.5 })
  const reduce = useReducedMotion()
  const [started, setStarted] = useState(false)
  useEffect(() => {
    if (!inView) return
    const id = window.setTimeout(() => setStarted(true), reduce ? 0 : 900)
    return () => window.clearTimeout(id)
  }, [inView, reduce])
  const { shown, done } = useTypewriter(REPLY, started, 22)

  const messages: ThreadMessage[] = [{ role: 'user', content: USER_MSG }]
  if (started) messages.push({ role: 'assistant', content: shown })

  return (
    <div ref={ref}>
      <Container padding={28}>
        <div style={{ minHeight: 190 }}>
          {inView || reduce ? <Thread messages={messages} streaming={!done} /> : null}
        </div>
      </Container>
    </div>
  )
}

// ── Closing: where you left off ──────────────────────────────────────────────

export function LeftOffMockup() {
  const { t } = useTheme()
  return (
    <Container padding={16}>
      <Card padding={22}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p style={{ ...typeRoles.h2, fontSize: 22, color: t.textPrimary }}>What the Garage Kept</p>
            <p style={{ ...typeRoles.small, color: t.textMuted, marginTop: 4 }}>Essay, in progress</p>
          </div>
          <Pill hue="verdant" dot>
            Active
          </Pill>
        </div>
        <div style={{ marginTop: 18 }}>
          <StageRibbon step="write" />
        </div>
        <Card inner padding={16} style={{ marginTop: 18 }}>
          <Label>Last thing you said, 12 days ago</Label>
          <p style={{ ...typeRoles.quote, fontSize: 17, color: t.textPrimary, marginTop: 8 }}>&ldquo;The tools are the way in, not the subject.&rdquo;</p>
        </Card>
      </Card>
      <Card padding={16} style={{ marginTop: 12 }}>
        <div className="flex items-center justify-between gap-3">
          <p style={{ ...typeRoles.h3, color: t.textPrimary }}>Sunday, Unhurried</p>
          <Pill hue="ochre">Resting</Pill>
        </div>
        <div style={{ marginTop: 10 }}>
          <StageRibbon step="test" compact />
        </div>
      </Card>
    </Container>
  )
}

/** Swaps between the three movement visuals with a soft cross-fade. */
export function MovementStage({ active }: { active: number }) {
  const reduce = useReducedMotion()
  const Visual = MOVEMENT_VISUALS[active]
  return (
    <AnimatePresence mode="wait" initial={false}>
      <m.div
        key={active}
        initial={reduce ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, y: -10 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <Visual />
      </m.div>
    </AnimatePresence>
  )
}
