'use client'

import ReimaginePage from '@/app/write/reimagine/page'

const META = '\u001e'

const PARTS = [
  {
    id: 'part-1', title: 'Arrival', beat: 'calm', is_locked: false,
    body: '<p>The kettle clicks off before I am ready for the day.</p><p>I stand there longer than I need to, watching the steam thin out against the window.</p><p></p><p>Nobody needs anything from me yet.</p>',
  },
  {
    id: 'part-2', title: 'The pull', beat: 'restless', is_locked: false,
    body: '<p>By nine the phone has opinions.</p><p>I answer them all, because being useful feels like proof.</p><p>It is only later that I notice I have not sat down.</p>',
  },
  {
    id: 'part-3', title: 'Settling', beat: 'tender', is_locked: true,
    body: '<p>The chair by the window was always mine. I just forgot to use it.</p>',
  },
]

function streamOf(chunks: string[], delay = 40): Response {
  const enc = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    async start(c) {
      for (const ch of chunks) { c.enqueue(enc.encode(ch)); await new Promise((r) => setTimeout(r, delay)) }
      c.close()
    },
  }), { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}

function words(s: string): string[] {
  return s.match(/\S+\s*/g) ?? [s]
}

function installMock() {
  const w = window as unknown as { __rmMock?: boolean; __rmPatches?: Array<{ id: string; body: string }>; __rmRuns?: unknown[] }
  if (w.__rmMock) return
  w.__rmMock = true
  w.__rmPatches = []
  w.__rmRuns = []
  const real = window.fetch.bind(window)
  let takeNo = 0

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const method = (init?.method || 'GET').toUpperCase()

    if (url.includes('/api/write/reimagine/converse')) {
      const body = JSON.parse(String(init?.body || '{}'))
      const n = (body.messages || []).length
      const reply = n === 0
        ? 'If this morning were not written down at all, what would it be instead?'
        : 'A voicemail you never sent, spoken to the kettle. That is enough to run with.'
      const meta = n === 0 ? {} : { lens: 'An unsent voicemail, spoken quietly to the kettle, half-apologetic.', energy: 'hushed' }
      return streamOf([...words(reply), META + JSON.stringify({ ...meta, truncated: false })])
    }

    if (url.includes('/api/write/reimagine') && method === 'GET') {
      return new Response(JSON.stringify({ title: 'Untitled', project_id: 'demo', parts: PARTS }), { headers: { 'Content-Type': 'application/json' } })
    }

    if (url.includes('/api/write/reimagine') && method === 'POST') {
      const body = JSON.parse(String(init?.body || '{}'))
      w.__rmRuns!.push(body)
      takeNo++
      const chunks: string[] = []
      for (const t of body.targets as Array<{ key: string; text: string; note?: string; avoid?: string[] }>) {
        const text = `(take ${takeNo}${t.note ? `, steered: ${t.note}` : ''}) Hey, it's me. ${t.text.split(/\s+/).slice(0, 8).join(' ')}… anyway.\n\nI'll call back.`
        chunks.push(`<take key="${t.key}">`, ...words(text), '</take>\n')
      }
      return streamOf([...chunks, META + JSON.stringify({ truncated: false })], 15)
    }

    if (url.includes('/api/studio/nodes/') && method === 'PATCH') {
      const id = url.split('/api/studio/nodes/')[1].split('?')[0]
      const body = JSON.parse(String(init?.body || '{}'))
      w.__rmPatches!.push({ id, body: body.body })
      return new Response(JSON.stringify({ node: {} }), { headers: { 'Content-Type': 'application/json' } })
    }

    if (url.includes('/api/')) return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
    return real(input, init)
  }
}

export function ReimagineHarness() {
  if (typeof window !== 'undefined') installMock()
  return <ReimaginePage />
}
