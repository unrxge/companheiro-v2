'use client'

// Where the button in a sign-up email lands. The email carries a one-time
// token (not a PKCE code), so it works in any browser or device, not only the
// one that asked for it. It is confirmed as soon as the page runs, with
// nothing to press: the person sees a moment of "Confirming" and is on their
// way to choosing a password. The token is spent by this page's script, not
// by the request for the page, so a mail scanner that only fetches the link
// does not use it up (one that runs scripts still could; if that ever shows
// up as "already used" reports, put a button back in front of `confirm`).
//
// The Supabase email templates must point here; see the comment at the foot.

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, AuthLink } from '@/components/auth/auth-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { WorkingDots } from '@/components/ui/working'
import { type as typeRoles } from '@/lib/design-tokens'

type LinkType = 'email' | 'signup' | 'magiclink'
const TYPES: readonly string[] = ['email', 'signup', 'magiclink']

/** Only ever back to our own callback, whatever the link says. */
function nextUrl(raw: string | null): string {
  const fallback = '/api/auth/callback?next=set-password'
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
    void createClient().auth.verifyOtp({ token_hash: token, type: type as LinkType }).then(({ error }) => {
      if (error) setFailed('This link has already been used or has expired. Ask for a new one from the sign-in page.')
      // The callback records the agreed Terms and sends them on to choose a password.
      else window.location.replace(next)
    })
  }, [])

  return (
    <AuthShell
      title={failed ? 'That link didn’t work.' : 'One moment.'}
      subtitle={failed ? undefined : 'Confirming your email.'}
      footer={failed ? <span><AuthLink href="/login">Back to sign in</AuthLink></span> : undefined}
    >
      {failed ? (
        <p role="alert" style={{ ...typeRoles.small, color: t.danger }}>{failed}</p>
      ) : (
        <div role="status" style={{ ...typeRoles.ui, fontSize: 15, color: t.textSecondary, display: 'flex', alignItems: 'center', gap: 10, minHeight: 48 }}>
          <WorkingDots />
          <span>Taking you to choose a password…</span>
        </div>
      )}
    </AuthShell>
  )
}

// Supabase → Authentication → Emails → "Confirm signup" AND "Magic Link":
// the button's link must be
//   {{ .SiteURL }}/confirm?token_hash={{ .TokenHash }}&type=email&redirect_to={{ .RedirectTo }}
// (in place of {{ .ConfirmationURL }}).
