// Lab → live. The one way anything reaches companheiro.app once the lab exists.
//
//   node scripts/promote.mjs         what would go live, and whether it may
//   node scripts/promote.mjs --go    send it
//
// It moves `main` on GitHub up to where `lab` is (Vercel then deploys it) and
// touches nothing in this folder, so it is safe while other work is open.
// It refuses when:
//   - the lab's latest deployment is not up and green
//   - the lab database has a table, column or function live lacks
//     (a migration still to be applied to live)
//   - `main` has commits `lab` does not (bring them into lab first)
import { execFileSync } from 'child_process'
import { compareSchemas } from './compare-schemas.mjs'

// The lab's deployment as GitHub lists it (the old studio project reports separately).
const LAB_DEPLOYMENT = 'Preview – companheiro-v2'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const stop = (message) => { console.error(`\nNot promoted. ${message}`); process.exit(1) }
const go = process.argv.includes('--go')

git('fetch', 'origin', '--quiet')
let lab, main
try {
  lab = git('rev-parse', 'origin/lab')
  main = git('rev-parse', 'origin/main')
} catch {
  stop('There is no lab branch on GitHub yet.')
}

const waiting = git('log', '--oneline', `${main}..${lab}`)
if (!waiting) { console.log('Nothing to promote: live already has everything the lab has.'); process.exit(0) }
console.log(`Waiting in the lab:\n${waiting.split('\n').map((l) => `  ${l}`).join('\n')}`)

if (git('log', '--oneline', `${lab}..${main}`)) {
  stop('main has commits the lab does not. Merge main into lab, let it deploy, and try again.')
}

const repo = git('remote', 'get-url', 'origin').replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '')
const gh = (path) => JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
let state
try {
  // Asked per deployment, not per commit: a commit that is on both branches
  // carries the live deployment's result too, and that one proves nothing here.
  const deployment = gh(`repos/${repo}/deployments?sha=${lab}&per_page=30`).find((d) => d.environment === LAB_DEPLOYMENT)
  state = deployment ? gh(`repos/${repo}/deployments/${deployment.id}/statuses`)[0]?.state : undefined
} catch {
  stop('Could not ask GitHub how the lab deployment went.')
}
if (state !== 'success') stop(`The lab deployment of ${lab.slice(0, 7)} is ${state ?? 'not there'}; it has to be up and working first.`)
console.log('\nLab deployment: up.')

try {
  const { onlyLab } = await compareSchemas()
  if (onlyLab.length) stop(`The lab database has what live lacks — apply the migration to live first:\n  ${onlyLab.join('\n  ')}`)
  console.log('Databases: live has everything the lab has.')
} catch (error) {
  stop(error.message)
}

if (!go) { console.log('\nReady. Run again with --go to send it live.'); process.exit(0) }
execFileSync('git', ['push', 'origin', `${lab}:refs/heads/main`], { stdio: 'inherit' })
console.log(`\nPromoted ${lab.slice(0, 7)}. Vercel is deploying it to companheiro.app.`)
