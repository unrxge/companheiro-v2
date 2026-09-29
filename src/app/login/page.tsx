import type { Metadata } from 'next'
import { AuthForm } from '@/components/auth/auth-form'
import { enabledProviders } from '@/lib/auth-providers'

export const metadata: Metadata = {
  title: 'Sign in',
  alternates: { canonical: '/login' },
}

// One page for signing in and creating an account. ?mode=create opens on
// "Create account" (the landing's Begin buttons arrive that way via /signup);
// ?error=oauth comes back from /api/auth/callback when Apple or Google failed.
export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [params, providers] = await Promise.all([searchParams, enabledProviders()])
  return <AuthForm initialMode={params.mode === 'create' ? 'create' : 'signin'} providers={providers} oauthFailed={params.error === 'oauth'} />
}
