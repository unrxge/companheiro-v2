// The public origin used for absolute URLs in metadata (social previews,
// sitemap, robots). Set NEXT_PUBLIC_SITE_URL once a custom domain is live;
// until then Vercel's production domain is used.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')
).replace(/\/$/, '')

export const SITE_NAME = 'Companheiro'

// Kept under 160 characters: this is the line search engines show under the link.
export const SITE_DESCRIPTION =
  'Your vision is scattered across notes, drafts and half-finished things. Companheiro helps you find it, hold it, and build from it.'
