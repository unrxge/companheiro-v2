'use client'

// ── the corner "+" and the fan that opens out of it ─────────────────────────
//
// The way to make anything new on the canvas. It does not shout. It sits in
// the same dark glass as the rest of the canvas's controls, and three quiet
// things draw the eye to it instead of a colour:
//
//   · a sliver of light travels slowly round its rim, like light catching an
//     edge; the eye notices movement long before it notices a hue
//   · it notices the pointer: as the mouse comes near, it leans towards it and
//     its rim brightens, so it feels alive rather than advertised
//   · on arrival the light makes one brighter sweep, once, and then settles
//
// Pressed, the choices stack up out of it, one above the other:
// hold and slide onto one (it swells and says its name) and let go to choose
// it, or tap the "+" and then tap a choice.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, shell } from '@/lib/design-tokens'
import { DOCK_DESKTOP_MIN } from '@/components/shell/dock'
import { PLUS_OPTIONS, type PlusChoice } from '@/components/studio/work/board-items'

const SIZE = 68
const BUBBLE = 50
/** The gap between one choice and the next, up the stack. */
const STEP = BUBBLE + 12
/** A press held this long opens the fan for sliding onto a choice. */
const HOLD_MS = 180
/** How near the pointer comes before the "+" starts to notice it. */
const NOTICE = 180

