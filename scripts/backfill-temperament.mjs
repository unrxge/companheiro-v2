// One-off: reads a temperament (heavy..bright) into one person's check-ins
// from before migration 040, from what they said. Only fills empty ones.
//
//   node scripts/backfill-temperament.mjs you@example.com            (dry run)
//   node scripts/backfill-temperament.mjs you@example.com --write
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'
import { recordScriptCall } from './record-usage.mjs'

const email = process.argv[2]
const write = process.argv.includes('--write')
if (!email || email.startsWith('--')) { console.error('Give the account email first'); process.exit(1) }

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])
)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const model = readFileSync('src/lib/models.ts', 'utf8').match(/fast:\s*['"]([^'"]+)['"]/)?.[1]
if (!url || !key || !env.ANTHROPIC_API_KEY || !model) { console.error('Missing env or model'); process.exit(1) }

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const call = async (path, init) => {
  const res = await fetch(`${url}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } })
  if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.status === 204 ? null : res.json().catch(() => null)
}

let user = null
for (let page = 1; !user && page < 50; page++) {
  const { users } = await call(`/auth/v1/admin/users?page=${page}&per_page=200`)
  if (!users?.length) break
  user = users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null
}
if (!user) { console.error('No account with that email'); process.exit(1) }

try {
  await call('/rest/v1/check_ins?select=temperament&limit=1')
} catch {
  console.error('The temperament column is not there yet: apply migration 040 first.')
  process.exit(1)
}

const rows = await call(`/rest/v1/check_ins?select=id,created_at,raw_entry,full_conversation,energy,inner_weather&user_id=eq.${user.id}&temperament=is.null&order=created_at.asc`)
console.log(`${rows.length} check-ins without a temperament`)

const TEMPERAMENTS = ['heavy', 'muted', 'steady', 'light', 'bright']
const SYSTEM = `You read one past check-in conversation and name its temperament: how it felt for the person to carry, read from them, not from the topic.
- heavy: weighed down, hard to lift, something pressing
- muted: flat, dimmed, quiet, a bit far away
- steady: even, neither weighed nor lifted
- light: easing, some air in it, lifting
- bright: alive, warm, open, glad
It is not energy: someone tired can be light, someone wired can be heavy. Read where the conversation got to, not only how it opened.
Answer with one word from the list and nothing else.`

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
const counts = {}
for (const c of rows) {
  const text = (c.full_conversation || c.raw_entry || '').slice(-6000)
  const r = await client.messages.create({
    model,
    max_tokens: 5,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Energy already read: ${c.energy}. Weather word: "${c.inner_weather}".\n\n${text}` }],
  })
  await recordScriptCall(url, key, 'backfill-temperament', r)
  const word = r.content.find((b) => b.type === 'text')?.text.trim().toLowerCase().replace(/[^a-z]/g, '')
  if (!TEMPERAMENTS.includes(word)) { console.log(`${c.created_at.slice(0, 10)}  (unclear: ${word}) left empty`); continue }
  counts[word] = (counts[word] ?? 0) + 1
  console.log(`${c.created_at.slice(0, 10)}  ${word.padEnd(7)} "${c.inner_weather}"`)
  if (write) await call(`/rest/v1/check_ins?id=eq.${c.id}&temperament=is.null`, { method: 'PATCH', body: JSON.stringify({ temperament: word }), headers: { Prefer: 'return=minimal' } })
}
console.log(write ? 'Written:' : 'Dry run, nothing written:', counts)
