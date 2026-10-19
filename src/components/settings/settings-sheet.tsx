'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/components/theme/theme-provider'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { Card, Divider } from '@/components/shell/page-shell'
import { DangerButton, GhostButton, QuietButton } from '@/components/ui/buttons'
import { Pill } from '@/components/ui/pill'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { IconButton } from '@/components/ui/icon-button'
import { BillingCard } from '@/components/settings/billing-card'
import { DICTATION_LANGS, setDictationLangCache, type UserSettings } from '@/lib/settings'
import { radius, type as typeRoles } from '@/lib/design-tokens'
import { LEGAL_PAGES } from '@/lib/legal'
import { lastSeenProjects } from '@/lib/studio/last-seen'
import { forgetOpened } from '@/lib/studio/opened'
import { rearmWalks } from '@/lib/examples/use-example-tour'

/** Gear button for a page header. Opens the sheet. */
export function SettingsButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <IconButton onClick={() => setOpen(true)} ariaLabel="Settings">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
        </svg>
      </IconButton>
      {open && <SettingsSheet onClose={() => setOpen(false)} />}
    </>
  )
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { t, theme, setTheme } = useTheme()
  const router = useRouter()
  const confirm = useConfirm()
  const [settings, setSettings] = useState<UserSettings>({ dictation_lang: null, sunday_letter: false, onboarded_at: null })
  const [email, setEmail] = useState<string | null>(null)
  // On unless they switch it off; null until the answer arrives, so the switch never shows a guess.
  const [analytics, setAnalytics] = useState<boolean | null>(null)
  // The example projects under Active on the Project Board; null until the answer arrives.
  const [examples, setExamples] = useState<boolean | null>(null)
  const [walksBusy, setWalksBusy] = useState(false)
  const [walksOn, setWalksOn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) setSettings(d.settings)
        if (d.email) setEmail(d.email)
        if (d.usage_analytics) setAnalytics(d.usage_analytics.on !== false)
        if (d.examples) setExamples(d.examples.on === true)
      })
      .catch(() => {})
  }, [])

  const save = async (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch }
    setSettings(next)
    setSaving(true)
    try {
      await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    } finally {
      setSaving(false)
    }
  }

  const shareAnalytics = async (on: boolean) => {
    setAnalytics(on)
    setSaving(true)
    try {
      await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usage_analytics: on }) })
    } finally {
      setSaving(false)
    }
  }

  const turnWalksOn = async () => {
    setWalksBusy(true)
    setError(null)
    try {
      if (await rearmWalks()) { setExamples(true); setWalksOn(true) }
      else setError('The walks could not be switched on. Try again in a moment.')
    } finally {
      setWalksBusy(false)
    }
  }

  const showExamples = async (on: boolean) => {
    setExamples(on)
    setSaving(true)
    try {
      await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ examples: on }) })
      // The board paints from the list it last saw; the next visit asks again.
      lastSeenProjects.clear()
    } finally {
      setSaving(false)
    }
  }

  const signOut = async () => {
    setBusy('signout')
    try {
      await createClient().auth.signOut()
      lastSeenProjects.clear()
      forgetOpened()
      router.push('/login')
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  const deleteAccount = async () => {
    const ok = await confirm({
      title: 'Delete your account?',
      body: 'Every check-in, capture, idea, piece and portrait entry is deleted with it. There is no undo. Export first if you want a copy.',
      confirmLabel: 'Delete everything',
      danger: true,
    })
    if (!ok) return
    setBusy('delete')
    setError(null)
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      const d = await res.json()
      if (!res.ok || !d.success) {
        setError(d.error || 'Could not delete the account.')
        return
      }
      await createClient().auth.signOut()
      lastSeenProjects.clear()
      forgetOpened()
      router.push('/login')
    } finally {
      setBusy(null)
    }
  }

  const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 0' }
  const label: React.CSSProperties = { ...typeRoles.ui, fontSize: 14, color: t.textPrimary, fontWeight: 500 }
  const hint: React.CSSProperties = { ...typeRoles.small, fontSize: 12, color: t.textMuted, marginTop: 2 }

  return (
    <ModalDialog onClose={onClose} title="Settings" subtitle={email ? <span>{email}</span> : undefined} maxWidth="520px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card padding={18}>
          <div style={row}>
            <div>
              <div style={label}>Container theme</div>
              <div style={hint}>The shell stays dark either way.</div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <Pill hue="neutral" selected={theme === 'light'} onClick={() => setTheme('light')} size="md">Light</Pill>
              <Pill hue="neutral" selected={theme === 'dark'} onClick={() => setTheme('dark')} size="md">Dark</Pill>
            </div>
          </div>
          <Divider />
          {/* Wraps: on a phone the list is nearly as wide as the card, and
             beside the words it pushed past the edge and left them a column
             one word wide. There it goes underneath. */}
          <div style={{ ...row, flexWrap: 'wrap', gap: '10px 16px' }}>
            <div style={{ flex: '1 1 180px', minWidth: 0 }}>
              <div style={label}>Dictation language</div>
              <div style={hint}>What the microphone listens for. The companion mirrors whatever you write.</div>
            </div>
            <select
              value={settings.dictation_lang ?? ''}
              onChange={(e) => {
                const v = e.target.value || null
                setDictationLangCache(v)
                save({ dictation_lang: v })
              }}
              aria-label="Dictation language"
              style={{ backgroundColor: t.inputBg, border: `1px solid ${t.inputBorder}`, borderRadius: radius.field, padding: '8px 10px', fontSize: 13, color: t.textPrimary, outline: 'none', maxWidth: '100%' }}
            >
              <option value="">Browser default</option>
              {DICTATION_LANGS.map((l) => (
                <option key={l.tag} value={l.tag}>{l.label}</option>
              ))}
            </select>
          </div>
          <Divider />
          <div style={row}>
            <div>
              <div style={label}>The Sunday letter</div>
              <div style={hint}>A short note each week, drawn from your work, captures and check-ins. Off by default.</div>
            </div>
            <Pill hue={settings.sunday_letter ? 'verdant' : 'neutral'} selected={settings.sunday_letter} onClick={() => save({ sunday_letter: !settings.sunday_letter })} size="md">
              {settings.sunday_letter ? 'On' : 'Off'}
            </Pill>
          </div>
        </Card>

        <BillingCard />

        <Card padding={18}>
          <div style={row}>
            <div>
              <div style={label}>Guided walks</div>
              <div style={hint}>Switch the short walks back on. Each part of the app shows you round the next time you open it.</div>
            </div>
            <GhostButton size="sm" onClick={turnWalksOn} loading={walksBusy} loadingLabel="Switching on…">Take the tour</GhostButton>
          </div>
          <Divider />
          <div style={row}>
            <div>
              <div style={label}>Your data</div>
              <div style={hint}>Everything you own, as one JSON file.</div>
            </div>
            <GhostButton href="/api/account" size="sm">Export</GhostButton>
          </div>
          <Divider />
          <div style={{ ...row, flexWrap: 'wrap', gap: '10px 16px' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={label}>Example projects</div>
              <div style={hint}>Projects made the way artists use the app, under Active on your Project Board. For looking at; they are not yours and nothing in them can be changed.</div>
            </div>
            {examples !== null && (
              <Pill hue={examples ? 'verdant' : 'neutral'} selected={examples} onClick={() => showExamples(!examples)} size="md">
                {examples ? 'On' : 'Off'}
              </Pill>
            )}
          </div>
          <Divider />
          {/* Wraps like the dictation row: the words need the width on a phone. */}
          <div style={{ ...row, flexWrap: 'wrap', gap: '10px 16px' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={label}>Share usage analytics</div>
              <div style={hint}>
                Which parts of your projects you use, and when: dates, counts and stages. Never what you write, and nothing from your check-ins.{' '}
                <a href="/privacy#analytics" target="_blank" rel="noopener noreferrer" style={{ color: t.textSecondary, textDecoration: 'underline', textUnderlineOffset: 3 }}>What this covers</a>
              </div>
            </div>
            {analytics !== null && (
              <Pill hue={analytics ? 'verdant' : 'neutral'} selected={analytics} onClick={() => shareAnalytics(!analytics)} size="md">
                {analytics ? 'On' : 'Off'}
              </Pill>
            )}
          </div>
          <Divider />
          <div style={row}>
            <div>
              <div style={label}>Sign out</div>
              <div style={hint}>On this device.</div>
            </div>
            <QuietButton size="sm" onClick={signOut} loading={busy === 'signout'} loadingLabel="Signing out…">Sign out</QuietButton>
          </div>
          <Divider />
          <div style={row}>
            <div>
              <div style={label}>Delete account</div>
              <div style={hint}>Removes your account and every row that belongs to it.</div>
            </div>
            <DangerButton size="sm" onClick={deleteAccount} loading={busy === 'delete'} loadingLabel="Deleting…">Delete</DangerButton>
          </div>
          {error && <p style={{ ...typeRoles.small, color: t.danger, marginTop: 8 }}>{error}</p>}
        </Card>
        <nav aria-label="Legal" style={{ ...typeRoles.small, fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
          {LEGAL_PAGES.map((p) => (
            <a key={p.href} href={p.href} target="_blank" rel="noopener noreferrer" style={{ color: t.textSecondary, textDecoration: 'underline', textUnderlineOffset: 3 }}>{p.label}</a>
          ))}
        </nav>
        <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, textAlign: 'right' }}>{saving ? 'Saving…' : ' '}</p>
      </div>
      {walksOn && <WalksOn onClose={() => setWalksOn(false)} onGo={(href) => { setWalksOn(false); onClose(); router.push(href) }} />}
    </ModalDialog>
  )
}

const WALK_PLACES: { href: string; title: string; body: string }[] = [
  { href: '/home', title: 'Home', body: 'What is on the page, and your capture bank.' },
  { href: '/check-in', title: 'Check-in', body: 'Saying how you are, or leaving a thought on a project.' },
  { href: '/idea-lab', title: 'Idea Lab', body: 'Summoning a question: movement, energy, open or charged.' },
  { href: '/project-board', title: 'Project Board', body: 'Opens an example made for what you do, and walks you through it.' },
  { href: '/portrait', title: 'Portrait', body: 'How a pattern gets from a check-in to here.' },
]

/** Said after "Take the tour": the walks are on, and where to start. */
function WalksOn({ onClose, onGo }: { onClose: () => void; onGo: (href: string) => void }) {
  const { t } = useTheme()
  return (
    <ModalDialog
      onClose={onClose}
      title="Guided walks are on"
      maxWidth="480px"
      footer={<div style={{ display: 'flex', justifyContent: 'flex-end' }}><GhostButton size="sm" onClick={onClose}>I’ll find my own way</GhostButton></div>}
    >
      <p style={{ ...typeRoles.ui, fontSize: 15, lineHeight: 1.6, color: t.textSecondary, margin: 0 }}>
        The next time you open any part of Companheiro, a short walk shows you round it. Pick whichever you would like a hand with:
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
        {WALK_PLACES.map((p) => (
          <button
            key={p.href}
            type="button"
            onClick={() => onGo(p.href)}
            style={{ textAlign: 'left', cursor: 'pointer', padding: '12px 14px', borderRadius: radius.field, border: `1px solid ${t.divider}`, background: t.cardBgInner, color: t.textPrimary }}
          >
            <span style={{ ...typeRoles.h3, display: 'block' }}>{p.title} →</span>
            <span style={{ ...typeRoles.small, display: 'block', color: t.textSecondary, marginTop: 2 }}>{p.body}</span>
          </button>
        ))}
      </div>
    </ModalDialog>
  )
}
