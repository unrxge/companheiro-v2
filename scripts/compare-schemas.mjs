// Do the lab and live databases have the same shape?
//
//   node scripts/compare-schemas.mjs
//
// Reads each project's table, column and function list (never any rows) and
// reports what one has that the other lacks. The case that matters before
// lab → live: something the LAB has that LIVE does not is a migration still
// to be applied to live, and code promoted before it will break there.
// Exits 1 in that case, 0 otherwise. Policies, triggers and indexes are not
// compared; they travel with the migration file.
//
// Credentials: live from .env.live if it exists, otherwise .env.local; lab
// from .env.lab (NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY).
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Same value as LIVE_SUPABASE_REF in src/lib/deploy-env.ts.
const LIVE_REF = 'qtyihplgqaqcbzkvjnld'

function readEnv(name) {
  const path = join(ROOT, name)
  if (!existsSync(path)) return null
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')] }),
  )
}

// Newer Supabase projects name the same column types differently in this
// listing (int32 where an older one says integer), so both are put in one spelling.
const SAME_TYPE = { int16: 'smallint', int32: 'integer', int64: 'bigint' }

async function shapeOf(env, label) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error(`${label}: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing`)
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!res.ok) throw new Error(`${label}: could not read the schema (${res.status})`)
  const spec = await res.json()
  const things = new Set()
  for (const [table, def] of Object.entries(spec.definitions ?? {})) {
    things.add(`table ${table}`)
    for (const [column, p] of Object.entries(def.properties ?? {})) things.add(`column ${table}.${column} (${SAME_TYPE[p.format] ?? p.format ?? p.type})`)
  }
  for (const path of Object.keys(spec.paths ?? {})) if (path.startsWith('/rpc/')) things.add(`function ${path.slice(5)}`)
  return things
}

/** What each side has that the other lacks. Throws with a plain sentence when it cannot tell. */
export async function compareSchemas() {
  const liveEnv = readEnv('.env.live') ?? readEnv('.env.local')
  const labEnv = readEnv('.env.lab')
  if (!liveEnv) throw new Error('No .env.live or .env.local to read the live project from.')
  if (!labEnv) throw new Error('No .env.lab yet. It holds the lab project\'s NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  if (!liveEnv.NEXT_PUBLIC_SUPABASE_URL?.includes(LIVE_REF)) throw new Error('The live credentials do not point at the live project.')
  if (labEnv.NEXT_PUBLIC_SUPABASE_URL?.includes(LIVE_REF)) throw new Error('.env.lab points at the LIVE project. It must hold the lab project\'s values.')

  const [live, lab] = await Promise.all([shapeOf(liveEnv, 'live'), shapeOf(labEnv, 'lab')])
  // A missing table already says its columns are missing.
  const withoutColumnsOf = (only, other) =>
    only.filter((t) => !t.startsWith('column ') || other.has(`table ${t.slice(7).split('.')[0]}`))
  const onlyLab = withoutColumnsOf([...lab].filter((t) => !live.has(t)).sort(), live)
  const onlyLive = withoutColumnsOf([...live].filter((t) => !lab.has(t)).sort(), lab)
  return { onlyLab, onlyLive, count: live.size }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { onlyLab, onlyLive, count } = await compareSchemas()
    if (!onlyLab.length && !onlyLive.length) console.log(`Lab and live have the same shape (${count} tables, columns and functions).`)
    if (onlyLab.length) console.log(`In the lab but NOT on live — apply the migration to live before promoting:\n  ${onlyLab.join('\n  ')}`)
    if (onlyLive.length) console.log(`On live but not in the lab — the lab is behind:\n  ${onlyLive.join('\n  ')}`)
    process.exit(onlyLab.length ? 1 : 0)
  } catch (error) {
    console.error(error.message)
    process.exit(2)
  }
}
