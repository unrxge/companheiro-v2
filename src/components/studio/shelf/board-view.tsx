'use client'

// src/components/studio/shelf/board-view.tsx — the Project Board's page frame.
//
// The header sits exactly where every other module's header sits (same top
// clearance for the Dock, same centred column). The canvas is only the area
// beneath it, down to the bottom of the window: it is a clipped region, so a
// long board scrolls its folders away at the header's lower edge rather than
// letting them slide up under the title.

import { Atmosphere } from '@/components/shell/atmosphere'
import { Dock } from '@/components/shell/dock'
import { PageHeader } from '@/components/shell/page-shell'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { Level } from '@/components/studio/surface/travel'
import { Desk } from '@/components/studio/shelf/desk'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { LEVELS } from '@/lib/studio/levels'
import { shell, widths } from '@/lib/design-tokens'
import type { BoardItem } from '@/lib/studio/shelf-view'

export type BoardState =
  | { status: 'loading' }
  | { status: 'error'; message: string; code: number }
  | { status: 'ready' }

export function BoardView({
  state, items, onNew, onMove, onArrange, onDelete, onRetry, onSignIn,
}: {
  state: BoardState
  items: BoardItem[]
  onNew: () => void
  onMove: (id: string, saved: { x: number; y: number }) => void
  onArrange: () => void
  onDelete: (item: BoardItem) => void
  onRetry: () => void
  onSignIn: () => void
}) {
  return (
    <>
      <Level>
        <div
          style={{
            position: 'relative', height: '100dvh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column', background: shell.ink,
          }}
        >
          <style>{`
            /* the same clearances PageShell's page column gives every header */
            .board-head { padding: 24px 20px 0; }
            @media (min-width: 720px) { .board-head { padding: 84px 24px 0; } }
            @media (max-width: 719px) and (display-mode: standalone) {
              .board-head { padding-top: calc(env(safe-area-inset-top, 20px) + 24px); }
            }
            /* PageHeader ends with a 28px margin; the canvas starts closer in */
            .board-head > header { margin-bottom: 12px !important; }
            /* below 720px the Dock sits along the bottom, so the canvas stops above it */
            @media (max-width: 719px) { .board-canvas { margin-bottom: 76px; } }
          `}</style>
          <Atmosphere mood="verdant" intensity={0.6} />

          <div
            className="board-head"
            style={{ position: 'relative', zIndex: 2, flexShrink: 0, width: '100%', maxWidth: widths.page, margin: '0 auto', boxSizing: 'border-box' }}
          >
            <PageHeader title={LEVELS.shelf.name} />
          </div>

          <div className="board-canvas" style={{ position: 'relative', zIndex: 1, flex: 1, minHeight: 0 }}>
            {state.status === 'loading' && <Middle>opening the project board…</Middle>}

            {state.status === 'error' && (
              <Middle>
                <p style={{ ...canvasType.body, color: shell.text, margin: '0 0 16px' }}>{state.message}</p>
                {state.code === 401
                  ? <GhostButton onClick={onSignIn}>sign in</GhostButton>
                  : <GhostButton onClick={onRetry}>try again</GhostButton>}
              </Middle>
            )}

            {state.status === 'ready' && items.length === 0 && (
              <Middle>
                <p style={{ ...canvasType.body, color: shell.muted, margin: '0 0 16px' }}>
                  Nothing on the project board yet.
                </p>
                <PrimaryButton onClick={onNew}>new idea</PrimaryButton>
              </Middle>
            )}

            {state.status === 'ready' && items.length > 0 && <Desk items={items} onNew={onNew} onMove={onMove} onArrange={onArrange} onDelete={onDelete} />}
          </div>
        </div>
      </Level>
      <Dock />
    </>
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
