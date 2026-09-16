'use client'

// studio/src/app/dev/shelf/page.tsx — the desk (level 3), in memory.
//
// Same component the real shelf uses; only the store behind it is fake. It
// exists so the placement, the drag and the flight into a project can be
// checked without an account.

import { useCallback, useState } from 'react'
import { CanvasStage, StageHeader } from '@/components/surface/stage'
import { Level } from '@/components/surface/travel'
import { Desk } from '@/components/shelf/desk'
import { LEVELS } from '@/lib/studio/levels'
import type { Point } from '@/lib/studio/surface'
import type { ProjectStatus, ShelfProject } from '@/lib/studio/types'

const NOW = '2026-09-15T09:00:00.000Z'

function project(
  id: string,
  title: string,
  concept: string,
  status: ProjectStatus = 'active',
  shelf: Point | null = null,
): ShelfProject {
  return {
    id, user_id: 'dev', title, intent: '', rules: [], status,
    resting_until: status === 'resting' ? '2026-09-29T00:00:00.000Z' : null,
    completed_at: null, completion_note: null,
    viewport: { tx: 0, ty: 0, k: 1 },
    shelf_x: shelf?.x ?? null, shelf_y: shelf?.y ?? null,
    vision_x: null, vision_y: null,
    settings: { snap: true, grid: true, sizes: false },
    auto_layout: true, composed_at: null, canvas_version: 1,
    last_opened_at: NOW, opened_before_at: NOW, created_at: NOW, updated_at: NOW,
    concept_body: concept,
    since: { last_said: null, arrived_since: 0, waiting: 0 } as ShelfProject['since'],
  }
}

const SEED: ShelfProject[] = [
  project('p1', 'nine nights', 'Three short films about a daughter and a mother, released a month apart.', 'active', { x: 120, y: 140 }),
  project('p2', 'the salt letters', 'An epistolary novella between two people who never meet.', 'active', { x: 470, y: 300 }),
  project('p3', 'low tide', 'Nine songs written in the same key, recorded in one room.', 'resting', { x: 840, y: 120 }),
  project('p4', 'what the river took', 'A long essay about a drowned village and the people who still visit it.'),
]

export default function DevShelfPage() {
  const [projects, setProjects] = useState<ShelfProject[]>(SEED)

  const move = useCallback((id: string, at: Point | null) => {
    setProjects((prev) => prev.map((p) => (
      p.id === id ? { ...p, shelf_x: at?.x ?? null, shelf_y: at?.y ?? null } : p
    )))
  }, [])

  return (
    <Level>
      <CanvasStage mood="verdant" intensity={0.6} header={<StageHeader title={LEVELS.shelf.name} status="dev" />}>
        <Desk projects={projects} onNew={() => {}} onMove={move} />
      </CanvasStage>
    </Level>
  )
}
