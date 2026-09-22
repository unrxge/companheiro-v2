import type { Metadata } from 'next'
import { Newsreader } from 'next/font/google'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Landing } from '@/components/landing/landing'

// The one serif on the page: the coloured word in the hero headline.
const newsreader = Newsreader({ subsets: ['latin'], style: ['italic'], weight: ['400'], variable: '--font-newsreader' })

export const metadata: Metadata = {
  title: 'Companheiro',
  description: 'Your vision is scattered across notes, drafts and half-finished things. Companheiro helps you find it, hold it, and build from it.',
  openGraph: {
    title: 'Companheiro',
    description: 'You already have a vision.',
    type: 'website',
  },
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
