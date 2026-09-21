'use client'

// The Project Board — every project and idea as a folder, most recently
// opened first. Level 3 of the studio (see lib/studio/levels.ts).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { BoardView, type BoardState } from '@/components/studio/shelf/board-view'
import { api, ApiError } from '@/lib/studio/api-client'
import { boardItems, type BoardItem, type DraftLike } from '@/lib/studio/shelf-view'
import type { ShelfProject } from '@/lib/studio/types'

/** Unfinished Idea Lab explorations. Never worth failing the board over. */
async function loadDrafts(): Promise<DraftLike[]> {
  try {
    const res = await fetch('/api/idea-lab/conceptualise/draft', { credentials: 'same-origin' })
    if (!res.ok) return []
    const data = (await res.json()) as { drafts?: DraftLike[] }
    return data.drafts ?? []
  } catch {
    return []
  }
}

export default function ProjectBoardPage() {
  const router = useRouter()
  const confirm = useConfirm()
  const [state, setState] = useState<BoardState>({ status: 'loading' })
  const [projects, setProjects] = useState<ShelfProject[]>([])
  const [drafts, setDrafts] = useState<DraftLike[]>([])

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const [res, found] = await Promise.all([api.projects.list(), loadDrafts()])
      setProjects(res.projects)
      setDrafts(found)
      setState({ status: 'ready' })
    } catch (e) {
      const code = e instanceof ApiError ? e.status : 0
      setState({
        status: 'error',
        code,
        message: code === 401 ? 'sign in again to see your projects' : 'the project board did not open',
      })
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const items = useMemo(() => boardItems(projects, drafts), [projects, drafts])

  const save = useCallback((id: string, x: number | null, y: number | null) =>
    fetch(`/api/studio/projects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ shelf_x: x, shelf_y: y }),
    }), [])

  /** Optimistic: the folder is already under the hand, so it must not jump. */
  const move = useCallback((id: string, saved: { x: number; y: number }) => {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, shelf_x: saved.x, shelf_y: saved.y } : p)))
    save(id, saved.x, saved.y).catch(() => { void load() })
  }, [load, save])

  /** Every folder back on the grid, most recently opened first. */
  const arrange = useCallback(() => {
    const placed = projects.filter((p) => p.shelf_x !== null || p.shelf_y !== null)
    setProjects((prev) => prev.map((p) => ({ ...p, shelf_x: null, shelf_y: null })))
    Promise.all(placed.map((p) => save(p.id, null, null))).catch(() => { void load() })
  }, [load, projects, save])

  /** Deleting is for good, so it always asks first. */
  const remove = useCallback(async (item: BoardItem) => {
    const project = item.kind === 'project'
    const ok = await confirm({
      title: project ? `Delete “${item.title}”?` : 'Discard this idea?',
      body: project
        ? 'The project and everything written in it will be deleted for good. This can’t be undone.'
        : 'The unfinished exploration will be discarded. This can’t be undone.',
      confirmLabel: project ? 'Delete' : 'Discard',
      danger: true,
    })
    if (!ok) return
    if (project) {
      setProjects((prev) => prev.filter((p) => p.id !== item.id))
      api.projects.delete(item.id).catch(() => { void load() })
    } else {
      setDrafts((prev) => prev.filter((d) => d.id !== item.id))
      fetch(`/api/idea-lab/conceptualise/draft?id=${encodeURIComponent(item.id)}`, { method: 'DELETE', credentials: 'same-origin' })
        .then((res) => { if (!res.ok) void load() })
        .catch(() => { void load() })
    }
  }, [confirm, load])

  return (
    <BoardView
      state={state}
      items={items}
      onNew={() => router.push('/idea-lab')}
      onMove={move}
      onArrange={arrange}
      onDelete={(item) => void remove(item)}
      onRetry={() => void load()}
      onSignIn={() => router.push('/login')}
    />
  )
}
