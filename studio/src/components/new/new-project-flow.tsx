'use client'

// studio/src/components/new/new-project-flow.tsx — lane H (10.2, D-061). One
// screen: two ways in (a brief, or four questions) → `read it` →
// POST /projects/draft-concept → the review → `make the project` →
// POST /projects → the canvas. Nothing is persisted before the last press; a
// switch between the two ways keeps what was typed in each.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion as m, useReducedMotion } from 'motion/react'
import { Container } from '@/components/shell/page-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { api, ApiError } from '@/lib/studio/api-client'
import { canvasType, motionSpec } from '@/lib/studio/canvas-tokens'
import type { CreateProjectRequest, DraftConceptResponse } from '@/lib/studio/types'
import { BriefPaste } from '@/components/new/brief-paste'
import { FourQuestions, type FourAnswers } from '@/components/new/four-questions'
import { ConceptReview } from '@/components/new/concept-review'

type Way = 'brief' | 'questions'
type Step = { kind: 'input' } | { kind: 'review'; draft: DraftConceptResponse }

const WAYS: Array<{ id: Way; label: string }> = [
  { id: 'brief', label: 'From a brief' },
  { id: 'questions', label: 'Four questions' },
]

function errorLine(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.status === 401) return 'Sign in again'
    if (e.status === 400) return e.message
  }
  return fallback
}

export function NewProjectFlow() {
  const { t } = useTheme()
  const router = useRouter()
  const reduce = useReducedMotion() ?? false
  const [way, setWay] = useState<Way>('brief')
  const [brief, setBrief] = useState('')
  const [answers, setAnswers] = useState<FourAnswers>(['', '', '', ''])
  const [step, setStep] = useState<Step>({ kind: 'input' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const read = async () => {
    setBusy(true)
    setError(null)
    try {
      const draft = await api.projects.draftConcept(way === 'brief' ? { mode: 'brief', brief } : { mode: 'questions', answers })
      setStep({ kind: 'review', draft })
    } catch (e) {
      setError(errorLine(e, 'The draft did not arrive · try again'))
    } finally {
      setBusy(false)
    }
  }

  const make = async (req: CreateProjectRequest) => {
    setBusy(true)
    setError(null)
    try {
      const { bundle } = await api.projects.create(req)
      router.push(`/p/${bundle.project.id}`)
    } catch (e) {
      setError(errorLine(e, 'The project was not made · try again'))
      setBusy(false)
    }
  }

  const fade = {
    initial: { opacity: 0, y: reduce ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: reduce ? 0 : -8 },
    transition: { duration: reduce ? 0 : motionSpec.panelMs / 1000, ease: [0.2, 0.7, 0.2, 1] as const },
  }

  return (
    <Container padding={0}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 24px 40px' }}>
        <AnimatePresence mode="wait" initial={false}>
          {step.kind === 'input' ? (
            <m.div key="input" {...fade} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div role="tablist" aria-label="Two ways in" style={{ display: 'flex', gap: 20 }}>
                {WAYS.map((w) => {
                  const active = w.id === way
                  return (
                    <button
                      key={w.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => {
                        if (busy) return
                        setWay(w.id)
                        setError(null)
                      }}
                      style={{
                        ...canvasType.eyebrow,
                        color: active ? t.textPrimary : t.textMuted,
                        background: 'none',
                        border: 'none',
                        padding: '0 0 6px',
                        cursor: busy ? 'default' : 'pointer',
                        borderBottom: `1px solid ${active ? t.textPrimary : 'transparent'}`,
                        transition: 'color 150ms ease, border-color 150ms ease',
                      }}
                    >
                      {w.label}
                    </button>
                  )
                })}
              </div>
              {way === 'brief' ? (
                <BriefPaste value={brief} onChange={setBrief} onRead={() => void read()} busy={busy} error={error} />
              ) : (
                <FourQuestions answers={answers} onChange={setAnswers} onRead={() => void read()} busy={busy} error={error} />
              )}
            </m.div>
          ) : (
            <m.div key="review" {...fade}>
              <ConceptReview
                draft={step.draft}
                busy={busy}
                error={error}
                onBack={() => {
                  if (busy) return
                  setError(null)
                  setStep({ kind: 'input' })
                }}
                onMake={(req) => void make(req)}
              />
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </Container>
  )
}
