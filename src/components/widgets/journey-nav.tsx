'use client'

import { StageRibbon } from '@/components/widgets/stage-ribbon'
import type { JourneyStep } from '@/lib/design-tokens'

/** Where each journey step lives. This is the navigation between the writing screens. */
export function journeyHref(step: JourneyStep, pieceId: string): string {
  switch (step) {
    case 'concept':
      return `/project-board?piece_id=${pieceId}`
    case 'write':
      return `/write?piece_id=${pieceId}`
    case 'test':
      return `/write/test?piece_id=${pieceId}`
    case 'shape':
      return `/write/translate?piece_id=${pieceId}`
    case 'post':
      return `/post-publication?piece_id=${pieceId}`
    case 'reflect':
      return `/read?piece_id=${pieceId}`
  }
}

/**
 * The piece journey as navigation: every step is a link. Used in the header
 * of Write, Test, Shape (Translate/Reimagine), Post and the Reading room, so
 * the back half of the loop is always one tap away.
 */
export function JourneyNav({ pieceId, step, compact = false }: { pieceId: string; step: JourneyStep; compact?: boolean }) {
  return <StageRibbon step={step} compact={compact} hrefFor={(s) => journeyHref(s, pieceId)} />
}

/**
 * Where each journey step lives for a piece created through the node/thread
 * model (Phase 3 of the Project Board -> Studio migration, extended in
 * Phase 4) — a root studio_node rather than a `pieces` row. All six steps
 * are clickable now that /post-publication and /read understand node_id too.
 */
export function journeyHrefForNode(
  step: JourneyStep,
  { projectId, nodeId }: { projectId: string | null; nodeId: string }
): string | null {
  switch (step) {
    case 'concept':
      return projectId ? `/p/${projectId}` : null
    case 'write':
      return `/write?node_id=${nodeId}`
    case 'test':
      return `/write/test?node_id=${nodeId}`
    case 'shape':
      return `/write/translate?node_id=${nodeId}`
    case 'post':
      return `/post-publication?node_id=${nodeId}`
    case 'reflect':
      return `/read?node_id=${nodeId}`
  }
}

/** Node/thread-model equivalent of JourneyNav — same ribbon, sourced from a
 *  project id + root node id instead of a piece id. */
export function JourneyNavNode({
  projectId,
  nodeId,
  step,
  compact = false,
}: {
  projectId: string | null
  nodeId: string
  step: JourneyStep
  compact?: boolean
}) {
  return <StageRibbon step={step} compact={compact} hrefFor={(s) => journeyHrefForNode(s, { projectId, nodeId })} />
}
