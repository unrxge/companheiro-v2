// One-off: connects past check-ins to the portrait patterns they show.
// New check-ins are linked as they finish (lib/portrait.ts); this covers the
// ones from before migration 033. It only MATCHES existing active patterns to
// check-ins. It never creates, changes or reinforces a portrait entry.
//
//   node scripts/backfill-portrait-evidence.mjs            (dry run: prints matches, writes nothing)
//   node scripts/backfill-portrait-evidence.mjs --write    (needs migration 033 applied)
//   optional: --days 120
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'node:fs'

const write = process.argv.includes('--write')
const di = process.argv.indexOf('--days')
const days = di !== -1 ? Number(process.argv[di + 1]) : 150

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])
)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const model = readFileSync('src/lib/models.ts', 'utf8').match(/deep:\s*['"]([^'"]+)['"]/)?.[1]
if (!url || !key || !env.ANTHROPIC_API_KEY || !model) { console.error('Missing env or model'); process.exit(1) }

const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const rest = async (path, init) => {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } })
  if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return res.status === 204 || res.headers.get('content-length') === '0' ? null : res.json().catch(() => null)
}

const since = new Date(Date.now() - days * 86_400_000).toISOString()
const entries = await rest(`portrait_entries?select=id,user_id,kind,statement&status=eq.active&last_reinforced_at=gte.${since}`)
const checkIns = await rest(`check_ins?select=id,user_id,created_at,raw_entry,full_conversation&created_at=gte.${since}&order=created_at.asc`)

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
const SYSTEM = `You are given a person's established patterns (each with an id) and ONE past check-in conversation of theirs. Decide which of the patterns this particular check-in genuinely shows: the pattern is plainly visible in what the person said or did in this conversation, not merely on a related topic. Be strict. Most check-ins show none or one. Use only the ids given.
Return JSON only: { "ids": ["<id>", ...] }`

const people = new Map()
const label = (id) => people.get(id) ?? (people.set(id, `person-${people.size + 1}`), people.get(id))
let links = 0
for (const c of checkIns) {
  const mine = entries.filter((e) => e.user_id === c.user_id)
  if (mine.length === 0) continue
  const material = (c.full_conversation?.trim() || c.raw_entry).slice(0, 6000)
  const r = await client.messages.create({
    model, max_tokens: 200, system: SYSTEM,
    messages: [{ role: 'user', content: `PATTERNS:\n${mine.map((e) => `[${e.id}] (${e.kind}) ${e.statement}`).join('\n')}\n\nCHECK-IN:\n${material}` }],
  })
  let ids = []
  try { ids = JSON.parse(r.content[0].text.replace(/```json\n?|\n?```/g, '').trim()).ids ?? [] } catch { /* unreadable answer: link nothing */ }
  ids = [...new Set(ids)].filter((id) => mine.some((e) => e.id === id))
  console.log(`${label(c.user_id)} ${c.created_at.slice(0, 10)}  ${ids.length} pattern${ids.length === 1 ? '' : 's'}`)
  for (const id of ids) console.log(`    - ${mine.find((e) => e.id === id).statement.slice(0, 110)}`)
  links += ids.length
  if (write && ids.length) {
    await rest('portrait_evidence?on_conflict=entry_id,check_in_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(ids.map((entry_id) => ({ user_id: c.user_id, entry_id, check_in_id: c.id }))),
    })
  }
}
const unseen = entries.filter((e) => checkIns.some((c) => c.user_id === e.user_id)).length
console.log(`\n${checkIns.length} check-ins, ${entries.length} active patterns, ${links} links ${write ? 'written' : 'found (dry run, nothing written)'}`)
