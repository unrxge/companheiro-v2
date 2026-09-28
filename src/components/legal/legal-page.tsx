// Shared frame for the public legal pages (/terms, /privacy, /cookies,
// /refunds, /accessibility, /legal). Server-rendered and static: plain ink
// shell, one readable column, no motion. Text colours come from the shell
// tokens, which clear WCAG AA on ink (bone 16:1, muted 5.3:1).

import Link from 'next/link'
import { LEGAL, LEGAL_PAGES, LEGAL_UPDATED } from '@/lib/legal'
import { shell } from '@/lib/design-tokens'

const vars = {
  '--ink': shell.ink,
  '--bone': shell.text,
  '--muted': shell.muted,
  '--line': shell.line,
  '--ember': '#e0674a',
  colorScheme: 'dark',
} as React.CSSProperties

export function LegalPage({ title, current, children }: { title: string; current: string; children: React.ReactNode }) {
  return (
    <div style={vars} className="min-h-[100dvh] bg-[var(--ink)] font-[family-name:var(--font-geist-sans)] text-[var(--bone)]">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded focus:bg-[var(--bone)] focus:px-3 focus:py-2 focus:text-[var(--ink)]">
        Skip to content
      </a>
      <header className="mx-auto flex h-16 w-full max-w-[760px] items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em]">
          <img src="/favicon.svg" alt="" width={22} height={22} />
          Companheiro
        </Link>
        <Link href="/login" className="rounded-full px-4 py-2 text-[14px] font-medium text-[var(--muted)] hover:text-[var(--bone)]">
          Log in
        </Link>
      </header>

      <main id="content" className="mx-auto w-full max-w-[760px] px-4 pb-20 pt-8 md:px-8 md:pt-14">
        <h1 className="text-balance text-[34px] font-bold leading-[1.08] tracking-[-0.03em] md:text-[44px]">{title}</h1>
        <p className="mt-3 text-[14px] text-[var(--muted)]">Last updated {LEGAL_UPDATED}</p>
        <div className="legal-prose mt-10 flex flex-col gap-5 text-[16px] leading-[1.7] text-[var(--bone)]/90">{children}</div>
      </main>

      <LegalFooter current={current} />
    </div>
  )
}

export function LegalFooter({ current }: { current?: string }) {
  return (
    <footer className="mx-auto w-full max-w-[760px] border-t border-[var(--line)] px-4 pb-[max(32px,env(safe-area-inset-bottom))] pt-6 text-[13px] text-[var(--muted)] md:px-8">
      <nav aria-label="Legal">
        <ul className="flex flex-wrap gap-x-5 gap-y-2">
          {LEGAL_PAGES.map((p) => (
            <li key={p.href}>
              <Link
                href={p.href}
                aria-current={p.href === current ? 'page' : undefined}
                className={p.href === current ? 'text-[var(--bone)] underline underline-offset-4' : 'hover:text-[var(--bone)]'}
              >
                {p.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <p className="mt-4">&copy; {new Date().getFullYear()} {LEGAL.name || 'Companheiro'}</p>
    </footer>
  )
}

export function H2({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-6 scroll-mt-8 text-[22px] font-semibold tracking-[-0.02em] text-[var(--bone)]">
      {children}
    </h2>
  )
}

export function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="mt-2 scroll-mt-8 text-[17px] font-semibold text-[var(--bone)]">
      {children}
    </h3>
  )
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-6 marker:text-[var(--muted)]">{children}</ul>
}

export function A({ href, children }: { href: string; children: React.ReactNode }) {
  const external = /^https?:|^mailto:/.test(href)
  const cls = 'underline underline-offset-4 decoration-[var(--muted)] hover:decoration-[var(--bone)]'
  return external ? (
    <a href={href} className={cls} {...(href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
      {children}
      {href.startsWith('http') && <span className="sr-only"> (opens in a new tab)</span>}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  )
}

/** "write to hello@…" when an address is configured, otherwise "contact us". */
export function Email() {
  return LEGAL.email ? <A href={`mailto:${LEGAL.email}`}>{LEGAL.email}</A> : <>the contact address on our <A href="/legal">business details</A> page</>
}

/** Name and address block, leaving out anything not configured. */
export function Identity() {
  const lines = [LEGAL.name, LEGAL.address, LEGAL.companyNumber, LEGAL.vatNumber ? `VAT no. ${LEGAL.vatNumber}` : ''].filter(Boolean)
  if (!lines.length) return null
  return (
    <address className="not-italic">
      {lines.map((l) => (
        <span key={l} className="block">
          {l}
        </span>
      ))}
    </address>
  )
}
