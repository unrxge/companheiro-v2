// /api/examples/… — the example projects, served read-only from code.
//
// Nothing links here directly: next.config.ts rewrites every request the real
// pages make about an example (an id starting `example-`) to this route, so
// the canvas, the writing page and the vision room open an example exactly as
// they open a project of one's own. No session is needed and nothing is read
// from or written to the database (lib/examples/serve.ts).

import { NextResponse, type NextRequest } from 'next/server'
import { answerExample } from '@/lib/examples/serve'

type Params = { params: Promise<{ path: string[] }> }

async function answer(req: NextRequest, { params }: Params) {
  const { path } = await params
  const { status, body } = answerExample(req.method, path ?? [], req.nextUrl.searchParams)
  return NextResponse.json(body, { status })
}

export { answer as GET, answer as POST, answer as PUT, answer as PATCH, answer as DELETE }
