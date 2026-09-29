import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
import { enabledProviders } from '@/lib/auth-providers'

export const metadata: Metadata = {
  title: 'Sign in',
  alternates: { canonical: '/login' },
}

// One page for signing in and creating an account: Google or an email link.
// ?error=oauth comes back from /api/auth/callback when a Google sign-in or
// email link failed.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, providers] = await Promise.all([searchParams, enabledProviders()])
  return <AuthForm providers={providers} oauthFailed={params.error === 'oauth'} />
}
