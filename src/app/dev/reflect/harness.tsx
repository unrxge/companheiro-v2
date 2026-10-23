'use client'

import ReflectPage from '@/app/reflect/page'

function installMock() {
  const w = window as unknown as { __reflectMock?: boolean; __logged?: unknown[] }
  if (w.__reflectMock) return
  w.__reflectMock = true
  w.__logged = []
  const real = window.fetch.bind(window)
  const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const done = new URLSearchParams(location.search).get('done') === '1'
    if (url.includes('/api/read/node')) {
      return json({ success: true, piece: {
        id: 'node-1', project_id: 'demo', title: 'The kettle', core_truth: 'Being needed is not the same as being alive.',
        reflection: done ? { id: 'r1', created_at: '2026-10-20T10:00:00Z' } : null,
      } })
    }
    if (url.includes('/api/post-publication/log') && init?.method === 'POST') {
      w.__logged!.push(JSON.parse(String(init.body)))
      return json({ success: true })
    }
    if (url.includes('/api/')) return json({})
    return real(input, init)
  }
}

export function ReflectHarness() {
  if (typeof window !== 'undefined') installMock()
  return <ReflectPage />
}
