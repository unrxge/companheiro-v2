// Copies one person's whole account from live into the lab, so new features
// can be tried on real history. Reads live, writes only the lab.
//
//   node scripts/copy-to-lab.mjs                 every lab account whose email also exists on live
//   node scripts/copy-to-lab.mjs you@example.com just that one
//
// The person signs up in the lab first (any password); this then replaces
// everything that lab account holds with a copy of the live one: projects,
// pieces, check-ins, portrait, conversations, settings, plan, and the images
// and recordings in storage. Run it again whenever a fresh copy is wanted.
// Ids are kept, except the account id, which becomes the lab account's.
// Usage records, billing events and other ops logs are not copied.
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIVE_REF = 'qtyihplgqaqcbzkvjnld' // same as LIVE_SUPABASE_REF in src/lib/deploy-env.ts
const BUCKET = 'studio-media'
const SKIP = new Set(['ai_calls', 'ai_usage', 'billing_events', 'ops_events', 'signup_attribution', 'trial_claims'])

const readEnv = (name) => {
  const path = join(ROOT, name)
  if (!existsSync(path)) return null
  return Object.fromEntries(readFileSync(path, 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
}
const liveEnv = readEnv('.env.live') ?? readEnv('.env.local')
const labEnv = readEnv('.env.lab')
if (!liveEnv?.NEXT_PUBLIC_SUPABASE_URL?.includes(LIVE_REF)) throw new Error('No live credentials (.env.live or .env.local).')
if (!labEnv?.NEXT_PUBLIC_SUPABASE_URL || labEnv.NEXT_PUBLIC_SUPABASE_URL.includes(LIVE_REF)) throw new Error('.env.lab must hold the LAB project.')

const side = (e) => {
  const url = e.NEXT_PUBLIC_SUPABASE_URL, key = e.SUPABASE_SERVICE_ROLE_KEY
  const headers = { apikey: key, Authorization: `Bearer ${key}` }
  const call = async (path, init = {}) => {
    const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init.headers ?? {}) } })
    const text = await res.text()
    let body; try { body = text ? JSON.parse(text) : null } catch { body = text }
    return { ok: res.ok, status: res.status, body }
  }
  return { url, call }
}
const live = side(liveEnv)
const lab = side(labEnv)

async function users(s) {
  const { body } = await s.call('/auth/v1/admin/users?per_page=1000')
  return body.users
}

