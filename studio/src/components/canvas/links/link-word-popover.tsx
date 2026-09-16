'use client'

// studio/src/components/canvas/links/link-word-popover.tsx — the word popover
// after a link is made (D-024; lane D): one field, ≤ 24 chars, Enter =
// save (api.links.word + store), Esc = no word. `at` is a WORLD point (the
// link's midpoint); the popover is portalled onto `[data-stage]` and placed in
// screen space so the input never lives inside the scaled world (D-027).
// Lane B's pointer machine mounts it after the second click of link mode with
// the new link's id; the links layer mounts it to change an existing word.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@/lib/studio/api-client'
import { canvasType, glass, line, radii, zIndex } from '@/lib/studio/canvas-tokens'
import { useStore, useViewport } from '@/lib/studio/hooks'
import type { Point } from '@/lib/studio/types'

export const LINK_WORD_MAX = 24
const W = 168
const H = 32

export function LinkWordPopover({ linkId, at, onClose }: { linkId: string; at: Point; onClose: () => void }) {
  const store = useStore()
  const v = useViewport()
  const link = store.get().links.get(linkId)
  const [value, setValue] = useState(link?.word ?? '')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [host, setHost] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setHost((document.querySelector('[data-stage]') as HTMLElement | null) ?? document.body)
  }, [])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [host])

  if (!host || !link) return null

  const save = async () => {
    const word = value.trim().slice(0, LINK_WORD_MAX) || null
    if (word === (link.word ?? null)) {
      onClose()
      return
    }
    setBusy(true)
    const before = link
    store.set((s) => {
      s.links = new Map(s.links).set(linkId, { ...before, word })
    })
    try {
      const { link: saved } = await api.links.word(store.get().project.id, linkId, word)
      store.set((s) => {
        s.links = new Map(s.links).set(linkId, saved)
      })
    } catch (e) {
      console.error('studio: link word failed', e)
      store.set((s) => {
        s.links = new Map(s.links).set(linkId, before)
      })
    } finally {
      setBusy(false)
      onClose()
    }
  }

  // screen position inside the stage; clamped so the field stays visible
  const sx = at.x * v.k + v.tx
  const sy = at.y * v.k + v.ty
  const maxX = Math.max(8, host.clientWidth - W - 8)
  const maxY = Math.max(8, host.clientHeight - H - 8)
  const left = Math.min(maxX, Math.max(8, sx - W / 2))
  const top = Math.min(maxY, Math.max(8, sy - H / 2))

  return createPortal(
    <div
      data-no-drag
      data-link-word-popover
      role="dialog"
      aria-label="link word"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left,
        top,
        width: W,
        height: H,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        boxSizing: 'border-box',
        backgroundColor: glass.bg,
        backdropFilter: glass.filter,
        WebkitBackdropFilter: glass.filter,
        border: `1px solid ${line.chrome}`,
        borderRadius: radii.contextBar,
        zIndex: zIndex.contextBar,
      }}
    >
      <input
        ref={inputRef}
        value={value}
        maxLength={LINK_WORD_MAX}
        disabled={busy}
        placeholder="a word, or none"
        aria-label="link word"
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            void save()
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
        onBlur={() => {
          if (!busy) void save()
        }}
        style={{
          ...canvasType.label,
          width: '100%',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          color: glass.text,
          padding: 0,
        }}
      />
    </div>,
    host
  )
}
