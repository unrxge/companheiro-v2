// One-off: rewrite prose emotional journeys as "Short label — sentence" lines,
// one beat per line, so the journey curve shows short summaries (see
// src/components/widgets/journey-curve.tsx). Journeys already in that shape are
// left alone.
//
//   node scripts/convert-journeys.mjs                # dry run: counts only, writes nothing
//   node scripts/convert-journeys.mjs --preview 3    # dry run + convert 3 rows in memory and print them
//   node scripts/convert-journeys.mjs --apply        # back up the originals, then write
//   add --user <uuid> to limit any of the above to one account
//
// Reads .env.local for SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, ANTHROPIC_API_KEY.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
)
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const previewN = args.includes('--preview') ? Number(args[args.indexOf('--preview') + 1] || 3) : 0
const userFilter = args.includes('--user') ? args[args.indexOf('--user') + 1] : null
const backupDir = process.env.BACKUP_DIR || new URL('../.journey-backup/', import.meta.url).pathname

// Plain PostgREST calls: supabase-js wants a WebSocket for realtime, which Node 20 lacks.
const rest = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/studio_nodes`
const headers = { apikey: env.SERVICE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }
async function fetchNodes(query) {
  const res = await fetch(`${rest}?${query}`, { headers })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}
const ai = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

/** Mirrors the widget's parse: two or more lines, each either a short label (six words or fewer) or a short label then " — " / ": " and a sentence. */
function isStructured(text) {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) return false
  return lines.every((l) => {
    if (l.split(/\s+/).length <= 6) return true
    const m = l.match(/^([^—–:]{1,80}?)(?:\s+[—–]\s+|:\s+)\S/)
    return !!m && m[1].trim().split(/\s+/).length <= 6
  })
}

const PROSE_SYSTEM = `You rewrite a description of an emotional journey into an ordered list of beats, one per line, each in exactly this shape:
Short label — one sentence on what the audience feels or goes through here

Rules:
- The label is a summary of one to six words ("Recognition in the body", "The cost of the chase"). Sentence case, no trailing punctuation.
- Use as many beats as the journey really has, usually three to seven. Do not pad and do not merge distinct moments.
- The sentence must be built from the original's own words and images. Do not add feelings, images, claims or interpretation the original does not contain. If a beat has little detail, keep its sentence short.
- Where the original says "the reader", say "the audience".
- Output only the lines. No numbering, bullets, headings or commentary.`

const LABEL_SYSTEM = `You are given the beats of an emotional journey, one per line. For each beat write a short label: a summary of one to six words, sentence case, no trailing punctuation.
Return ONLY a JSON array of strings, one label per beat, in the same order and the same length as the input.`

function words(l) { return l.trim().split(/\s+/).length }

async function ask(system, content, max_tokens = 900) {
  const res = await ai.messages.create({ model: 'claude-haiku-4-5', max_tokens, system, messages: [{ role: 'user', content }] })
  return res.content.find((b) => b.type === 'text')?.text.trim() ?? ''
}

async function convert(text) {
  const lines = text.split('\n').map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
  let out
  if (lines.length >= 2) {
    // Already one beat per line: keep the person's own words as the sentence, only add a label to the long ones.
    const long = lines.filter((l) => words(l) > 6)
    let labels = []
    if (long.length) {
      const raw = (await ask(LABEL_SYSTEM, long.join('\n'), 500)).replace(/```json\n?|\n?```/g, '')
      labels = JSON.parse(raw)
      if (!Array.isArray(labels) || labels.length !== long.length) return null
    }
    let k = 0
    out = lines.map((l) => (words(l) > 6 ? `${String(labels[k++]).replace(/[\s.,;:—–-]+$/, '')} — ${l}` : l)).join('\n')
  } else {
    out = (await ask(PROSE_SYSTEM, text)).split('\n').map((l) => l.trim()).filter(Boolean).join('\n')
  }
  const outLines = out.split('\n')
  return outLines.length <= 9 && (outLines.length === 1 ? words(out) <= 6 : isStructured(out)) ? out : null
}

let nodes
try { nodes = (await fetchNodes('select=id,user_id,emotional_journey&emotional_journey=not.is.null')).filter((n) => n.emotional_journey.trim()) } catch (e) { console.error('read failed:', e.message); process.exit(1) }

const todo = nodes.filter((n) => (!userFilter || n.user_id === userFilter) && n.emotional_journey.trim().length > 12 && !isStructured(n.emotional_journey))
const owners = new Set(nodes.map((n) => n.user_id))
const todoOwners = new Set(todo.map((n) => n.user_id))
console.log(`studio_nodes with a journey: ${nodes.length} (${owners.size} accounts)`)
console.log(`already in the new shape:    ${nodes.filter((n) => isStructured(n.emotional_journey)).length}`)
console.log(`to convert${userFilter ? ' (this account only)' : ''}:${userFilter ? '' : '           '} ${todo.length} (${todoOwners.size} accounts)`)
if (!apply && !previewN) process.exit(0)

const batch = apply ? todo : todo.slice(0, previewN)
const results = []
for (const n of batch) {
  let converted = null
  try { converted = await convert(n.emotional_journey) } catch (e) { console.error(`  ${n.id}: AI error ${e.message}`) }
  if (!converted) converted = await convert(n.emotional_journey).catch(() => null) // one retry on a malformed shape
  results.push({ id: n.id, user_id: n.user_id, before: n.emotional_journey, after: converted })
}

if (!apply) {
  for (const r of results) console.log(`\n--- ${r.id}\nBEFORE:\n${r.before}\n\nAFTER:\n${r.after ?? '(conversion failed the shape check; would be skipped)'}`)
  process.exit(0)
}

mkdirSync(backupDir, { recursive: true })
const backupFile = `${backupDir}/journeys-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
writeFileSync(backupFile, JSON.stringify(results.map(({ id, user_id, before }) => ({ id, user_id, emotional_journey: before })), null, 2))
console.log(`backed up ${results.length} originals to ${backupFile}`)

let done = 0, skipped = 0
for (const r of results) {
  if (!r.after) { skipped++; continue }
  // Only write if the row is still exactly what we read (someone may have edited it since).
  const [current] = await fetchNodes(`select=emotional_journey&id=eq.${r.id}`)
  if (!current || current.emotional_journey !== r.before) { console.error(`  ${r.id}: changed since it was read, skipped`); skipped++; continue }
  const res = await fetch(`${rest}?id=eq.${r.id}`, { method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ emotional_journey: r.after }) })
  if (!res.ok) { console.error(`  ${r.id}: update failed ${res.status}`); skipped++ } else done++
}
console.log(`converted ${done}, skipped ${skipped}`)
