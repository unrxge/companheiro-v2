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
