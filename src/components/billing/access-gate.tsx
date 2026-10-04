'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { type as typeRoles } from '@/lib/design-tokens'
import { CONTACT_EMAIL } from '@/lib/site'
import { LEGAL_PAGES } from '@/lib/legal'
import { activeLimitLine, activeLimitWords } from '@/lib/billing/entitlements'
import { PLAN_EVENTS, primePlan, type PlanStatus } from '@/lib/billing/use-plan'

// Loaded only when "See plans" is pressed. This gate sits in the root layout,
// so a plain import would ship the settings sheet (and the Supabase client it
// brings) to every page, the public landing page included.
const SettingsSheet = dynamic(() => import('@/components/settings/settings-sheet').then((mod) => mod.SettingsSheet), { ssr: false })

// Must match GATE_HEADER in lib/billing/fair-use.ts (not imported: that
// module is server-only).
const GATE_HEADER = 'x-companheiro-gate'
const SEEN_KEY = 'companheiro:trial-ended-seen'
const NEAR_KEY = 'companheiro:near-limit-seen'
const CHOICE_KEY = 'companheiro:project-choice-seen'
const NEAR_SHARE = 0.8
const NEAR_VISIBLE_MS = 12_000
// /subscribe is on its way to checkout: no notice should stand in front of that.
const PUBLIC_PATHS = ['/', '/login', '/signup', '/reset', '/subscribe', ...LEGAL_PAGES.map((p) => p.href as string)]

type Reason = 'trial_ended' | 'fair_use'

export type Status = PlanStatus

function firstOfNextMonth(): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}

/**
 * Watches every API response for the fair-use / trial-ended gate header and
 * answers it with one explanation, wherever in the app it happened — so no
 * surface has to handle the limit itself. Also shows the trial-ended screen
 * once per session on arrival.
 */
export function AccessGate() {
  const pathname = usePathname()
  const [reason, setReason] = useState<Reason | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [plansOpen, setPlansOpen] = useState(false)
  const [near, setNear] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const dismissNear = useCallback(() => setNear(false), [])
  const isPublic = PUBLIC_PATHS.includes(pathname ?? '')

  useEffect(() => {
    if (isPublic) return
    const original = window.fetch
    window.fetch = async (...args) => {
      const res = await original(...args)
      const gate = res.headers.get(GATE_HEADER)
      if (gate === 'trial_ended' || gate === 'fair_use') {
        setReason(gate)
        original('/api/billing/status')
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => d && setStatus(d))
          .catch(() => {})
      }
      return res
    }
    return () => {
      window.fetch = original
    }
  }, [isPublic])

  // Any screen can ask for the plans, or for the choice of which project to
  // keep (lib/billing/use-plan.ts), without carrying the sheet itself.
  useEffect(() => {
    if (isPublic) return
    const plans = () => { setReason(null); setChoosing(false); setPlansOpen(true) }
    const choose = () => setChoosing(true)
    window.addEventListener(PLAN_EVENTS.plans, plans)
    window.addEventListener(PLAN_EVENTS.choose, choose)
    return () => {
      window.removeEventListener(PLAN_EVENTS.plans, plans)
      window.removeEventListener(PLAN_EVENTS.choose, choose)
    }
  }, [isPublic])

  useEffect(() => {
    if (isPublic) return
    fetch('/api/billing/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Status | null) => {
        if (!d) return
        setStatus(d)
        primePlan(d)
        // More projects in Active than the plan carries: asked once per
        // session on arrival, and again whenever a screen asks for it.
        if (d.over_limit?.length) {
          let asked = false
          try {
            asked = sessionStorage.getItem(CHOICE_KEY) === '1'
            sessionStorage.setItem(CHOICE_KEY, '1')
          } catch {
            // storage blocked: ask
          }
          if (!asked) setChoosing(true)
        }
        if (d.usage && d.usage.used_micros >= d.usage.cap_micros * NEAR_SHARE && d.usage.used_micros < d.usage.cap_micros) {
          // Once per browser session and per period: a heads-up when someone
          // arrives, never a fixture that follows them from page to page.
          const key = `${NEAR_KEY}:${d.usage.period}`
          let shown = false
          try {
            shown = sessionStorage.getItem(key) === '1'
            sessionStorage.setItem(key, '1')
          } catch {
            // storage blocked: fall through and show it
          }
          if (!shown) setNear(true)
        }
        // A missing row (or a lookup that failed) is not evidence the trial
        // ended; only a real, expired subscription earns the arrival screen.
        if (d.access !== 'no_access' || !d.subscription) return
        let seen = false
        try {
          seen = sessionStorage.getItem(SEEN_KEY) === '1'
          sessionStorage.setItem(SEEN_KEY, '1')
        } catch {
          // private mode: show it, it's only once per page load then
        }
        if (!seen) setReason('trial_ended')
      })
      .catch(() => {})
  }, [isPublic])

  if (plansOpen) return <SettingsSheet onClose={() => setPlansOpen(false)} />
  if (choosing && !reason && status?.over_limit?.length) {
    return <KeepOneNotice status={status} onClose={() => setChoosing(false)} onPlans={() => { setChoosing(false); setPlansOpen(true) }} />
  }
  if (!reason) {
    return near && status?.usage ? <NearLimitBanner plan={status.usage.plan} onClose={dismissNear} /> : null
  }

  const close = () => setReason(null)
  const openPlans = () => {
    setReason(null)
    setPlansOpen(true)
  }

  return reason === 'fair_use' ? (
    <FairUseNotice status={status} onClose={close} onPlans={openPlans} />
  ) : (
    <TrialEndedNotice status={status} onClose={close} onPlans={openPlans} />
  )
}