export function AddFan({ open, onOpen, onClose, available, locked, inert, onPick, onLocked }: {
  open: boolean
  onOpen: (live: boolean) => void
  onClose: () => void
  available: PlusChoice[]
  locked: PlusChoice[]
  /** An example's: every choice greyed and doing nothing, with a line saying why. */
  inert: boolean
  onPick: (choice: PlusChoice) => void
  onLocked: (choice: PlusChoice) => void
}) {
  const { t } = useTheme()
  const options = PLUS_OPTIONS.filter((o) => available.includes(o.key))
  // Stacked straight up from the "+", the first choice nearest it.
  const at = options.map((_, i) => ({ x: 0, y: -(i + 1) * STEP - (SIZE - BUBBLE) / 2 }))
  const [hot, setHot] = useState<number | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const root = useRef<HTMLDivElement | null>(null)
  const press = useRef<{ timer: number; held: boolean; wasOpen: boolean } | null>(null)

  const choose = useCallback((i: number) => {
    const o = options[i]
    if (!o) return
    if (inert) return
    onClose()
    if (locked.includes(o.key)) onLocked(o.key)
    else onPick(o.key)
  }, [inert, locked, onClose, onLocked, onPick, options])

  /** Which choice a point on the window is over, if any. */
  const choiceAt = useCallback((x: number, y: number): number | null => {
    const b = button.current?.getBoundingClientRect()
    if (!b) return null
    const cx = b.left + b.width / 2
    const cy = b.top + b.height / 2
    let best: number | null = null
    let near = BUBBLE * 0.75
    at.forEach((p, i) => {
      const d = Math.hypot(x - (cx + p.x), y - (cy + p.y))
      if (d < near) { near = d; best = i }
    })
    return best
  }, [at])

  // ── the press: a tap opens it to stay, a hold opens it to slide onto a choice
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    const wasOpen = open
    press.current = {
      wasOpen, held: false,
      timer: window.setTimeout(() => {
        if (!press.current) return
        press.current.held = true
        if (!wasOpen) onOpen(true)
      }, HOLD_MS),
    }
    button.current?.setPointerCapture(e.pointerId)
  }
  const move = (e: React.PointerEvent) => {
    if (!press.current?.held) return
    setHot(choiceAt(e.clientX, e.clientY))
  }
  const up = (e: React.PointerEvent) => {
    const p = press.current
    press.current = null
    if (!p) return
    window.clearTimeout(p.timer)
    if (button.current?.hasPointerCapture(e.pointerId)) button.current.releasePointerCapture(e.pointerId)
    if (p.held) {
      // Let go over a choice: that one. Let go anywhere else: the fan stays open to tap.
      const i = choiceAt(e.clientX, e.clientY)
      setHot(null)
      if (i !== null) choose(i)
      return
    }
    if (p.wasOpen) onClose()
    else onOpen(true)
  }

  // Closes on a press anywhere else, or Escape.
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    // Capture phase: the canvas stops presses on its own ground and cards.
    const id = window.setTimeout(() => window.addEventListener('pointerdown', away, true), 0)
    window.addEventListener('keydown', key)
    return () => { window.clearTimeout(id); window.removeEventListener('pointerdown', away, true); window.removeEventListener('keydown', key) }
  }, [open, onClose])

  // ── it notices the pointer: leans towards it, rim brightening, as it nears
  useEffect(() => {
    if (open || typeof window === 'undefined' || !window.matchMedia('(hover: hover)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let frame = 0
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const el = button.current
        if (!el) return
        const b = el.getBoundingClientRect()
        const dx = e.clientX - (b.left + b.width / 2)
        const dy = e.clientY - (b.top + b.height / 2)
        const d = Math.hypot(dx, dy)
        const pull = Math.max(0, 1 - d / NOTICE)
        el.style.setProperty('--lean-x', `${(dx / Math.max(d, 1)) * pull * 7}px`)
        el.style.setProperty('--lean-y', `${(dy / Math.max(d, 1)) * pull * 7}px`)
        el.style.setProperty('--near', String(pull))
      })
    }
    window.addEventListener('pointermove', onMove)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('pointermove', onMove) }
  }, [open])

  const hotOption = hot !== null ? options[hot] : null

  return (
    <>
      <style>{`
        .add-fan { right: 24px; bottom: 24px; }
        @media (max-width: ${DOCK_DESKTOP_MIN - 1}px) {
          .add-fan { right: 18px; bottom: calc(max(14px, env(safe-area-inset-bottom)) + 52px + 14px + 52px + 18px); }
        }
        @keyframes addSweep { to { transform: rotate(360deg); } }
        @keyframes addArrive { 0% { opacity: 0; transform: rotate(-120deg); } 35% { opacity: 1; } 100% { opacity: 0.35; transform: rotate(600deg); } }
        @keyframes fanOut { from { transform: translate(0, 0) scale(0.2); opacity: 0; } to { transform: translate(var(--fx), var(--fy)) scale(1); opacity: 1; } }
        @keyframes fanName { from { opacity: 0; transform: translate(-50%, 4px); } to { opacity: 1; transform: translate(-50%, 0); } }
        .add-plus {
          transform: translate(var(--lean-x, 0px), var(--lean-y, 0px));
          transition: transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1), border-color 200ms ease, background 200ms ease;
          box-shadow: 0 12px 34px rgba(0,0,0,0.5), 0 0 0 calc(6px + var(--near, 0) * 6px) rgba(232,230,224,calc(0.06 + var(--near, 0) * 0.1)) !important;
        }
        .add-plus:hover { background: #F4F2EC !important; }
        .add-plus-icon { transition: transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1); }
        .add-plus[aria-expanded="true"] .add-plus-icon { transform: rotate(135deg); }
        /* The sliver of light round the rim: a conic glint, masked to a ring. */
        .add-glint {
          position: absolute; inset: -1px; border-radius: 50%; pointer-events: none;
          background: conic-gradient(from 0deg, transparent 0deg 290deg, rgba(255,255,255,0) 290deg, rgba(255,255,255,0.95) 340deg, transparent 360deg);
          -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2.5px));
                  mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2.5px));
          opacity: calc(0.35 + var(--near, 0) * 0.65);
          animation: addSweep 7s linear infinite;
        }
        .add-glint[data-arrive] { animation: addArrive 1.6s cubic-bezier(0.3, 0, 0.2, 1) 0.9s both, addSweep 7s linear 2.5s infinite; }
        .fan-bubble { animation: fanOut 380ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        @media (prefers-reduced-motion: reduce) {
          .add-glint, .add-glint[data-arrive] { animation: none; }
          .fan-bubble { animation: none; transform: translate(var(--fx), var(--fy)); }
        }
      `}</style>
      <div
        ref={root}
        className="add-fan"
        data-hold
        style={{ position: 'absolute', zIndex: 42, width: SIZE, height: SIZE }}
      >
        {/* the fan: a box over the whole arc, so the walk round an example can light it */}
        {open && (
          <div
            data-tour="plus-menu"
            role="menu"
            aria-label="Add to this project"
            style={{ position: 'absolute', right: -6, bottom: SIZE, width: 230, height: options.length * STEP + 12, pointerEvents: 'none' }}
          >
            {/* a soft column of shade behind the stack, so it reads over a busy board */}
            <span aria-hidden style={{
              position: 'absolute', inset: '-30px -30px -10px -60px', borderRadius: 40,
              background: 'radial-gradient(ellipse at 80% 60%, rgba(10,9,8,0.7) 0%, rgba(10,9,8,0.4) 50%, rgba(10,9,8,0) 78%)',
            }} />
          </div>
        )}
        {open && options.map((o, i) => {
          const greyed = inert || locked.includes(o.key)
          const isHot = hot === i
          return (
            <button
              key={o.key}
              type="button"
              role="menuitem"
              aria-label={greyed && locked.includes(o.key) && !inert ? `${o.label}: part of Direction` : o.label}
              aria-disabled={inert || undefined}
              title={o.label}
              className="fan-bubble"
              onPointerEnter={() => setHot(i)}
              onPointerLeave={() => setHot((h) => (h === i ? null : h))}
              onClick={() => choose(i)}
              style={{
                position: 'absolute', left: (SIZE - BUBBLE) / 2, top: (SIZE - BUBBLE) / 2, width: BUBBLE, height: BUBBLE, borderRadius: '50%',
                ['--fx' as string]: `${at[i].x}px`, ['--fy' as string]: `${at[i].y}px`,
                animationDelay: `${i * 34}ms`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, cursor: inert ? 'default' : 'pointer',
                background: isHot && !greyed ? shell.text : 'rgba(22,21,19,0.94)',
                color: isHot && !greyed ? shell.ink : greyed ? alpha(shell.text, 0.38) : shell.text,
                border: `1px solid ${isHot ? alpha(shell.text, 0.9) : shell.line}`,
                boxShadow: isHot ? `0 10px 28px rgba(0,0,0,0.5), 0 0 0 6px ${alpha(shell.text, 0.08)}` : '0 6px 18px rgba(0,0,0,0.45)',
                scale: isHot ? '1.18' : '1',
                transition: 'scale 160ms cubic-bezier(0.34, 1.56, 0.64, 1), background 140ms ease, color 140ms ease, box-shadow 160ms ease',
                zIndex: isHot ? 3 : 2,
              }}
            >
              <span style={{ display: 'flex', transform: 'scale(1.15)' }}>{o.icon}</span>
              <span
                aria-hidden
                style={{
                  position: 'absolute', right: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)', whiteSpace: 'nowrap',
                  ...canvasType.small, fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 999, pointerEvents: 'none',
                  background: isHot && !greyed ? shell.text : 'rgba(13,12,11,0.9)', color: isHot && !greyed ? shell.ink : greyed ? alpha(shell.text, 0.45) : shell.text,
                  border: `1px solid ${shell.line}`, transition: 'background 140ms ease, color 140ms ease',
                }}
              >
                {o.label}{greyed && !inert && locked.includes(o.key) ? ' · Direction' : ''}
              </span>
              {greyed && !inert && (
                <span aria-hidden style={{ position: 'absolute', top: -4, right: -4, width: 9, height: 9, borderRadius: '50%', background: t.violet, boxShadow: `0 0 0 2px rgba(22,21,19,0.94)` }} />
              )}
            </button>
          )
        })}
        {open && inert && (
          <span style={{
            position: 'absolute', right: 0, bottom: SIZE + options.length * STEP + 14, whiteSpace: 'nowrap', pointerEvents: 'none',
            ...canvasType.small, fontSize: 12, color: shell.muted, padding: '5px 11px', borderRadius: 999, background: 'rgba(13,12,11,0.9)', border: `1px solid ${shell.line}`,
          }}>
            An example is for looking
          </span>
        )}
        <button
          ref={button}
          type="button"
          className="add-plus"
          data-tour="add-button"
          aria-label="Add something to this project"
          aria-expanded={open}
          aria-haspopup="menu"
          title="Add a thread, a task list, an image, a recording or a palette"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={() => { if (press.current) window.clearTimeout(press.current.timer); press.current = null; setHot(null) }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (open) onClose(); else onOpen(true) } }}
          style={{
            position: 'relative', width: SIZE, height: SIZE, borderRadius: '50%', padding: 0, cursor: 'pointer', zIndex: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            // Light against the dark board, without a colour of its own: it is
            // found by contrast and by the light on its rim, not by shouting.
            background: 'rgba(232,230,224,0.92)', backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)',
            border: `1px solid ${alpha(shell.text, 0.5)}`, color: shell.ink,
            boxShadow: '0 12px 34px rgba(0,0,0,0.5), 0 0 0 6px rgba(232,230,224,0.06)', touchAction: 'none',
          }}
        >
          <span aria-hidden className="add-glint" data-arrive />
          <svg className="add-plus-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </>
  )
}
