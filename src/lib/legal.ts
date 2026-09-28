// Who runs Companheiro, for the legal pages (privacy, terms, business details).
//
// These come from environment variables rather than source so a home address
// never lands in git history. Set them in Vercel (Production) and redeploy:
//
//   NEXT_PUBLIC_LEGAL_NAME      Required. The legal person behind the service,
//                               e.g. "Jane Doe, trading as Companheiro" (sole
//                               trader) or "Companheiro Ltd" (company).
//   NEXT_PUBLIC_LEGAL_ADDRESS   Required. A geographic address where post is
//                               received (UK E-Commerce Regulations 2002, reg 6;
//                               UK GDPR art 13). A registered-office or
//                               virtual-office service is fine.
//   NEXT_PUBLIC_COMPANY_NUMBER  Only if a limited company: "Company no. 12345678,
//                               registered in England and Wales".
//   NEXT_PUBLIC_VAT_NUMBER      Only if VAT-registered.
//   NEXT_PUBLIC_ICO_NUMBER      The ICO data protection fee registration number.
//   NEXT_PUBLIC_CONTACT_EMAIL   Already used elsewhere (see lib/site.ts).
//
// A missing value is left out of the page, never replaced by placeholder text.

import { CONTACT_EMAIL, SITE_URL } from '@/lib/site'

const env = (v: string | undefined) => v?.trim() ?? ''

export const LEGAL = {
  name: env(process.env.NEXT_PUBLIC_LEGAL_NAME),
  address: env(process.env.NEXT_PUBLIC_LEGAL_ADDRESS),
  companyNumber: env(process.env.NEXT_PUBLIC_COMPANY_NUMBER),
  vatNumber: env(process.env.NEXT_PUBLIC_VAT_NUMBER),
  icoNumber: env(process.env.NEXT_PUBLIC_ICO_NUMBER),
  email: CONTACT_EMAIL,
  site: SITE_URL,
} as const

/** Shown at the top of every legal page. Bump when the text changes materially. */
export const LEGAL_UPDATED = '28 September 2026'

/**
 * Stored with each new account (auth user metadata) so there is a record of
 * which version someone agreed to. Bump when Terms or Privacy change in a way
 * people should be told about.
 */
export const LEGAL_VERSION = '2026-09-28'

export const LEGAL_PAGES = [
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/cookies', label: 'Cookies' },
  { href: '/refunds', label: 'Refunds & cancellation' },
  { href: '/accessibility', label: 'Accessibility' },
  { href: '/legal', label: 'Business details' },
] as const
