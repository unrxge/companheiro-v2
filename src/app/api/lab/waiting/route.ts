import { NextResponse } from 'next/server'
import { unstable_cache } from 'next/cache'
import { IS_LAB } from '@/lib/deploy-env'
import { showsInLabList } from '@/lib/lab-waiting'

const REPO = 'unrxge/companheiro-v2'

async function github<T>(path: string): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  })
  // Thrown, so a refusal (GitHub's hourly allowance) is never remembered as an answer.
  if (!res.ok) throw new Error(`GitHub ${res.status}`)
  return (await res.json()) as T
}

interface Listed { sha: string; commit: { message: string; author?: { date?: string } }; parents: unknown[] }

/** The commits on `lab` that `main` lacks. Kept a minute. */
const ahead = unstable_cache(
  async () => (await github<{ commits?: Listed[] }>('compare/main...lab?per_page=100')).commits ?? [],
  ['lab-waiting-ahead'],
  { revalidate: 60 },
)

/** The files one commit touches. A commit never changes, so this is asked once. */
const filesOf = unstable_cache(
  async (sha: string) => ((await github<{ files?: { filename: string }[] }>(`commits/${sha}`)).files ?? []).map((f) => f.filename),
  ['lab-waiting-files'],
  { revalidate: false },
)

/**
 * GET /api/lab/waiting — the features and changes that are in the lab to be
 * tried and are not yet in the live app, newest first, for the lab banner.
 *
 * Read from the repository's history (the commits on `lab` that `main`
 * lacks), then narrowed to the ones that change the app itself: tooling,
 * migrations on their own, docs, tests and the lab's own machinery are left
 * out, as is any commit that asks to be (`showsInLabList`). The repository is
 * public, so GitHub is asked without a key. Not there at all on the live app.
 */
export async function GET() {
  if (!IS_LAB) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const commits = await ahead()
    const kept = await Promise.all(
      commits.map(async (c) =>
        showsInLabList({ sha: c.sha, message: c.commit.message, parents: c.parents.length, files: await filesOf(c.sha) }) ? c : null,
      ),
    )
    const waiting = kept
      .filter((c): c is Listed => c !== null)
      .map((c) => ({ id: c.sha.slice(0, 7), title: c.commit.message.split('\n')[0], at: c.commit.author?.date ?? null }))
      .reverse()
    return NextResponse.json({ waiting })
  } catch {
    return NextResponse.json({ error: 'GitHub did not answer.' }, { status: 502 })
  }
}
