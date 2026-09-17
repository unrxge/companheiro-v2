'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { shell } from '@/lib/design-tokens'

// /project-board is superseded by /shelf (Phase 6 of the studio migration —
// studio_projects/studio_nodes is now the complete dataset for old and new
// work alike). This is a UI-layer redirect only: the /api/project-board/*
// routes and the underlying pieces/ideas tables stay fully functional and
// untouched, so nothing here removes or disables them. Anyone landing on
// this route (an old bookmark, a stale link) is sent straight to the shelf
// instead of seeing the retired board UI.
export default function ProjectBoardPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/shelf')
  }, [router])

  return (
    <div style={{ minHeight: '100dvh', background: shell.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: shell.muted }}>Taking you to the shelf…</p>
    </div>
  )
}
