import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'
import { LEGAL_PAGES } from '@/lib/legal'

// Public pages only. Add pricing, about, etc. here as they appear.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: 'monthly', priority: 1 },
    ...LEGAL_PAGES.map((p) => ({ url: `${SITE_URL}${p.href}`, changeFrequency: 'yearly' as const, priority: 0.3 })),
  ]
}
