import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'

// What this guards: from 30 October 2026 Supabase no longer gives the API roles
// access to new tables, so a migration that creates one without a grant ships a
// table every query answers "permission denied" on. Migrations up to 035 predate
// the rule (the lab replay grants for them, see scripts/lab-schema.mjs).
const DIR = join(process.cwd(), 'supabase/migrations')
const LAST_BEFORE_RULE = 35

test('every migration after 035 that creates a table also grants access to it', () => {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql') && Number(f.slice(0, 3)) > LAST_BEFORE_RULE)
  for (const f of files) {
    const sql = readFileSync(join(DIR, f), 'utf8')
    const tables = [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?(\w+)/gi)].map((m) => m[1])
    for (const t of tables) {
      assert.match(
        sql,
        new RegExp(`grant\\s+[^;]*on\\s+(?:table\\s+)?(?:public\\.)?${t}\\b[^;]*to\\s+[^;]*service_role`, 'i'),
        `${f}: table ${t} has no grant to authenticated, service_role`,
      )
    }
  }
})
