'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { atmosphereHues, atmosphereRing, motion, shell, type Mood } from '@/lib/design-tokens'

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")"

const KEYFRAMES = `
@keyframes atm-drift-1 { to { transform: translate(10vw, 8vh) scale(1.12); } }
@keyframes atm-drift-2 { to { transform: translate(-12vw, 10vh) scale(0.94); } }
@keyframes atm-drift-3 { to { transform: translate(-8vw, -10vh) scale(1.08); } }
.atm-field { position: absolute; border-radius: 50%; filter: blur(110px); will-change: transform; transition: background-color var(--atm-fade, 1.6s) ease, opacity var(--atm-fade, 1.6s) ease; }
.atm-field-2 { transition-delay: var(--atm-lag, 0s); }
.atm-field-3 { transition-delay: calc(var(--atm-lag, 0s) * 2); }
.atm-field-1 { width: 62vw; height: 62vw; left: -18vw; top: -22vw; animation: atm-drift-1 ${motion.atmosphereS}s ease-in-out infinite alternate; }
.atm-field-2 { width: 50vw; height: 50vw; right: -16vw; top: 14vh; animation: atm-drift-2 ${motion.atmosphereS + 12}s ease-in-out infinite alternate; }
.atm-field-3 { width: 44vw; height: 44vw; left: 32vw; bottom: -24vw; animation: atm-drift-3 ${motion.atmosphereS + 4}s ease-in-out infinite alternate; }
@media (prefers-reduced-motion: reduce) { .atm-field { animation: none !important; } }
@media (max-width: 640px) { .atm-field-1 { width: 120vw; height: 120vw; left: -40vw; top: -50vw; } .atm-field-2 { width: 90vw; height: 90vw; right: -40vw; } .atm-field-3 { width: 80vw; height: 80vw; } }
`

const RING = atmosphereRing as readonly Mood[]
const nextInRing = (cur: Mood): Mood => RING[(RING.indexOf(cur) + 1) % RING.length]

/**
 * The shell, alive. Ink base with three large blurred hue fields that drift
 * over about a minute. `mood` picks the hue family to start on (module or last
 * signals); `intensity` (0–1) scales how present the colour is — low energy
 * reads as a quieter sky.
 *
 * With `cycle` (default) the sky then fades slowly through the other hue
 * families on its own, the way the landing page shifts as you scroll, each
 * field trailing the last so it never swaps all at once. A changed `mood`
 * prop still lands quickly and restarts the rest. Pass `cycle={false}` when
 * something else (the landing page's scroll) is driving the mood. Both the
 * drift and the cycle stop under prefers-reduced-motion. Sits behind everything.
 */
export function Atmosphere({ mood = 'neutral', intensity = 1, cycle = true }: { mood?: Mood; intensity?: number; cycle?: boolean }) {
  const reduce = useReducedMotion()
  const [shown, setShown] = useState<Mood>(mood)
  // Whether the last change was the slow ambient one or a quick mood change.
  const [ambient, setAmbient] = useState(false)

  // The mood prop is authoritative: land on it quickly, then restart the cycle.
  useEffect(() => {
    setShown(mood)
    setAmbient(false)
    if (!cycle || reduce) return
    const id = setInterval(() => {
      if (document.hidden) return
      setShown(nextInRing)
      setAmbient(true)
    }, motion.hueDwellS * 1000)
    return () => clearInterval(id)
  }, [mood, cycle, reduce])

  const [h1, h2, h3] = atmosphereHues[shown]
  const k = Math.max(0.35, Math.min(1, intensity))
  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        background: `radial-gradient(ellipse at 50% 0%, ${shell.ink2}, ${shell.ink} 65%)`,
        // iOS Safari can lose the plot compositing a fixed, blurred, endlessly
        // animating layer while its own chrome collapses/expands during
        // scroll — the layer visibly lags or blanks at the top until the
        // scroll settles. Pinning it to its own GPU layer up front (instead
        // of promoting it mid-scroll) keeps WebKit from having to recomposite
        // it against the changing viewport.
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        WebkitBackfaceVisibility: 'hidden',
        contain: 'paint',
        ...({
          '--atm-fade': ambient ? `${motion.hueFadeS}s` : '1.6s',
          '--atm-lag': ambient ? `${motion.hueLagS}s` : '0s',
        } as React.CSSProperties),
      }}
    >
      <style>{KEYFRAMES}</style>
      <span className="atm-field atm-field-1" style={{ backgroundColor: h1, opacity: 0.55 * k }} />
      <span className="atm-field atm-field-2" style={{ backgroundColor: h2, opacity: 0.42 * k }} />
      <span className="atm-field atm-field-3" style={{ backgroundColor: h3, opacity: 0.38 * k }} />
      <span
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: GRAIN,
          opacity: 0.055,
          mixBlendMode: 'overlay',
        }}
      />
    </div>
  )
}
