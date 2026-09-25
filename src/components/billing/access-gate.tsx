'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { SettingsSheet } from '@/components/settings/settings-sheet'
import { type as typeRoles } from '@/lib/design-tokens'
import { CONTACT_EMAIL } from '@/lib/site'

// Must match GATE_HEADER in lib/billing/fair-use.ts (not imported: that
// module is server-only).
const GATE_HEADER = 'x-companheiro-gate'
const SEEN_KEY = 'companheiro:trial-ended-seen'
const NEAR_KEY = 'companheiro:near-limit-seen'
const NEAR_SHARE = 0.8
const NEAR_VISIBLE_MS = 12_000
const PUBLIC_PATHS = ['/', '/login', '/signup', '/reset']

type Reason = 'trial_ended' | 'fair_use'

type Status = {
  subscription: { status: string; tier: 'practice' | 'direction' | null; repeat_trial?: boolean } | null
  access: 'uncapped' | 'capped' | 'no_access'
  usage: { plan: 'trial' | 'practice' | 'direction'; period: string; used_micros: number; cap_micros: number } | null
}

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

  useEffect(() => {
    if (isPublic) return
    fetch('/api/billing/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Status | null) => {
        if (!d) return
        setStatus(d)
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

function NearLimitBanner({ plan, onClose }: { plan: 'trial' | 'practice' | 'direction'; onClose: () => void }) {
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

function FairUseNotice({ status, onClose, onPlans }: { status: Status | null; onClose: () => void; onPlans: () => void }) {
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

function TrialEndedNotice({ status, onClose, onPlans }: { status: Status | null; onClose: () => void; onPlans: () => void }) {
  const s = useText()
  const repeat = status?.subscription?.repeat_trial === true

  return (
    <ModalDialog
      onClose={onClose}
      title={repeat ? 'This address has had its free month' : 'Your free month has ended'}
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
          goes anywhere, and you can read all of it.
        </p>
      )}
      <p style={s.body}>
        To keep working with the companion, choose a plan. Practice is €9 a month, for one active project in words. Direction is €29, for
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
