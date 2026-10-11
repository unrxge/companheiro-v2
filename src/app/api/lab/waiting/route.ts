import { NextResponse } from 'next/server'
import { IS_LAB } from '@/lib/deploy-env'

const REPO = 'unrxge/companheiro-v2'

interface GitHubCommit { sha: string; commit: { message: string; author?: { date?: string } } }

/**
 * GET /api/lab/waiting — what the lab has that the live app does not yet:
 * the commits on `lab` that are not on `main`, newest first. For the lab
 * banner's list. The repository is public, so this is asked of GitHub
 * without a key, and kept for a minute so the banner cannot use up GitHub's
 * hourly allowance. Not there at all on the live app.
 */
export async function GET() {
  if (!IS_LAB) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/compare/main...lab?per_page=100`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate: 60 },
    })
    if (!res.ok) return NextResponse.json({ error: 'GitHub did not answer.' }, { status: 502 })
    const body = (await res.json()) as { commits?: GitHubCommit[] }
    const waiting = (body.commits ?? [])
      .map((c) => ({ id: c.sha.slice(0, 7), title: c.commit.message.split('\n')[0], at: c.commit.author?.date ?? null }))
      // Commits made only to get the lab rebuilt change nothing.
      .filter((c) => !c.title.startsWith('lab:'))
      .reverse()
    return NextResponse.json({ waiting })
  } catch {
    return NextResponse.json({ error: 'GitHub did not answer.' }, { status: 502 })
  }
}
