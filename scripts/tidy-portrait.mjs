// One-off tidy of stored portrait entries. Two independent jobs:
//   reword  rewrites statements that use she/he or name other people, so they
//           say "they" and refer to others by role. Wording only, never meaning.
//   merge   finds entries in the same section that state the same pattern and
//           folds them into the strongest one (the others go dormant, not deleted).
//
//   node scripts/tidy-portrait.mjs reword            (preview)
//   node scripts/tidy-portrait.mjs reword --write
//   node scripts/tidy-portrait.mjs merge             (preview)
//   node scripts/tidy-portrait.mjs merge --write
//
// --write first saves every entry as it was to .research/portrait-backup-<time>.json.
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { recordScriptCall } from './record-usage.mjs'

const job = process.argv[2]
const write = process.argv.includes('--write')
if (!['reword', 'merge'].includes(job)) { console.error('Say which job: reword or merge'); process.exit(1) }

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')])
)
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
const model = readFileSync('src/lib/models.ts', 'utf8').match(/deep:\s*['"]([^'"]+)['"]/)?.[1]
const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }
const rest = async (path, init) => {
  const res = await fetch(`${url}/rest/v1/${path}`, { ...init, headers })
  if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 200)}`)
  return init ? null : res.json()
}
const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
// The model sometimes thinks aloud around its answer, or answers twice. Take
// the last complete answer object, and ask again if there is none.
const ask = async (system, content, max_tokens) => {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await client.messages.create({ model, max_tokens, system, messages: [{ role: 'user', content }] })
    await recordScriptCall(url, key, `tidy-portrait:${job}`, r)
    const text = r.content[0].text
    const starts = [...text.matchAll(/\{\s*"(?:rewrites|groups)"/g)].map((m) => m.index)
    for (const start of starts.reverse()) {
      for (let end = text.lastIndexOf('}'); end > start; end = text.lastIndexOf('}', end - 1)) {
        try { return JSON.parse(text.slice(start, end + 1)) } catch { /* try a shorter span */ }
      }
    }
  }
  throw new Error('No readable answer from the model after three tries')
}

const entries = await rest('portrait_entries?select=id,user_id,kind,statement,status,reinforcement_count,last_reinforced_at&status=eq.active')
if (write) {
  mkdirSync('.research', { recursive: true })
  const file = `.research/portrait-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  writeFileSync(file, JSON.stringify(entries, null, 2))
  console.log(`Backup of ${entries.length} entries -> ${file}\n`)
}
const people = new Map()
const label = (id) => people.get(id) ?? (people.set(id, `person-${people.size + 1}`), people.get(id))

if (job === 'reword') {
  const SYSTEM = `Each item is a one-sentence observation about a person, stored in their profile. Rewrite an item ONLY if it breaks one of these rules:
1. The person is referred to as "they"/"them"/"their", never she/he/her/his/him.
2. Other people are referred to by their role in the person's life ("a partner", "a parent", "a manager", "a friend", "a sibling"), never by name. Use a specific role only when the item itself states the relationship; otherwise write "someone close to them" (or "someone at work" when the item is plainly about work). Never guess a relationship. Names of places, books, organisations and products may stay.
Change wording only. Keep the meaning, the detail, any quoted phrases and the length. If an item breaks neither rule, leave it out of the answer.
Answer with the JSON object and nothing else: { "rewrites": [{ "id": "<id>", "statement": "<rewritten>" }] }`
  // The preview saves its proposals; --write applies exactly that file, so
  // what gets written is what was read (and can be corrected by hand first).
  const PLAN = '.research/portrait-reword.json'
  let plan
  if (write) {
    plan = JSON.parse(readFileSync(PLAN, 'utf8'))
  } else {
    plan = []
    for (const user of new Set(entries.map((e) => e.user_id))) {
      const mine = entries.filter((e) => e.user_id === user)
      const { rewrites = [] } = await ask(SYSTEM, mine.map((e) => `[${e.id}] ${e.statement}`).join('\n'), 4000)
      for (const r of rewrites) {
        const e = mine.find((x) => x.id === r.id)
        if (!e || !r.statement?.trim() || r.statement.trim() === e.statement) continue
        plan.push({ id: e.id, was: e.statement, now: r.statement.trim() })
      }
    }
    mkdirSync('.research', { recursive: true })
    writeFileSync(PLAN, JSON.stringify(plan, null, 2))
  }
  for (const r of plan) {
    const e = entries.find((x) => x.id === r.id)
    if (!e || e.statement !== r.was) continue
    console.log(`${label(e.user_id)}\n  was: ${r.was}\n  now: ${r.now}\n`)
    if (write) await rest(`portrait_entries?id=eq.${e.id}`, { method: 'PATCH', body: JSON.stringify({ statement: r.now }) })
  }
  console.log(`${plan.length} of ${entries.length} statements ${write ? 'reworded' : `would be reworded (preview saved to ${PLAN}, nothing written)`}`)
}

