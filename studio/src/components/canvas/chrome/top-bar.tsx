'use client'

// studio/src/components/canvas/chrome/top-bar.tsx — 48 px ink bar over the shell
// atmosphere (6.4): back to the shelf, the project title (click → inline rename),
// the status pill; right: `compass` (tide dot when something waits) and the theme
// toggle. Nothing else.

import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useTheme } from '@/components/theme/theme-provider'
import { IconButton } from '@/components/ui/icon-button'
import { ThemeToggleButton } from '@/components/ui/theme-toggle-button'
import { fonts, shell, tokensFor } from '@/lib/design-tokens'
import { api } from '@/lib/studio/api-client'
import { canvasType, geometry, glass, line, motionSpec, zIndex } from '@/lib/studio/canvas-tokens'
import { useCatches, useCompass, useProject, useStore } from '@/lib/studio/hooks'
import type { CanvasActions } from '@/components/canvas/actions'
import { statusLabel } from '@/components/canvas/chrome/status-strip'

const INK = tokensFor('dark')

export function TopBar({ actions: _actions }: { actions: CanvasActions }) {
  const { theme, toggle } = useTheme()
  const store = useStore()
  const project = useProject()
  const compass = useCompass()
  const catches = useCatches()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(project.title)

  useEffect(() => {
    if (!editing) setDraft(project.title)
  }, [project.title, editing])

  const pending = compass.some((e) => e.status === 'pending') || catches.some((c) => c.mark === null)

  const commit = async () => {
    setEditing(false)
    const title = draft.trim().slice(0, 120)
    if (!title || title === project.title) {
      setDraft(project.title)
      return
    }
    store.set((s) => {
      s.project = { ...s.project, title }
    })
    try {
      const { project: saved } = await api.projects.patch(project.id, { title })
      store.set((s) => {
        s.project = { ...s.project, title: saved.title, updated_at: saved.updated_at }
      })
    } catch (e) {
      console.error('studio: rename failed', e)
    }
  }

  const openCompass = () =>
    store.set((s) => {
      s.drawer = s.drawer.kind === 'compass' ? { kind: 'none' } : { kind: 'compass' }
    })

  return (
    <header
      data-top-bar
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: geometry.topBarH,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '0 12px 0 8px',
        color: shell.text,
        zIndex: zIndex.chrome,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <IconButton href="/shelf" ariaLabel="back to the shelf" size={32}>
          <ArrowLeft size={16} strokeWidth={1.5} />
        </IconButton>
        {editing ? (
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => void commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commit()
              if (e.key === 'Escape') {
                setDraft(project.title)
                setEditing(false)
              }
              e.stopPropagation()
            }}
            aria-label="project title"
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            style={{
              ...canvasType.title,
              fontSize: 15,
              color: shell.text,
              backgroundColor: shell.fill,
              border: `1px solid ${line.chrome}`,
              borderRadius: 8,
              padding: '3px 8px',
              outline: 'none',
              minWidth: 120,
              maxWidth: 420,
              width: `${Math.max(12, draft.length)}ch`,
              fontFamily: fonts.ui,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            title="rename"
            style={{
              ...canvasType.title,
              fontSize: 15,
              color: shell.text,
              background: 'none',
              border: 'none',
              padding: '3px 6px',
              borderRadius: 8,
              cursor: 'text',
              maxWidth: 480,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'left',
            }}
          >
            {project.title || 'untitled project'}
          </button>
        )}
        <span
          data-status-pill
          style={{
            ...canvasType.label,
            color: project.status === 'active' ? glass.muted : shell.text,
            border: `1px solid ${line.chrome}`,
            borderRadius: 999,
            padding: '3px 8px',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {statusLabel(project)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={openCompass}
          className="studio-icon"
          style={{
            ...canvasType.small,
            fontWeight: 500,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            color: shell.text,
            background: 'none',
            border: `1px solid ${line.chrome}`,
            borderRadius: 999,
            padding: '5px 12px',
            cursor: 'pointer',
            opacity: 1,
            transition: `transform ${motionSpec.hoverMs}ms ease`,
          }}
        >
          {pending && <i aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: INK.tide }} />}
          compass
        </button>
        <ThemeToggleButton theme={theme} onToggle={toggle} />
      </div>
    </header>
  )
}
