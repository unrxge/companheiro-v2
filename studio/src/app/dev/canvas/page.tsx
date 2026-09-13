'use client'

// studio/src/app/dev/canvas/page.tsx — a harness for the canvas engine,
// development only (it renders nothing in a production build).
//
// It mounts the real CanvasPage over a synthetic bundle and answers the app's
// own API calls with canned JSON, so pan, zoom, drag, snapping, framing, undo
// and autosave can be exercised in a browser without a session or a database.
// Every request it intercepts is recorded on `window.__devRequests` so a test
// can assert that autosave actually sent what the person did.
//
// `?phone=1` mounts the read-only phone surface instead of the builder, and
// `?readonly=1` mounts the builder the way a resting or completed project opens.

import { useEffect, useState } from 'react'
import { CanvasPage, CanvasProvider } from '@/components/canvas/canvas-page'
import { PhoneStage } from '@/components/phone/phone-stage'
import { devBundle } from '@/lib/studio/dev-bundle'
import type { ProjectBundle } from '@/lib/studio/types'

interface DevWindow extends Window {
  __devRequests?: Array<{ method: string; url: string; body: unknown }>
  __devBundle?: ProjectBundle
}

/** Answer /api/studio/* locally; everything else goes to the real fetch. */
function installFetchStub(bundle: ProjectBundle) {
  const w = window as DevWindow
  if (w.__devRequests) return
  w.__devRequests = []
  w.__devBundle = bundle
  const real = window.fetch.bind(window)

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const method = (init?.method ?? 'GET').toUpperCase()
    if (!url.includes('/api/studio/')) return real(input, init)

    let body: unknown = null
    try { body = init?.body ? JSON.parse(String(init.body)) : null } catch { body = String(init?.body ?? '') }
    w.__devRequests?.push({ method, url, body })

    const json = (payload: unknown) =>
      new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })

    // the arrival and strike routes answer with a row, so they must be matched
    // before the batch route (their paths also contain '/blocks')
    const arrival = /\/blocks\/([^/]+)\/(arrival|strike)/.exec(url)
    if (arrival) {
      const row = bundle.blocks.find((b) => b.id === arrival[1])
      const action = (body as { action?: string } | null)?.action
      const patched = {
        ...row,
        arrival_state: action === 'place' ? 'placed' : row?.arrival_state,
        deleted_at: action === 'dismiss' ? new Date().toISOString() : null,
        struck_at: arrival[2] === 'strike' && method === 'POST' ? new Date().toISOString() : null,
        struck_by: arrival[2] === 'strike' && method === 'POST'
          ? (body as { sentence?: string } | null)?.sentence ?? null
          : null,
        updated_at: new Date().toISOString(),
      }
      return json({ block: patched, compass_entry: null })
    }
    if (url.includes('/blocks')) return json({ canvas_version: 2, applied: 1 })
    if (url.includes('/since')) return json({ since: bundle.since })
    if (url.includes('/open')) return json({ since: bundle.since })
    if (url.includes('/links')) return json({ link: body })
    if (method === 'PATCH') return json({ project: bundle.project })
    return json({ ok: true })
  }
}

export default function DevCanvasPage() {
  const [bundle, setBundle] = useState<ProjectBundle | null>(null)
  const [mode, setMode] = useState<'builder' | 'phone' | 'readonly'>('builder')

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return
    const b = devBundle()
    installFetchStub(b)
    setBundle(b)
    const q = new URLSearchParams(window.location.search)
    setMode(q.has('phone') ? 'phone' : q.has('readonly') ? 'readonly' : 'builder')
  }, [])

  if (process.env.NODE_ENV === 'production') return null
  if (!bundle) return null
  if (mode === 'phone') {
    return (
      <CanvasProvider bundle={bundle} interactive={false}>
        <PhoneStage />
      </CanvasProvider>
    )
  }
  return <CanvasPage bundle={bundle} interactive={mode === 'builder'} />
}