export function NearLimitBanner({ plan, onClose }: { plan: 'trial' | 'practice' | 'direction'; onClose: () => void }) {
  const { t } = useTheme()

  useEffect(() => {
    const id = setTimeout(onClose, NEAR_VISIBLE_MS)
    return () => clearTimeout(id)
  }, [onClose])

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: 'calc(12px + env(safe-area-inset-top))',
        left: 16,
        right: 16,
        zIndex: 60,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          ...typeRoles.small,
          pointerEvents: 'auto',
          maxWidth: 520,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          padding: '12px 14px',
          borderRadius: 12,
          background: t.cardBg,
          boxShadow: t.shadow,
          border: `1px solid ${t.divider}`,
          color: t.textSecondary,
          lineHeight: 1.5,
        }}
      >
        <span>
          A heads-up: you’ve used most of {plan === 'trial' ? 'your free month’s' : 'this month’s'} share of the companion.
          {plan === 'trial' ? ' Choosing a plan gives you a fresh one.' : ` It refills on ${firstOfNextMonth()}.`}
        </span>
        <button
          onClick={onClose}
          aria-label="Dismiss"
          style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 0 }}
        >
          ×
        </button>
      </div>
    </div>
  )
}

function useText() {
  const { t } = useTheme()
  return {
    body: { ...typeRoles.ui, fontSize: 15, lineHeight: 1.6, color: t.textSecondary, margin: '0 0 14px' } as React.CSSProperties,
    fine: { ...typeRoles.small, fontSize: 13, lineHeight: 1.55, color: t.textMuted, margin: '18px 0 0' } as React.CSSProperties,
    strong: { color: t.textPrimary } as React.CSSProperties,
  }
}

function Footer({ onClose, onPlans, plansLabel }: { onClose: () => void; onPlans?: () => void; plansLabel?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
      <GhostButton size="sm" onClick={onClose}>Close</GhostButton>
      {onPlans && <PrimaryButton size="sm" onClick={onPlans}>{plansLabel ?? 'See plans'}</PrimaryButton>}
    </div>
  )
}

export function FairUseNotice({ status, onClose, onPlans }: { status: Status | null; onClose: () => void; onPlans: () => void }) {
  const s = useText()
  const plan = status?.usage?.plan
  const until = plan === 'trial' ? 'you choose a plan' : firstOfNextMonth()

  return (
    <ModalDialog
      onClose={onClose}
      title={plan === 'trial' ? 'You’ve used this month’s share' : 'You’ve been working hard'}
      maxWidth="520px"
      footer={<Footer onClose={onClose} onPlans={plan === 'direction' ? undefined : onPlans} plansLabel={plan === 'trial' ? 'See plans' : 'See Direction'} />}
    >
      <p style={s.body}>
        You’ve reached the fair-use limit for the companion {plan === 'trial' ? 'on your free month' : 'this month'}. Nothing is wrong. It means you
        kept turning up, talked things through and kept going back to the work. That counts.
      </p>
      <p style={s.body}>
        My side of it: every time the companion reads your work and answers, I pay the AI provider for it. It’s just me running this. I keep the
        price where it is by giving everyone a generous share, but a limited one, rather than calling it unlimited. “Unlimited” only works by
        charging everyone more to cover the few who use the most.
      </p>
      <p style={s.body}>
        <span style={s.strong}>Your work isn’t locked.</span> You can still write, capture, move things around and read everything you’ve made.
        Only the companion’s side rests, until {until}.
      </p>
      {CONTACT_EMAIL && (
        <p style={s.fine}>
          If your practice needs more room than this, write to me at {CONTACT_EMAIL}. I’d rather hear about it than have you work around it.
        </p>
      )}
    </ModalDialog>
  )
}

