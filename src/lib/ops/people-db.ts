// Reads for /admin/people. Server only (service role). Every read names its
// columns from COLUMNS in ./people.ts, which holds no written words.
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { COLUMNS, type Account, type Rows, type Table } from './people'
import type { BillingEvent, Call } from './money'

const PAGE = 1000

/** Every account. The admin API hands them over a page at a time. */
export async function everyUser(db: SupabaseClient): Promise<User[]> {
  const all: User[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: PAGE })
    if (error) throw error
    all.push(...data.users)
    if (data.users.length < PAGE) return all
  }
}

/** All of one table's rows for these people, in pages (the API stops at 1000 a request). */
async function read(db: SupabaseClient, table: Table, userIds: string[], since?: string) {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    let q = db.from(table).select(COLUMNS[table]).in('user_id', userIds).order('id').range(from, from + PAGE - 1)
    if (since) q = q.gte('date', since)
    const { data, error } = await q
    if (error) throw error
    out.push(...((data ?? []) as unknown as Record<string, unknown>[]))
    if ((data ?? []).length < PAGE) return out
  }
}

/** Just enough for the list: projects, and the last 30 days of writing time. */
export async function listRows(db: SupabaseClient, userIds: string[], now = Date.now()): Promise<Rows> {
  if (!userIds.length) return {}
  const since = new Date(now - 30 * 86_400_000).toISOString().slice(0, 10)
  const [studio_projects, writing_activity] = await Promise.all([
    read(db, 'studio_projects', userIds),
    read(db, 'writing_activity', userIds, since),
  ])
  return { studio_projects, writing_activity }
}

/** Everything COLUMNS names, for one person. */
export async function personRows(db: SupabaseClient, userId: string): Promise<Rows> {
  const tables = Object.keys(COLUMNS) as Table[]
  const lists = await Promise.all(tables.map((t) => read(db, t, [userId])))
  return Object.fromEntries(tables.map((t, i) => [t, lists[i]]))
}

/** Who each account is: the name and practices they gave, and their plan. */
export async function accountsFor(db: SupabaseClient, users: User[]): Promise<Account[]> {
  if (!users.length) return []
  const ids = users.map((u) => u.id)
  const [{ data: profiles }, { data: subs }] = await Promise.all([
    db.from('profiles').select('user_id, name, practices').in('user_id', ids),
    db.from('subscriptions').select('user_id, status, tier').in('user_id', ids),
  ])
  const profile = new Map((profiles ?? []).map((p) => [p.user_id, p]))
  const sub = new Map((subs ?? []).map((s) => [s.user_id, s]))
  return users.map((u) => ({
    id: u.id,
    email: u.email ?? '',
    joined: u.created_at,
    name: profile.get(u.id)?.name ?? (u.user_metadata?.profile as { name?: string } | undefined)?.name ?? null,
    practices: profile.get(u.id)?.practices ?? [],
    status: sub.get(u.id)?.status ?? null,
    tier: sub.get(u.id)?.tier ?? null,
  }))
}

/**
 * What each of these people's companion calls cost, and their plan changes:
 * numbers and dates about the account, for lib/ops/money.ts. Only calls made
 * in this environment count (the lab's database also holds none of live's).
 */
export async function moneyRows(db: SupabaseClient, userIds: string[], env: string): Promise<{ calls: Map<string, Call[]>; events: Map<string, BillingEvent[]> }> {
  const calls = new Map<string, Call[]>()
  const events = new Map<string, BillingEvent[]>()
  if (!userIds.length) return { calls, events }
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from('ai_calls').select('user_id, cost_micros, created_at').in('user_id', userIds).eq('env', env).order('id').range(from, from + PAGE - 1)
    if (error) throw error
    for (const r of data ?? []) calls.set(r.user_id, [...(calls.get(r.user_id) ?? []), { cost_micros: Number(r.cost_micros), created_at: r.created_at }])
    if ((data ?? []).length < PAGE) break
  }
  const { data, error } = await db.from('billing_events').select('user_id, kind, tier, billing_interval, created_at').in('user_id', userIds).order('id')
  if (error) throw error
  for (const r of data ?? []) events.set(r.user_id, [...(events.get(r.user_id) ?? []), r])
  return { calls, events }
}
