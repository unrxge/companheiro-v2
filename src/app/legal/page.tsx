import type { Metadata } from 'next'
import { LegalPage, H2, A, Email, Identity } from '@/components/legal/legal-page'
import { LEGAL } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Business Details',
  description: 'Who runs Companheiro and how to contact us.',
  alternates: { canonical: '/legal' },
}

export default function BusinessDetailsPage() {
  return (
    <LegalPage title="Business details" current="/legal">
      <p>Companheiro is an independent product run by one person.</p>

      <H2 id="who">Who we are</H2>
      <Identity />
      {LEGAL.icoNumber && <p>ICO registration number: {LEGAL.icoNumber}</p>}

      <H2 id="contact">Contact</H2>
      <p>
        Email: <Email />. A real person reads every message; we aim to reply within two working days.
      </p>

      <H2 id="payments">Payments</H2>
      <p>
        Subscriptions are sold through Stripe Managed Payments. Stripe is the reseller (merchant of record) for each payment, handles sales tax and VAT, and
        its name appears on your receipt and card statement.
      </p>

      <H2 id="policies">Policies</H2>
      <p>
        <A href="/terms">Terms of Service</A> · <A href="/privacy">Privacy Policy</A> · <A href="/cookies">Cookie Policy</A> ·{' '}
        <A href="/refunds">Refunds &amp; cancellation</A> · <A href="/accessibility">Accessibility</A>
      </p>
    </LegalPage>
  )
}
