'use client'

import { Suspense } from 'react'
import { HomeView } from '@/components/home/home-view'
import { WorkingDots } from '@/components/ui/working'
import { shell } from '@/lib/design-tokens'

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: shell.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: shell.muted }}><WorkingDots /> Loading…</p>
        </div>
      }
    >
      <HomeView />
    </Suspense>
  )
}
