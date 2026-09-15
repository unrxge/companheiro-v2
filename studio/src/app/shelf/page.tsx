'use client'

// studio/src/app/shelf/page.tsx — level 3.
//
// Not a grid of cards any more: a desk you can push things around on. Where a
// project lies is saved the moment you let go of it (studio_projects.shelf_x/y).

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { CanvasStage, StageHeader } from '@/components/surface/stage'
import { Level } from '@/components/surface/travel'
import { Desk } from '@/components/shelf/desk'
import { api, ApiError } from '@/lib/studio/api-client'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { shell } from '@/lib/design-tokens'
import { LEVELS } from '@/lib/studio/levels'
import type { Point } from '@/lib/studio/surface'
import type { ShelfProject } from '@/lib/studio/types'

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; code: number }
  | { status: 'ready' }

export default function ShelfPage() {
  const { t } = useTheme()
  const router = useRouter()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [projects, setProjects] = useState<ShelfProject[]>([])

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const res = await api.projects.list()
      setProjects(res.projects)
      setState({ status: 'ready' })
    } catch (e) {
      const code = e instanceof ApiError ? e.status : 0
      setState({
        status: 'error',
        code,
        message: code === 401 ? 'sign in again to see your projects' : 'the shelf did not open',
      })
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const goNew = useCallback(() => router.push('/new'), [router])

  /** Optimistic: the card is already under the cursor, so it must not jump. */
  const move = useCallback((id: string, at: Point | null) => {
    setProjects((prev) => prev.map((p) => (
      p.id === id ? { ...p, shelf_x: at?.x ?? null, shelf_y: at?.y ?? null } : p
    )))
    void fetch(`/api/studio/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ shelf_x: at?.x ?? null, shelf_y: at?.y ?? null }),
    }).catch(() => { void load() })
  }, [load])

  return (
    <Level>
      <CanvasStage header={<StageHeader title={LEVELS.shelf.name} />}>
        {state.status === 'loading' && <Middle>opening the shelf…</Middle>}

        {state.status === 'error' && (
          <Middle>
            <p style={{ ...canvasType.body, color: shell.text, margin: '0 0 16px' }}>{state.message}</p>
            {state.code === 401
              ? <GhostButton onClick={() => router.push('/login')}>sign in</GhostButton>
              : <GhostButton onClick={() => void load()}>try again</GhostButton>}
          </Middle>
        )}

        {state.status === 'ready' && projects.length === 0 && (
          <Middle>
            <p style={{ ...canvasType.body, color: t.textSecondary, margin: '0 0 16px' }}>
              Nothing on the shelf yet.
            </p>
            <PrimaryButton onClick={goNew}>new project</PrimaryButton>
          </Middle>
        )}

        {state.status === 'ready' && projects.length > 0 && (
          <Desk projects={projects} onNew={goNew} onMove={move} />
        )}
      </CanvasStage>
    </Level>
  )
}

function Middle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, padding: 24, textAlign: 'center',
        ...canvasType.small, color: shell.muted,
      }}
    >
      {children}
    </div>
  )
}
