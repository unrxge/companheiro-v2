import type { Metadata } from 'next'
import { Newsreader } from 'next/font/google'
import { Landing } from '@/components/landing/landing'

// The one serif on the page: the coloured word in the hero headline.
const newsreader = Newsreader({ subsets: ['latin'], style: ['italic'], weight: ['400'], variable: '--font-newsreader' })

// Title, description and preview image are inherited from the root layout;
// only the canonical URL is specific to the landing page.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

// Built once and served from the CDN, so a first visit never waits on a
// server function waking up. Reading cookies or the session here would make
// the page render per request again; the build fails rather than allow it.
// Signed-in visitors are sent on to /home by the middleware.
export const dynamic = 'error'

export default function RootPage() {
  return (
    <div className={newsreader.variable}>
      <Landing />
    </div>
  )
}
