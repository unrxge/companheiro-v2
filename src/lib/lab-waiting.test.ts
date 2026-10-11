import { test } from 'node:test'
import assert from 'node:assert/strict'
import { showsInLabList } from './lab-waiting'

const commit = (files: string[], message = 'Home greets by name', parents = 1) => ({ sha: 'abc1234', files, message, parents })

test('a change to a page or a route is shown', () => {
  assert.equal(showsInLabList(commit(['src/components/home/greeting.tsx'])), true)
  assert.equal(showsInLabList(commit(['src/app/api/onboarding/route.ts', 'supabase/migrations/034_profiles.sql'])), true)
  assert.equal(showsInLabList(commit(['public/manifest.json'])), true)
})

test('tooling alone is not', () => {
  assert.equal(showsInLabList(commit(['scripts/copy-to-lab.mjs', 'CLAUDE.md'])), false)
  assert.equal(showsInLabList(commit(['supabase/migrations/034_profiles.sql'])), false)
  assert.equal(showsInLabList(commit(['docs/lab-setup.md', 'package.json', 'next.config.ts'])), false)
})

test('tests, preview harnesses and the lab\'s own machinery are not', () => {
  assert.equal(showsInLabList(commit(['src/lib/use-phone.test.ts'])), false)
  assert.equal(showsInLabList(commit(['src/app/dev/work-page/harness.tsx'])), false)
  assert.equal(showsInLabList(commit(['src/components/shell/lab-mark.tsx', 'src/app/api/lab/waiting/route.ts', 'src/lib/deploy-env.ts'])), false)
})

test('a commit can leave itself out, and a merge is never shown', () => {
  assert.equal(showsInLabList(commit(['src/app/api/read-aloud/route.ts'], 'Read aloud: record why the voice failed\n\nLab-list: skip\n\nCo-Authored-By: x')), false)
  assert.equal(showsInLabList(commit(['src/app/api/read-aloud/route.ts'], 'Mentions Lab-list: skip in passing, mid-sentence, does not count')), true)
  assert.equal(showsInLabList(commit(['src/app/home/page.tsx'], 'Merge main into lab', 2)), false)
})
