import { redirect } from 'next/navigation'

// Sign-up lives on the same page as sign-in. Old links and the landing's
// Begin buttons still point here; forward them, keeping any attribution
// (utm_*, ref, via, landing) the link carried.
export default async function SignupPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) if (typeof v === 'string') q.set(k, v)
  q.set('mode', 'create')
  redirect(`/login?${q}`)
}
