import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Landing } from '@/components/landing/landing'

export const metadata: Metadata = {
  title: 'Companheiro',
  description: 'Companheiro listens while you talk through what you want to make, and hands it back in words you recognise.',
  openGraph: {
    title: 'Companheiro',
    description: 'You already know what you want to make. You just can’t say it yet.',
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

  return <Landing />
}
