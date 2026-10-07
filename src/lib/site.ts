import { IS_LAB } from '@/lib/deploy-env'

// The public origin used for absolute URLs in metadata (social previews,
// sitemap, robots). Set NEXT_PUBLIC_SITE_URL once a custom domain is live;
// until then Vercel's production domain is used. A lab deployment answers
// with its own branch address, whatever NEXT_PUBLIC_SITE_URL says, so nothing
// it produces points people at the live site as if it were the same place.
const labOrigin = IS_LAB ? (process.env.VERCEL_BRANCH_URL ?? process.env.VERCEL_URL) : undefined

export const SITE_URL = (
  labOrigin
    ? `https://${labOrigin}`
    : (process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : 'http://localhost:3000'))
).replace(/\/$/, '')

// The lab says so in every tab title and link preview.
export const SITE_NAME = IS_LAB ? 'Companheiro Lab' : 'Companheiro'

// Kept under 160 characters: this is the line search engines show under the link.
export const SITE_DESCRIPTION =
  'Your vision is scattered across notes, drafts and half-finished things. Companheiro helps you find it, hold it, and build from it.'

// Where people write to a person rather than a form: fair-use questions and
// reduced-price requests. Deliberately only ever shown in full, never as a
// form or a button that pre-fills anything.
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() ?? ''
