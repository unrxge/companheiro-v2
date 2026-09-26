'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { WorkPage } from '@/components/studio/work/work-page'
import { PageHeader, PageShell, Container, Card } from '@/components/shell/page-shell'
import { SettingsButton } from '@/components/settings/settings-sheet'

const NOW = '2026-09-25T10:00:00.000Z'

function project(intent: string, board: boolean) {
  return {
    id: 'demo', user_id: 'u', title: 'Untitled', intent, rules: [], arc: null, thematic_territory: null,
    status: 'active', shelf_stage: 'active', resting_until: null, completed_at: null, completion_note: null,
    viewport: { x: 0, y: 0, zoom: 1 }, shelf_x: null, shelf_y: null, vision_x: null, vision_y: null,
    settings: { snap: true, grid: false, sizes: true, board }, auto_layout: true, composed_at: null,
    conceptualisation_log: null, canvas_version: 1, last_opened_at: NOW, opened_before_at: NOW,
    created_at: NOW, updated_at: NOW,
  }
}

function node(body: string, concept: boolean) {
  return {
    id: 'node-1', user_id: 'u', project_id: 'demo', parent_id: null, position: 0, title: 'Untitled', intent: body,
    beat: '', stands_whole: true, rules: [], body: body ? `<p>${body}</p>` : '', extent: body ? body.split(/\s+/).length : 0,
    status: 'open', board_x: null, board_y: null, writing_ethos: null, emotional_journey: null, core_truth: concept ? 'A morning that asks nothing of me.' : null,
    substack_goals: null, short_form_goals: null, open_threads: [], short_form_script: null, is_locked: false,
    created_at: NOW, updated_at: NOW,
  }
}

const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } })

// Installed at import so it is in place before any child effect fetches.
function installMock(text: string, concept: boolean, board: boolean, slow: boolean) {
  const w = window as unknown as { __workMock?: boolean }
  if (w.__workMock) return
  w.__workMock = true
  const real = window.fetch.bind(window)
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url
    const path = url.replace(location.origin, '')
    if (path === '/api/studio/projects/demo/tree') return Promise.resolve(json({ project: project(text, board), tree: { nodes: [node(text, concept)], threads: [], tags: [], open_checks: [] } }))
    if (path.startsWith('/api/studio/projects/demo/open')) return Promise.resolve(json({ success: true }))
    if (path.startsWith('/api/studio/assistant-lock')) return Promise.resolve(json({ lockedUntil: null }))
    if (path.startsWith('/api/settings')) return Promise.resolve(json({ settings: { dictation_lang: null, sunday_letter: false, onboarded_at: NOW }, email: 'you@example.com' }))
    if (path.startsWith('/api/billing/status')) return Promise.resolve(json({ subscription: { status: 'grandfathered', tier: null, trial_ends_at: null, current_period_end: null, cancel_at_period_end: false }, access: 'uncapped', usage: null }))
    // ?slow=1 holds every write open so the "Saving…" state can be looked at.
    if (path.startsWith('/api/studio/') && init?.method && init.method !== 'GET') return new Promise((r) => setTimeout(() => r(json({ success: true })), slow ? 20000 : 0))
    return real(input, init)
  }
}

function Inner() {
  const params = useSearchParams()
  // ?empty=1 is a blank page; the default is the paragraph "Skip to writing" leaves behind.
  const text = params.get('empty') ? '' : 'A morning where nothing was asked of me, and how strange it was to notice.'
  // ?concept=1 is a piece that came through the Idea Lab conversation, so it has a core concept.
  if (typeof window !== 'undefined') installMock(text, !!params.get('concept'), !!params.get('board'), !!params.get('slow'))
  // ?view=home reproduces Home's header (the only page with the settings gear) to check the sheet against the dock.
  if (params.get('view') === 'home') {
    return (
      <PageShell mood="ember">
        <PageHeader title="Good evening" actions={<SettingsButton />} />
        <Container><Card>A page with the settings gear in its header.</Card></Container>
      </PageShell>
    )
  }
  // ?board=1 is the project board a lone piece opens onto after "Create a project from this piece".
  if (params.get('board')) return <WorkPage projectId="demo" focus={{ kind: 'project' }} />
  return <WorkPage projectId="demo" focus={{ kind: 'node', id: 'node-1' }} />
}

export function WorkPageHarness() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}
