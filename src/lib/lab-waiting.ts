// Which commits count as "something to try in the lab" for the lab banner's
// list: ones that change the app itself, as a person using it would meet it.
// Pure, so the rule can be tested (lab-waiting.test.ts).

/** Files that are part of the app people use. */
const APP = [/^src\//, /^public\//]

/** …except these, which nobody using the app ever meets. */
const NOT_APP = [
  /\.test\.tsx?$/, // tests
  /^src\/app\/dev\//, // preview harnesses
  /^src\/app\/api\/lab\//, // the lab's own plumbing
  /^src\/components\/shell\/lab-/,
  /^src\/lib\/(deploy-env|lab-waiting)\.ts$/,
]

/**
 * Commits pushed before `Lab-list: skip` existed that would have carried it.
 * Add nothing here; new commits say so themselves.
 */
const SKIPPED_BEFORE_THE_MARKER = ['85adf0a'] // Read aloud: record why the voice failed (logging only)

export interface CommitFacts {
  /** The commit's id, any length. */
  sha: string
  /** The whole commit message. */
  message: string
  /** Every file the commit touches. */
  files: string[]
  /** More than one for a merge. */
  parents: number
}

/**
 * True when the commit belongs in the list. Left out: merges, commits that
 * touch only tooling (scripts, migrations, docs, tests, the lab's own
 * machinery), and any commit that says so itself with a line reading
 * `Lab-list: skip` (for a change inside the app that there is nothing to try,
 * such as extra logging).
 */
export function showsInLabList({ sha, message, files, parents }: CommitFacts): boolean {
  if (parents > 1) return false
  if (SKIPPED_BEFORE_THE_MARKER.some((id) => sha.startsWith(id))) return false
  if (/^lab-list:\s*skip\s*$/im.test(message)) return false
  return files.some((f) => APP.some((r) => r.test(f)) && !NOT_APP.some((r) => r.test(f)))
}
