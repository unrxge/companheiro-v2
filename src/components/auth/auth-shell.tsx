'use client'

import Link from 'next/link'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, Container, Card } from '@/components/shell/page-shell'
import { shell, type as typeRoles } from '@/lib/design-tokens'

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
        <Container>
          <Card>{children}</Card>
          {footer && <div style={{ marginTop: 16, ...typeRoles.small, color: t.textSecondary, display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>{footer}</div>}
        </Container>
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
