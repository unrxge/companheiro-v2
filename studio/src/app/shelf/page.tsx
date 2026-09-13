'use client'

// studio/src/app/shelf/page.tsx — the shelf (10.1, lane A): PageShell with no
// dock, mood neutral; header `the shelf` with `new project` and the theme toggle;
// the grid of project cards. Status changes happen inside a project, never here.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Container, PageHeader, PageShell } from '@/components/shell/page-shell'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { useTheme } from '@/components/theme/theme-provider'
import { api, ApiError } from '@/lib/studio/api-client'
import { canvasType } from '@/lib/studio/canvas-tokens'
import type { ShelfProject } from '@/lib/studio/types'
import { ShelfGrid } from '@/components/shelf/shelf-grid'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; code: number }
  | { status: 'ready'; projects: ShelfProject[] }

export default function ShelfPage() {
  const { t } = useTheme()
  const router = useRouter()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const { projects } = await api.projects.list()
      setState({ status: 'ready', projects })
    } catch (e) {
      const code = e instanceof ApiError ? e.status : 0
      setState({
        status: 'error',
        code,
        message: code === 401 ? 'sign in again to see your projects' : 'the shelf did not open',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const goNew = () => router.push('/new')

  return (
    <PageShell dock={false} mood="neutral">
      <PageHeader
        eyebrow="studio"
        title="the shelf"
        size="md"
        actions={
          <PrimaryButton size="sm" onClick={goNew}>
            new project
          </PrimaryButton>
        }
      />
      {state.status === 'loading' && (
        <Container padding={32}>
          <p style={{ ...canvasType.meta, color: t.textMuted, margin: 0 }}>opening the shelf…</p>
        </Container>
      )}
      {state.status === 'error' && (
        <Container padding={32}>
          <p style={{ ...canvasType.body, color: t.textSecondary, margin: '0 0 16px' }}>{state.message}</p>
          {state.code === 401 ? (
            <GhostButton onClick={() => router.push('/login')}>sign in</GhostButton>
          ) : (
            <GhostButton onClick={() => void load()}>try again</GhostButton>
          )}
        </Container>
      )}
      {state.status === 'ready' && <ShelfGrid projects={state.projects} onNew={goNew} />}
    </PageShell>
  )
}
