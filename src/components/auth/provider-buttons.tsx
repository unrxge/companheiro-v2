'use client'

// "Continue with Google". Colours, mark and wording follow Google's sign-in
// branding rules: the four-colour G on its neutral fill, never recoloured.
// (Apple was dropped: Sign in with Apple on the web needs a paid Apple
// Developer Program membership.)

import { useTheme } from '@/components/theme/theme-provider'
import { WorkingDots } from '@/components/ui/working'
import { fonts, radius } from '@/lib/design-tokens'
import type { OAuthProvider } from '@/lib/auth-providers'

function GoogleMark() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9087-2.2581c-.8059.54-1.8368.859-3.0477.859-2.344 0-4.3282-1.5831-5.036-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.2822-1.1168-.2822-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z" />
      <path fill="#EA4335" d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" />
    </svg>
  )
}

const LABEL: Record<OAuthProvider, string> = { google: 'Continue with Google' }

export function ProviderButtons({
  providers,
  busy,
  disabled,
  onChoose,
}: {
  providers: OAuthProvider[]
  busy: OAuthProvider | null
  disabled: boolean
  onChoose: (p: OAuthProvider) => void
}) {
  const { theme } = useTheme()
  const dark = theme === 'dark'
  if (!providers.length) return null

  const look: Record<OAuthProvider, { bg: string; fg: string; border: string }> = {
    google: dark ? { bg: '#131314', fg: '#e3e3e3', border: '#8e918f' } : { bg: '#ffffff', fg: '#1f1f1f', border: '#747775' },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {providers.map((p) => {
        const c = look[p]
        const isBusy = busy === p
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChoose(p)}
            disabled={disabled}
            aria-busy={isBusy || undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              width: '100%',
              minHeight: 48,
              padding: '0 20px',
              borderRadius: radius.field,
              border: `1px solid ${c.border}`,
              backgroundColor: c.bg,
              color: c.fg,
              fontFamily: fonts.ui,
              fontSize: 15,
              fontWeight: 500,
              cursor: isBusy ? 'progress' : disabled ? 'not-allowed' : 'pointer',
              opacity: disabled && !isBusy ? 0.5 : 1,
            }}
          >
            <GoogleMark />
            {isBusy ? <WorkingDots /> : LABEL[p]}
          </button>
        )
      })}
    </div>
  )
}
