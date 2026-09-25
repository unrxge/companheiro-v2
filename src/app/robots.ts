import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'

// Only the landing page is public; everything else sits behind sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
