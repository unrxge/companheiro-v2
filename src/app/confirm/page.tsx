'use client'

// Where the button in a sign-up email lands. The email carries a one-time
// token (not a PKCE code), so it works in any browser or device, not only the
// one that asked for it. It is confirmed as soon as the page runs, with
// nothing to press: the person sees a moment of "Confirming" and is on their
// way into the app. The token is spent by this page's script, not
// by the request for the page, so a mail scanner that only fetches the link
// does not use it up (one that runs scripts still could; if that ever shows
// up as "already used" reports, put a button back in front of `confirm`).
//
// The Supabase email templates must point here; see the comment at the foot.

import { useEffect, useRef, useState } from 'react'
import { AuthShell, AuthLink } from '@/components/auth/auth-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { WorkingDots } from '@/components/ui/working'
import { PrimaryButton } from '@/components/ui/buttons'
import { type as typeRoles } from '@/lib/design-tokens'

type LinkType = 'email' | 'signup' | 'magiclink'
const TYPES: readonly string[] = ['email', 'signup', 'magiclink']

/** Only ever back to our own callback, whatever the link says. */
function nextUrl(raw: string | null): string {
  const fallback = '/api/auth/callback'
  if (!raw) return fallback
  try {
    const u = new URL(raw, window.location.origin)
    return u.origin === window.location.origin && u.pathname === '/api/auth/callback' ? `${u.pathname}${u.search}` : fallback
  } catch {
    return fallback
  }
}

export default function ConfirmPage() {
  const { t } = useTheme()
  const [failed, setFailed] = useState<string | null>(null)
  // An emailed link only lasts so long (an hour unless Supabase is told
  // otherwise), and someone who went straight into the app may open it days
  // later. A fresh one is offered right here rather than sending them away.
  const [fresh, setFresh] = useState<'idle' | 'sending' | 'sent' | 'signin'>('idle')

  const sendFresh = async () => {
    setFresh('sending')
    const { sendConfirmEmail } = await import('@/lib/confirm-email')
    // It can only be sent to whoever is signed in on this browser.
    setFresh((await sendConfirmEmail()) ? 'sent' : 'signin')
  }
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const q = new URLSearchParams(window.location.search)
    const token = q.get('token_hash')
    const type = q.get('type') ?? 'email'
    if (!token || !TYPES.includes(type)) {
      setFailed('This link is incomplete. Ask for a new one from the sign-in page.')
      return
    }
    const next = nextUrl(q.get('redirect_to'))
    // Spent on the server, which is also what records the address as confirmed.
    void fetch('/api/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token_hash: token, type: type as LinkType }),
    }).then((res) => {
      if (!res.ok) setFailed('This link has expired or has already been used. Nothing is lost: a new one takes a moment.')
      // The callback sends them on: into the app, or to choose a password on an older link.
      else window.location.replace(next)
    }).catch(() => setFailed('That did not go through. Check your connection and open the link again.'))
  }, [])

  return (
    <AuthShell
      title={failed ? 'That link didn’t work.' : 'One moment.'}
      subtitle={failed ? undefined : 'Confirming your email.'}
      footer={failed ? <span><AuthLink href="/login">Back to sign in</AuthLink></span> : undefined}
    >
      {failed ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p role="alert" style={{ ...typeRoles.small, color: t.textSecondary }}>{failed}</p>
          {fresh === 'sent' ? (
            <p role="status" style={{ ...typeRoles.small, color: t.textPrimary }}>A new link is on its way. Use that one; it works from any device.</p>
          ) : fresh === 'signin' ? (
            <p role="status" style={{ ...typeRoles.small, color: t.textPrimary }}>
              Sign in first, and you&rsquo;ll be offered a new link from inside.
            </p>
          ) : (
            <PrimaryButton onClick={() => void sendFresh()} loading={fresh === 'sending'} loadingLabel="Sending…" full size="lg">Send me a new link</PrimaryButton>
          )}
        </div>
      ) : (
        <div role="status" style={{ ...typeRoles.ui, fontSize: 15, color: t.textSecondary, display: 'flex', alignItems: 'center', gap: 10, minHeight: 48 }}>
          <WorkingDots />
          <span>Taking you in…</span>
        </div>
      )}
    </AuthShell>
  )
}

// Supabase → Authentication → Emails → "Confirm signup" AND "Magic Link":
// the button's link must be
//   {{ .SiteURL }}/confirm?token_hash={{ .TokenHash }}&type=email&redirect_to={{ .RedirectTo }}
// (in place of {{ .ConfirmationURL }}).
