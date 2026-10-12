'use client'

// Owner-only: usage analytics, a person at a time (see lib/usage-analytics.ts
// for what that covers). The routes answer 404 to anyone else.
import { PeopleView, type PeopleSource } from '@/components/admin/people-view'

async function ask<T>(url: string): Promise<T> {
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(res.status === 404 ? 'This page is only for the owner (ADMIN_USER_IDS).' : body.error || 'Could not load.')
  return body as T
}

const source: PeopleSource = {
  list: () => ask('/api/admin/people'),
  person: (id) => ask(`/api/admin/people/${id}`),
}

export default function AdminPeoplePage() {
  return <PeopleView source={source} />
}