if (job === 'merge') {
  const SYSTEM = `Each item is a one-sentence observation about the same person, all from one section of their profile. Find groups of items that state the SAME pattern in different words, so that keeping both tells the person nothing extra. Related-but-distinct observations are not duplicates; when unsure, do not group. Most items belong to no group.
Answer with the JSON object and nothing else: { "groups": [["<id>", "<id>", ...], ...] }`
  // As with reword: the preview saves its proposal and --write applies exactly
  // that file, so what is folded is what was shown.
  const PLAN = '.research/portrait-merge.json'
  let plan
  if (write) {
    plan = JSON.parse(readFileSync(PLAN, 'utf8'))
  } else {
    plan = []
    const groupsOf = new Map()
    for (const e of entries) { const k = `${e.user_id}|${e.kind}`; groupsOf.set(k, [...(groupsOf.get(k) ?? []), e]) }
    for (const list of groupsOf.values()) {
      if (list.length < 2) continue
      const { groups = [] } = await ask(SYSTEM, list.map((e) => `[${e.id}] ${e.statement}`).join('\n'), 1500)
      for (const ids of groups) {
        const set = [...new Set(ids)].map((id) => list.find((e) => e.id === id)).filter(Boolean)
        if (set.length < 2) continue
        set.sort((a, b) => b.reinforcement_count - a.reinforcement_count || b.last_reinforced_at.localeCompare(a.last_reinforced_at))
        plan.push({ keep: set[0].id, fold: set.slice(1).map((e) => e.id) })
      }
    }
    mkdirSync('.research', { recursive: true })
    writeFileSync(PLAN, JSON.stringify(plan, null, 2))
  }
  let folded = 0
  for (const g of plan) {
    const keep = entries.find((e) => e.id === g.keep)
    const rest_ = g.fold.map((id) => entries.find((e) => e.id === id)).filter(Boolean)
    if (!keep || rest_.length === 0) continue
    const set = [keep, ...rest_]
    folded += rest_.length
    console.log(`${label(keep.user_id)} · ${keep.kind}\n  keep: ${keep.statement}`)
    for (const r of rest_) console.log(`  fold: ${r.statement}`)
    console.log()
    if (write) {
      await rest(`portrait_entries?id=eq.${keep.id}`, { method: 'PATCH', body: JSON.stringify({
        reinforcement_count: set.reduce((n, e) => n + e.reinforcement_count, 0),
        last_reinforced_at: set.map((e) => e.last_reinforced_at).sort().pop(),
      }) })
      for (const r of rest_) {
        await rest(`portrait_entries?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'dormant' }) })
        await rest(`portrait_evidence?entry_id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify({ entry_id: keep.id }) }).catch(() => {})
      }
    }
  }
  console.log(`${folded} of ${entries.length} entries ${write ? 'folded into a stronger one' : 'would be folded (preview, nothing written)'}`)
}
