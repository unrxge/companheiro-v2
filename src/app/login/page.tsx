import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
import { enabledProviders } from '@/lib/auth-providers'

export const metadata: Metadata = {
  title: 'Sign in',
  alternates: { canonical: '/login' },
}

// Served from the CDN and rebuilt in the background at most every five
// minutes, which is how often the provider list is re-read from Supabase.
// The page takes no searchParams on purpose: reading them here would make it
// render per request (the form reads ?error=oauth itself, in the browser).
export const revalidate = 300

// One page for signing in and creating an account: Google or an email link.
export default async function LoginPage() {
  return <AuthForm providers={await enabledProviders()} />
}
