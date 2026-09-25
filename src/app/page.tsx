import type { Metadata } from 'next'
import { Newsreader } from 'next/font/google'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Landing } from '@/components/landing/landing'

// The one serif on the page: the coloured word in the hero headline.
const newsreader = Newsreader({ subsets: ['latin'], style: ['italic'], weight: ['400'], variable: '--font-newsreader' })

// Title, description and preview image are inherited from the root layout;
// only the canonical URL is specific to the landing page.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
}

// Signed in: straight to the app. Signed out: the public landing page.
export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) redirect('/home')

  return (
    <div className={newsreader.variable}>
      <Landing />
    </div>
  )
}
