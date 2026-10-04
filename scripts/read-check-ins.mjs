// Research reader for real check-ins. Read-only: it selects, never writes.
// Uses the service key in .env.local, so it sees every account's check-ins;
// people are labelled person-1, person-2… and no email or user id is written.
//
//   node scripts/read-check-ins.mjs [--days 30] [--limit 200] [--out .research/check-ins.md]
//
// The output holds people's private reflections. It goes to .research/ (git
// ignored) unless --out says otherwise. Never commit it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const days = Number(arg('days', '30'))
const limit = Number(arg('limit', '200'))
const out = arg('out', '.research/check-ins.md')

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])
)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be in .env.local')
  process.exit(1)
}

const since = new Date(Date.now() - days * 86_400_000).toISOString()

// Plain REST rather than supabase-js: its client needs a WebSocket package on
// Node 20, and one GET is all this does.
const query = new URLSearchParams({
  select: 'user_id,created_at,raw_entry,full_conversation,energy,inner_weather,creative_readiness,arc_texture,check_in_type',
  created_at: `gte.${since}`,
  order: 'created_at.asc',
  limit: String(limit),
})
const res = await fetch(`${url}/rest/v1/check_ins?${query}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
if (!res.ok) {
  console.error('Read failed:', res.status, (await res.text()).slice(0, 300))
  process.exit(1)
}
const data = await res.json()

const people = new Map()
const label = (id) => {
  if (!people.has(id)) people.set(id, `person-${people.size + 1}`)
  return people.get(id)
}

const blocks = data.map((c) => {
  const turns = (c.full_conversation ?? '').split(/\n\n(?=(?:You|Companheiro): )/).filter(Boolean)
  const userTurns = turns.filter((t) => t.startsWith('You: ')).length
  return [
    `## ${label(c.user_id)} · ${c.created_at.slice(0, 16).replace('T', ' ')} UTC`,
    `energy: ${c.energy} · weather: ${c.inner_weather} · movement: ${c.arc_texture ?? '-'} · type: ${c.check_in_type ?? '-'} · lab-ready: ${c.creative_readiness} · their turns: ${userTurns || 1}`,
    '',
    c.full_conversation?.trim() || `You: ${c.raw_entry}`,
  ].join('\n')
})

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, `# Check-ins, last ${days} days (${data.length} from ${people.size} people)\n\n${blocks.join('\n\n---\n\n')}\n`)
console.log(`${data.length} check-ins from ${people.size} people -> ${out}`)
