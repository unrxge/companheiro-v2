'use client'

// studio/src/components/canvas/chrome/library-panel.tsx — the block library (6.4):
// a search field, then the 13 LIBRARY_TYPES as 120 × 72 tiles (20 px lucide icon,
// lowercase name, one line of what it holds). Click → `onPlace(type)` (canvas-page
// passes actions.enterPlacing; lane B swaps it for machine.enterPlacing). A tile is
// also draggable with `application/x-studio-block` so B's stage can accept drops.

import { useMemo, useState, type ReactNode } from 'react'
import {
  Anchor, AudioLines, Bookmark, BookOpen, Clock, Compass, FileText, Frame, Heading, Image as ImageIcon, Images,
  MessageSquare, Palette, Rows3, SeparatorHorizontal, SquareCheck, StickyNote,
} from 'lucide-react'
import { canvasType, glass, line, motionSpec } from '@/lib/studio/canvas-tokens'
import { LIBRARY_ORDER, registry } from '@/lib/studio/registry'
import type { BlockType } from '@/lib/studio/types'
import { GlassInput, PanelHeader, PanelHint } from '@/components/canvas/chrome/panel'

export const BLOCK_DRAG_MIME = 'application/x-studio-block'

/** One lucide icon per type, 16 px by default (the library tiles use 20). */
export function typeIcon(type: BlockType, size = 16): ReactNode {
  const p = { size, strokeWidth: 1.5 }
  switch (type) {
    case 'concept': return <BookOpen {...p} />
    case 'since': return <Clock {...p} />
    case 'update': return <MessageSquare {...p} />
    case 'timeline': return <Rows3 {...p} />
    case 'draft': return <FileText {...p} />
    case 'anchor': return <Anchor {...p} />
    case 'note': return <StickyNote {...p} />
    case 'reference': return <Bookmark {...p} />
    case 'commitment': return <SquareCheck {...p} />
    case 'compass': return <Compass {...p} />
    case 'frame': return <Frame {...p} />
    case 'heading': return <Heading {...p} />
    case 'divider': return <SeparatorHorizontal {...p} />
    case 'image': return <ImageIcon {...p} />
    case 'gallery': return <Images {...p} />
    case 'recording': return <AudioLines {...p} />
    case 'palette': return <Palette {...p} />
    default: return null
  }
}

export function LibraryPanel({ onPlace, disabled = false }: { onPlace: (type: BlockType) => void; disabled?: boolean }) {
  const [query, setQuery] = useState('')
  const tiles = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return LIBRARY_ORDER
    return LIBRARY_ORDER.filter((type) => {
      const s = registry[type]
      return s.label.includes(q) || s.holds.toLowerCase().includes(q) || type.includes(q)
    })
  }, [query])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 128px)' }}>
      <PanelHeader eyebrow="library" title="add a block" />
      <div style={{ padding: '0 12px 10px' }}>
        <GlassInput value={query} onChange={setQuery} placeholder="search" type="search" ariaLabel="search the library" />
      </div>
      <div style={{ overflowY: 'auto', padding: '0 12px 12px' }}>
        {tiles.length === 0 ? (
          <PanelHint style={{ padding: '8px 4px 12px' }}>nothing called that</PanelHint>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {tiles.map((type) => (
              <Tile key={type} type={type} onPlace={onPlace} disabled={disabled} />
            ))}
          </div>
        )}
        {disabled && <PanelHint style={{ marginTop: 10 }}>this project is read-only right now</PanelHint>}
      </div>
    </div>
  )
}

function Tile({ type, onPlace, disabled }: { type: BlockType; onPlace: (type: BlockType) => void; disabled: boolean }) {
  const s = registry[type]
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      disabled={disabled}
      draggable={!disabled}
      onDragStart={(e) => {
        e.dataTransfer.setData(BLOCK_DRAG_MIME, type)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => onPlace(type)}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      aria-label={`add ${s.label}`}
      style={{
        height: 72,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 4,
        padding: '10px 10px 8px',
        borderRadius: 10,
        border: `1px solid ${hover && !disabled ? line.chrome : line.chromeSoft}`,
        backgroundColor: hover && !disabled ? glass.rowHover : 'transparent',
        color: glass.text,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        textAlign: 'left',
        transition: `background-color ${motionSpec.hoverMs}ms ease, border-color ${motionSpec.hoverMs}ms ease`,
      }}
    >
      <span
        className="studio-icon"
        data-active={hover ? 'true' : undefined}
        style={{ display: 'inline-flex', color: glass.text }}
      >
        {typeIcon(type, 20)}
      </span>
      <span style={{ minWidth: 0, width: '100%' }}>
        <span style={{ ...canvasType.small, fontWeight: 500, display: 'block', lineHeight: 1.2 }}>{s.label}</span>
        <span
          style={{
            ...canvasType.small,
            fontSize: 12,
            color: glass.muted,
            display: 'block',
            lineHeight: 1.25,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {s.holds}
        </span>
      </span>
    </button>
  )
}
