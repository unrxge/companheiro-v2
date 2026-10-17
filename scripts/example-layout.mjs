// Reads the arrangement the owner left on the example projects' canvases, so
// it can be written into each example as the one every new account starts
// from (see src/lib/examples/build.ts, `board`). Only reads.
//
//   node scripts/example-layout.mjs          live (and the lab, when .env.lab is here)
//
// Dragging on an example keeps the arrangement in that browser; for the owner
// it is also kept in their account's metadata (`example_layout`) by
// /api/examples/layout. This prints that, per example, as board coordinates.
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const readEnv = (name) => {
  const path = join(ROOT, name)
  if (!existsSync(path)) return null
  return Object.fromEntries(readFileSync(path, 'utf8').split('\n').filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
}

async function layoutsIn(label, env) {
  if (!env?.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  const { users = [] } = await res.json()
  for (const u of users) {
    const kept = u.user_metadata?.example_layout
    if (!kept || !Object.keys(kept).length) continue
    console.log(`\n${label} · ${u.email ?? u.id}`)
    console.log(JSON.stringify(kept, null, 2))
  }
}

await layoutsIn('live', readEnv('.env.live') ?? readEnv('.env.local'))
await layoutsIn('lab', readEnv('.env.lab'))
