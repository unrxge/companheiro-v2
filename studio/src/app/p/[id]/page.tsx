'use client'

// studio/src/app/p/[id]/page.tsx — the project page (lane A): loads the bundle
// (GET), then opens it (POST /open rotates the since window and sweeps unsorted
// talk) and merges the since payload; decides phone mode (D-039) and the
// read-only gate (D-060); mounts <CanvasPage> or <PhoneStage>. Loading and error
// states sit in the shell.
//
// The phone rule itself lives in lib/studio/engine/phone.ts; the hook stays here
// because a page module may only export Next's own symbols.

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Atmosphere } from '@/components/shell/atmosphere'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { fonts, shell } from '@/lib/design-tokens'
import { api, ApiError } from '@/lib/studio/api-client'
import { canvasType } from '@/lib/studio/canvas-tokens'
import type { ProjectBundle } from '@/lib/studio/types'
import { CanvasPage, CanvasProvider } from '@/components/canvas/canvas-page'
import { PhoneStage } from '@/components/phone/phone-stage'
import { isPhone } from '@/lib/studio/engine/phone'

/** null until mounted (so the first paint never flashes the wrong shell). */
function usePhoneMode(): boolean | null {
  const [phone, setPhone] = useState<boolean | null>(null)
  useEffect(() => {
    const update = () => setPhone(isPhone())
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])
  return phone
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string; code: number }
  | { status: 'ready'; bundle: ProjectBundle }

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const phone = usePhoneMode()
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  const load = useCallback(async (): Promise<void> => {
    setState({ status: 'loading' })
    try {
      const { bundle } = await api.projects.get(id)
      let since = bundle.since
      try {
        since = (await api.projects.open(id)).since
      } catch (e) {
        // opening is a courtesy (the since window, the unsorted sweep); the canvas still opens without it
        console.warn('studio: open failed', e)
      }
      setState({
        status: 'ready',
        bundle: {
          ...bundle,
          since,
          project: {
            ...bundle.project,
            last_opened_at: since.last_opened_at,
            canvas_version: Math.max(bundle.project.canvas_version, since.canvas_version),
          },
        },
      })
    } catch (e) {
      const code = e instanceof ApiError ? e.status : 0
      const message =
        code === 401 ? 'sign in again to open this project'
        : code === 404 ? 'nothing here — the project may have been deleted'
        : e instanceof Error && e.message ? e.message : 'the project did not open'
      setState({ status: 'error', message, code })
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  if (state.status === 'loading' || phone === null) {
    return <ShellFrame line="opening…" />
  }

  if (state.status === 'error') {
    return (
      <ShellFrame line={state.message}>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          {state.code === 401 ? (
            <QuietButton onClick={() => router.push('/login')}>sign in</QuietButton>
          ) : (
            <QuietButton onClick={() => void load()}>try again</QuietButton>
          )}
          <GhostButton onClick={() => router.push('/shelf')} style={{ color: shell.muted, boxShadow: `inset 0 0 0 1px ${shell.line}` }}>
            back to the shelf
          </GhostButton>
        </div>
      </ShellFrame>
    )
  }

  const { bundle } = state
  const projectId = bundle.project.id

  if (phone) {
    return (
      <CanvasProvider key={`phone-${projectId}`} bundle={bundle} interactive={false}>
        <PhoneStage />
      </CanvasProvider>
    )
  }

  return <CanvasPage key={projectId} bundle={bundle} interactive={bundle.project.status === 'active'} />
}

function ShellFrame({ line, children }: { line: string; children?: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: shell.ink, overflow: 'hidden' }}>
      <Atmosphere mood="neutral" intensity={0.5} />
      <div
        role="status"
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          textAlign: 'center',
        }}
      >
        <p style={{ ...canvasType.small, fontFamily: fonts.ui, color: shell.muted, margin: 0, maxWidth: 420 }}>{line}</p>
        {children}
      </div>
    </div>
  )
}
