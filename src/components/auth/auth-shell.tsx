'use client'

import Link from 'next/link'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, Container, Card } from '@/components/shell/page-shell'
import { shell, type as typeRoles } from '@/lib/design-tokens'
import { LEGAL_PAGES } from '@/lib/legal'

/** Auth screens: atmosphere, no dock, one card, the wordmark above. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const { t } = useTheme()
  return (
    <PageShell mood="ember" intensity={0.9} maxWidth={440} dock={false}>
      <div style={{ minHeight: 'calc(100dvh - 120px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ ...typeRoles.eyebrow, color: shell.muted, marginBottom: 10 }}>Companheiro</p>
          <h1 style={{ ...typeRoles.display, color: shell.text }}>{title}</h1>
          {subtitle && <p style={{ ...typeRoles.ui, fontSize: 14, color: shell.muted, marginTop: 10, maxWidth: '40ch' }}>{subtitle}</p>}
        </div>
        {/* Spacing accounts for the shadows, not just the boxes: the card's
            shadow drops 12px and blurs 28px, so the footer starts clear of
            it; the container's is heavier still (30px/70px), so the legal
            links sit further out. Margins go after the type spread, which
            resets margin to 0. The bottom padding is trimmed by the footer
            line's half-leading so the text looks as inset as the card. */}
        <Container padding={footer ? '24px 24px 21px' : 24}>
          <Card>{children}</Card>
          {footer && <div style={{ ...typeRoles.small, marginTop: 22, color: t.textSecondary, display: 'flex', gap: '6px 14px', flexWrap: 'wrap', justifyContent: 'center' }}>{footer}</div>}
        </Container>
        <nav aria-label="Legal" style={{ ...typeRoles.small, marginTop: 32, fontSize: 12, display: 'flex', gap: '6px 14px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {LEGAL_PAGES.slice(0, 4).map((p) => (
            <Link key={p.href} href={p.href} style={{ color: shell.muted }}>{p.label}</Link>
          ))}
        </nav>
      </div>
    </PageShell>
  )
}

export function AuthLink({ href, children }: { href: string; children: React.ReactNode }) {
  const { t } = useTheme()
  return (
    <Link href={href} style={{ color: t.textPrimary, textDecoration: 'underline', textUnderlineOffset: 3 }}>
      {children}
    </Link>
  )
}