export function TrialEndedNotice({ status, onClose, onPlans }: { status: Status | null; onClose: () => void; onPlans: () => void }) {
  const s = useText()
  // A plan that was paid for and then cancelled never reads as a free month.
  const cancelled = status?.subscription?.status === 'canceled'
  const repeat = !cancelled && status?.subscription?.repeat_trial === true

  return (
    <ModalDialog
      onClose={onClose}
      title={cancelled ? 'Your plan has ended' : repeat ? 'This address has had its free month' : 'Your free month has ended'}
      maxWidth="520px"
      footer={<Footer onClose={onClose} onPlans={onPlans} plansLabel="Choose a plan" />}
    >
      {repeat ? (
        <p style={s.body}>
          This email address, or a version of it, has already had a free month, so this account starts without one. If you’re coming back,
          welcome back. Everything from before is still on the account you used then.
        </p>
      ) : (
        <p style={s.body}>
          Everything you made is still here: your pieces, your notes, and what the companion has learned about how you work. None of it
          goes anywhere. You can read and export all of it, and keep writing in the project you&rsquo;re working on.
        </p>
      )}
      <p style={s.body}>
        {cancelled ? 'To pick the companion back up, choose a plan.' : 'To keep working with the companion, choose a plan.'} Practice is €9 a month, for two active projects in words. Direction is €29, for
        several projects in any medium.
      </p>
      {CONTACT_EMAIL && (
        <p style={s.fine}>
          If the price is what’s stopping you, email me at {CONTACT_EMAIL} and tell me a little about what you’re working on. I keep a small
          number of reduced places for people who need them.
        </p>
      )}
    </ModalDialog>
  )
}

/**
 * The plan carries fewer projects than are in Active (a free month that
 * ended, or a move from Direction to Practice). Nothing is taken away: the
 * person says which they are working on (as many as the plan carries), and
 * the rest wait in the Queue.
 */
export function KeepOneNotice({ status, onClose, onPlans }: { status: Status; onClose: () => void; onPlans: () => void }) {
  const { t } = useTheme()
  const s = useText()
  const projects = status.over_limit ?? []
  const max = status.entitlements?.maxActiveProjects ?? 1
  const [chosen, setChosen] = useState<string[]>(projects.slice(0, max).map((p) => p.id))
  // Picking one more than the plan carries lets go of the earliest pick.
  const toggle = (id: string) => setChosen((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].slice(-max)))
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const line = activeLimitLine(status.entitlements?.plan ?? 'practice')

  const keep = async () => {
    if (!chosen.length || busy) return
    setBusy(true)
    setFailed(false)
    try {
      const res = await fetch(`/api/studio/projects/${chosen[0]}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ shelf_stage: 'active', keep_only: true, keep_ids: chosen.slice(1) }),
      })
      if (!res.ok) throw new Error('failed')
      // Every screen that listed or opened a project reads it afresh.
      window.location.reload()
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <ModalDialog
      onClose={onClose}
      title={max === 1 ? 'Which one are you working on?' : 'Which are you working on?'}
      maxWidth="520px"
      footer={
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
          <GhostButton size="sm" onClick={onClose}>Decide later</GhostButton>
          <GhostButton size="sm" onClick={onPlans}>See Direction</GhostButton>
          <PrimaryButton size="sm" onClick={() => void keep()} disabled={!chosen.length} loading={busy} loadingLabel="Saving…">{chosen.length > 1 ? 'Keep these' : 'Keep this one'}</PrimaryButton>
        </div>
      }
    >
      <p style={s.body}>
        {line} You have {projects.length} in Active. Choose {max === 1 ? 'the one' : `up to ${activeLimitWords(max).split(' ')[0]}`} to keep working on. The others go to
        your Queue. Nothing in them is deleted or changed: you can read and export them, and switch to one of them later.
      </p>
      <div role="group" aria-label="The projects to keep working on" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {projects.map((p) => {
          const on = chosen.includes(p.id)
          return (
            <button
              key={p.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() => toggle(p.id)}
              style={{
                ...typeRoles.ui, fontSize: 15, textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12,
                border: `1px solid ${on ? t.ember : t.divider}`, background: on ? t.cardBgInner : 'transparent', color: t.textPrimary,
              }}
            >
              <span aria-hidden style={{ width: 14, height: 14, borderRadius: '50%', flexShrink: 0, border: `1px solid ${on ? t.ember : t.textMuted}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {on && <span style={{ width: 6, height: 6, borderRadius: '50%', background: t.ember }} />}
              </span>
              {p.title.trim() || 'Untitled'}
            </button>
          )
        })}
      </div>
      {failed && <p role="alert" style={{ ...s.fine, color: t.danger }}>That did not save. Try again.</p>}
      <p style={s.fine}>Until you choose, your projects can be read but not changed.</p>
    </ModalDialog>
  )
}
