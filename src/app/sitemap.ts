import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Public pages only. Add pricing, about, etc. here as they appear.
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${SITE_URL}/`, changeFrequency: 'monthly', priority: 1 }]
}