// Tables (with a user_id) and the tables each points at, from the API description.
async function tableGraph() {
  const { body: spec } = await live.call('/rest/v1/')
  const tables = {}
  for (const [t, d] of Object.entries(spec.definitions)) {
    if (SKIP.has(t) || !d.properties.user_id) continue
    tables[t] = Object.values(d.properties).map((p) => p.description?.match(/Foreign Key to `([a-z_]+)\./)?.[1]).filter(Boolean)
  }
  return tables
}

async function rowsOf(table, userId) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { ok, body } = await live.call(`/rest/v1/${table}?user_id=eq.${userId}&select=*`, { headers: { Range: `${from}-${from + 999}` } })
    if (!ok) throw new Error(`reading ${table}: ${JSON.stringify(body)}`)
    out.push(...body)
    if (body.length < 1000) return out
  }
}

const insert = (table, rows) =>
  lab.call(`/rest/v1/${table}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify(rows) })

async function copyAccount(liveId, labId, email) {
  console.log(`\n${email}: live ${liveId.slice(0, 8)} → lab ${labId.slice(0, 8)}`)
  const graph = await tableGraph()
  const names = Object.keys(graph)
  const swap = (v) => JSON.parse(JSON.stringify(v).replaceAll(liveId, labId))

  // 1. Empty the lab account. Children before parents, repeated until nothing is left.
  for (let pass = 0; pass < 6; pass++) {
    let left = 0
    for (const t of names) {
      const r = await lab.call(`/rest/v1/${t}?user_id=eq.${labId}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
      if (!r.ok) left++
    }
    if (!left) break
  }

  // 2. Read live.
  const pending = {}
  for (const t of names) {
    const rows = swap(await rowsOf(t, liveId))
    if (rows.length) pending[t] = rows
  }

  // 3. Write, parents first. A row that still points at something not yet
  // written waits for the next pass; columns the database fills itself are dropped.
  const dropped = {}
  const strip = (t, row) => { const r = { ...row }; for (const c of dropped[t] ?? []) delete r[c]; return r }
  const tryRows = async (t, rows) => {
    for (;;) {
      const r = await insert(t, rows.map((row) => strip(t, row)))
      if (r.ok) return true
      const generated = String(r.body?.message ?? '').match(/non-DEFAULT value into column "([a-z_]+)"/)?.[1]
      if (!generated) return r
      ;(dropped[t] ??= []).push(generated)
    }
  }
  const deferred = [] // [table, id, column, value] put back once everything exists
  for (let pass = 0, progress = true; progress && Object.keys(pending).length; pass++) {
    progress = false
    for (const t of Object.keys(pending)) {
      if (graph[t].some((p) => p !== t && pending[p]) && pass < 3) continue
      const whole = await tryRows(t, pending[t])
      if (whole === true) { delete pending[t]; progress = true; continue }
      const still = []
      for (const row of pending[t]) if ((await tryRows(t, [row])) !== true) still.push(row)
      if (still.length < pending[t].length) progress = true
      if (still.length) pending[t] = still; else delete pending[t]
    }
    // Stuck on a loop of references: write the remaining rows without their
    // optional links, and restore the links afterwards.
    if (!progress && Object.keys(pending).length) {
      for (const t of Object.keys(pending)) {
        const { body: spec } = await live.call('/rest/v1/')
        const links = Object.entries(spec.definitions[t].properties).filter(([c, p]) => c !== 'user_id' && /Foreign Key/.test(p.description ?? '') && !spec.definitions[t].required?.includes(c)).map(([c]) => c)
        pending[t] = pending[t].map((row) => {
          const r = { ...row }
          for (const c of links) if (r[c] != null) { deferred.push([t, row.id, c, r[c]]); r[c] = null }
          return r
        })
      }
      progress = true
    }
  }
  for (const [t, id, c, v] of deferred) {
    const r = await lab.call(`/rest/v1/${t}?id=eq.${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ [c]: v }) })
    if (!r.ok) console.log(`  could not restore ${t}.${c} on ${id}: ${r.body?.message}`)
  }
  for (const [t, rows] of Object.entries(pending)) {
    const r = await tryRows(t, [rows[0]])
    console.log(`  NOT copied: ${rows.length} row(s) of ${t} — ${r.body?.message ?? r.status}`)
  }

  // 4. Images and recordings.
  const files = []
  const walk = async (prefix) => {
    const { body } = await live.call(`/storage/v1/object/list/${BUCKET}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefix, limit: 1000 }) })
    for (const item of body ?? []) {
      const path = `${prefix}/${item.name}`
      if (item.id) files.push(path); else await walk(path)
    }
  }
  await walk(liveId)
  let copied = 0
  for (const path of files) {
    const res = await fetch(`${live.url}/storage/v1/object/${BUCKET}/${path}`, { headers: { apikey: liveEnv.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${liveEnv.SUPABASE_SERVICE_ROLE_KEY}` } })
    if (!res.ok) { console.log(`  file not read: ${path}`); continue }
    const up = await lab.call(`/storage/v1/object/${BUCKET}/${path.replaceAll(liveId, labId)}`, {
      method: 'POST', headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream', 'x-upsert': 'true' }, body: Buffer.from(await res.arrayBuffer()),
    })
    if (up.ok) copied++; else console.log(`  file not written: ${path} (${up.body?.message ?? up.status})`)
  }

  let rows = 0, short = []
  for (const t of names) {
    const head = async (s, id) => Number((await fetch(`${s.url}/rest/v1/${t}?user_id=eq.${id}&select=user_id`, { method: 'HEAD', headers: { apikey: (s === live ? liveEnv : labEnv).SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${(s === live ? liveEnv : labEnv).SUPABASE_SERVICE_ROLE_KEY}`, Prefer: 'count=exact' } })).headers.get('content-range')?.split('/')[1] ?? 0)
    const [a, b] = [await head(live, liveId), await head(lab, labId)]
    rows += b
    if (a !== b) short.push(`${t} ${b}/${a}`)
  }
  console.log(`  ${rows} rows copied${short.length ? `; differing: ${short.join(', ')}` : ', every table matches live'}`)
  console.log(`  files: ${copied} of ${files.length} copied`)
}

const only = process.argv[2]?.toLowerCase()
const [liveUsers, labUsers] = await Promise.all([users(live), users(lab)])
const pairs = labUsers
  .filter((u) => u.email && (!only || u.email.toLowerCase() === only))
  .map((u) => [liveUsers.find((l) => l.email?.toLowerCase() === u.email.toLowerCase()), u])
  .filter(([l]) => l)
if (!pairs.length) {
  console.log(only ? `No account with that email in both the lab and live. Sign up in the lab with it first.` : 'No lab account shares an email with a live one. Sign up in the lab first.')
  process.exit(1)
}
for (const [l, b] of pairs) await copyAccount(l.id, b.id, b.email)
