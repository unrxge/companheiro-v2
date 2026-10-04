'use client'

// Where the button in a sign-up email lands. The email carries a one-time
// token (not a PKCE code), and it is only spent when the person presses
// Continue here. Two things that broke the old link no longer can:
//  - opening the email in a different browser or device from the one that
//    asked for it (a PKCE code only works in the browser that started it);
//  - a mail provider's link scanner visiting the link first and using it up
//    (a scanner loads the page; it does not press the button).
//
// The Supabase email templates must point here; see the comment at the foot.

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { AuthShell, AuthLink } from '@/components/auth/auth-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { PrimaryButton } from '@/components/ui/buttons'
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
  const [link, setLink] = useState<{ token: string; type: LinkType; next: string } | null>(null)
  const [missing, setMissing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const token = q.get('token_hash')
    const type = q.get('type') ?? 'email'
    if (!token || !TYPES.includes(type)) { setMissing(true); return }
    setLink({ token, type: type as LinkType, next: nextUrl(q.get('redirect_to')) })
  }, [])

  const confirm = async () => {
    if (!link || busy) return
    setBusy(true)
    setError(null)
    const { error: err } = await createClient().auth.verifyOtp({ token_hash: link.token, type: link.type })
    if (err) {
      setError('This link has already been used or has expired. Ask for a new one from the sign-in page.')
      setBusy(false)
      return
    }
    // The callback records the agreed Terms and sends them on to choose a password.
    window.location.href = link.next
  }

  return (
    <AuthShell
      title="Confirm your email."
      subtitle="One press, then you choose a password."
      footer={<span><AuthLink href="/login">Back to sign in</AuthLink></span>}
    >
      {missing ? (
        <p role="alert" style={{ ...typeRoles.small, color: t.danger }}>This link is incomplete. Ask for a new one from the sign-in page.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {error && <p role="alert" style={{ ...typeRoles.small, color: t.danger }}>{error}</p>}
          <PrimaryButton onClick={() => void confirm()} disabled={!link} loading={busy} loadingLabel="Confirming…" full size="lg">Continue</PrimaryButton>
        </div>
      )}
    </AuthShell>
  )
}

// Supabase → Authentication → Emails → "Confirm signup" AND "Magic Link":
// the button's link must be
//   {{ .SiteURL }}/confirm?token_hash={{ .TokenHash }}&type=email&redirect_to={{ .RedirectTo }}
// (in place of {{ .ConfirmationURL }}).
