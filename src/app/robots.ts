import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'
import { IS_LAB } from '@/lib/deploy-env'

// Only the landing page is public; everything else sits behind sign-in.
export default function robots(): MetadataRoute.Robots {
  // The lab is never for search engines.
  if (IS_LAB) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
