'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useDictation } from '@/lib/use-dictation'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { GhostButton, PrimaryButton, QuietButton } from '@/components/ui/buttons'
import { Pill } from '@/components/ui/pill'
import { TextArea } from '@/components/ui/field'
import { MicButton } from '@/components/ui/mic-button'
import { UnderlineLink } from '@/components/ui/underline-link'
import { JourneyNav, JourneyNavNode } from '@/components/widgets'
import { shell, type as typeRoles } from '@/lib/design-tokens'
import { Working, WorkingDots } from '@/components/ui/working'
import {
  FEELINGS, MAX_FEELINGS, SAID_IT, continuationLines, emptyAnswers, hasAnyAnswer, toLogBody,
  type ReflectionAnswers,
} from '@/lib/reflection'

interface PieceData {
  title: string
  core_truth: string
  project_id: string | null
}

type TextField = 'remembered' | 'unresolved' | 'next'

/** Looking back on a finished piece, one question at a time. Nothing here asks whether it was shared. */
function ReflectContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTheme()
  const pieceId = searchParams.get('piece_id')
  const nodeId = searchParams.get('node_id')

  const [piece, setPiece] = useState<PieceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  const [kept, setKept] = useState<ReflectionAnswers | null>(null)
  const [answers, setAnswers] = useState<ReflectionAnswers>(emptyAnswers)
  const [focusedField, setFocusedField] = useState<TextField | null>(null)
  const focusedFieldRef = useRef<TextField | null>(null)
  focusedFieldRef.current = focusedField
  const answersRef = useRef(answers)
  answersRef.current = answers
  // Dictation lands in the last focused box, so the mic can sit above them.
  const lastFieldRef = useRef<TextField>('remembered')

  const { isRecording, interimText, handleRecordToggle, clearInterim } = useDictation({
    onAppend: useCallback((text: string) => {
      const field = focusedFieldRef.current ?? lastFieldRef.current
      setAnswers((prev) => {
        const cur = prev[field] || ''
        return { ...prev, [field]: cur + (cur && !cur.endsWith(' ') ? ' ' : '') + text }
      })
    }, []),
    getContext: () => (answersRef.current[focusedFieldRef.current ?? lastFieldRef.current] || '').slice(-80),
  })

  useEffect(() => {
    if (!pieceId && !nodeId) {
      router.push('/project-board')
      return
    }
    const url = nodeId ? `/api/read/node?node_id=${nodeId}` : `/api/project-board/piece?id=${pieceId}`
    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        if (!data.success) return
        // Someone who has already looked back is shown it, not asked again.
        if (data.piece.reflection) {
          router.replace(nodeId ? `/read?node_id=${nodeId}` : `/read?piece_id=${pieceId}`)
          return
        }
        setPiece({
          title: data.piece.title,
          core_truth: data.piece.core_truth || '',
          project_id: data.piece.project_id ?? null,
        })
      })
      .catch((err) => console.error('Failed to fetch piece:', err))
      .finally(() => setIsLoading(false))
  }, [pieceId, nodeId, router])

  const finish = async () => {
    if (!pieceId && !nodeId) return
    setIsSubmitting(true)
    setError(null)
    try {
      const body = toLogBody(answers)
      const res = await fetch('/api/post-publication/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nodeId ? { node_id: nodeId, ...body } : { piece_id: pieceId, ...body }),
      })
      const data = await res.json()
      if (data.success) setKept(answers)
      else setError("That didn't save. Your answers are still here; try again?")
    } catch (err) {
      console.error('Failed to submit:', err)
      setError("That didn't save. Your answers are still here; try again?")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!pieceId && !nodeId) return null

  const readHref = nodeId ? `/read?node_id=${nodeId}` : `/read?piece_id=${pieceId}`
  const STEPS = 4
  const last = step === STEPS - 1
  const target = focusedField ?? lastFieldRef.current
  const toggleFeeling = (f: string) =>
    setAnswers((a) => ({
      ...a,
      felt: a.felt.includes(f) ? a.felt.filter((x) => x !== f) : a.felt.length < MAX_FEELINGS ? [...a.felt, f] : a.felt,
    }))
  const bind = (key: TextField) => ({
    onFocus: () => { setFocusedField(key); lastFieldRef.current = key },
    onBlur: () => setFocusedField(null),
  })
  const micRow = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
      <MicButton recording={isRecording} onToggle={handleRecordToggle} size={40} />
      <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, margin: 0 }}>
        {isRecording ? `Listening${interimText ? ` · ${interimText}` : ''}` : 'You can say it out loud instead.'}
      </p>
    </div>
  )

  const question = (text: string, hint?: string) => (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ ...typeRoles.h2, fontSize: 21, lineHeight: 1.3, color: t.textPrimary, margin: 0 }}>{text}</h2>
      {hint && <p style={{ ...typeRoles.small, color: t.textMuted, margin: '8px 0 0' }}>{hint}</p>}
    </div>
  )

  return (
    <PageShell mood="violet" maxWidth={760}>
      <PageHeader
        eyebrow="Reflect"
        title={piece?.title || 'Reflect'}
        subtitle="A few minutes to look back on it. Every question can be skipped."
        size="md"
        back={nodeId ? `/write/test?node_id=${nodeId}` : `/write/test?piece_id=${pieceId}`}
      />

      <Container>
        <div style={{ marginBottom: 22 }}>
          {nodeId ? <JourneyNavNode projectId={piece?.project_id ?? null} nodeId={nodeId} step="reflect" /> : <JourneyNav pieceId={pieceId!} step="reflect" />}
        </div>

        {isLoading ? (
          <Working size="sm" label="Loading…" patientNote={null} color={t.textMuted} />
        ) : !piece ? (
          <p style={{ ...typeRoles.small, color: t.textMuted }}>That piece could not be found.</p>
        ) : kept ? (
          <Card>
            <Eyebrow style={{ marginBottom: 12 }}>Kept</Eyebrow>
            <h2 style={{ ...typeRoles.h2, fontSize: 21, lineHeight: 1.3, color: t.textPrimary, margin: '0 0 16px' }}>
              {hasAnyAnswer(kept) ? 'Here is what you said about it.' : 'Marked as done. Nothing to add is a fine answer.'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {SAID_IT.find((s) => s.key === kept.said_it) && (
                <p style={{ ...typeRoles.ui, fontSize: 15, fontWeight: 500, color: t.textPrimary, margin: 0 }}>
                  {SAID_IT.find((s) => s.key === kept.said_it)?.line}
                </p>
              )}
              {kept.felt.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {kept.felt.map((f) => <Pill key={f} hue="violet">{f}</Pill>)}
                </div>
              )}
              {kept.remembered.trim() && (
                <p style={{ ...typeRoles.quote, fontSize: 16, color: t.textSecondary, margin: 0, whiteSpace: 'pre-wrap' }}>{kept.remembered.trim()}</p>
              )}
              {(kept.unresolved.trim() || kept.next.trim()) && (
                <div>
                  <Eyebrow style={{ marginBottom: 8, color: t.ember }}>Still open</Eyebrow>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[kept.unresolved.trim(), ...continuationLines(kept.next)].filter(Boolean).map((line, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', border: `2px solid ${t.ember}`, flexShrink: 0, marginTop: 6 }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary, margin: 0 }}>{line}</p>
                          <UnderlineLink href={`/idea-lab/conceptualise?seed=${encodeURIComponent(line)}`} color={t.textMuted}>Develop this →</UnderlineLink>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ marginTop: 22 }}>
              <PrimaryButton href={readHref}>Open it in the reading room →</PrimaryButton>
            </div>
          </Card>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <div role="progressbar" aria-valuemin={1} aria-valuemax={STEPS} aria-valuenow={step + 1} aria-label="Where you are" style={{ display: 'flex', gap: 6, marginBottom: 22 }}>
                {Array.from({ length: STEPS }).map((_, i) => (
                  <span key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= step ? t.violet : t.divider, transition: 'background 200ms ease' }} />
                ))}
              </div>

              {step === 0 && (
                <>
                  {piece.core_truth && (
                    <div style={{ marginBottom: 20 }}>
                      <Eyebrow style={{ marginBottom: 8 }}>What you set out to say</Eyebrow>
                      <p style={{ ...typeRoles.quote, fontSize: 18, color: t.textPrimary, margin: 0 }}>{piece.core_truth}</p>
                    </div>
                  )}
                  {question(piece.core_truth ? 'Did it say it?' : 'Did it say what you meant it to?', 'Your own call. Nobody is grading it.')}
                  <div role="radiogroup" aria-label="Did it say it?" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {SAID_IT.map((s) => (
                      <Pill
                        key={s.key}
                        size="md"
                        hue="violet"
                        selected={answers.said_it === s.key}
                        onClick={() => setAnswers((a) => ({ ...a, said_it: a.said_it === s.key ? null : s.key }))}
                      >
                        {s.label}
                      </Pill>
                    ))}
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  {question('How does it sit with you now that it is done?', `Pick up to ${MAX_FEELINGS}, or none. Some of these are hard ones, and that is allowed.`)}
                  <div role="group" aria-label="How it sits with you" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {FEELINGS.map((f) => (
                      <Pill
                        key={f}
                        size="md"
                        hue="violet"
                        selected={answers.felt.includes(f)}
                        onClick={() => toggleFeeling(f)}
                      >
                        {f}
                      </Pill>
                    ))}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  {question(
                    answers.said_it === 'other' ? 'What did it turn into instead?' : 'What do you want to remember about making it?',
                    'A line is enough. The moment it turned, something that surprised you, what it cost or gave back.',
                  )}
                  {micRow}
                  <TextArea
                    voice
                    value={answers.remembered}
                    onChange={(v) => { clearInterim(); setAnswers((a) => ({ ...a, remembered: v })) }}
                    {...bind('remembered')}
                    placeholder="Whatever comes first."
                    ariaLabel="What you want to remember"
                    minRows={3}
                    maxHeight={260}
                  />
                </>
              )}

              {step === 3 && (
                <>
                  {question('Did it leave anything open?', 'What you write here is kept with the piece. Each line gets a “Develop this” link, so it can be where your next idea starts.')}
                  {micRow}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                    <div>
                      <Eyebrow style={{ marginBottom: 8 }}>Left open</Eyebrow>
                      <TextArea
                        voice
                        value={answers.unresolved}
                        onChange={(v) => { clearInterim(); setAnswers((a) => ({ ...a, unresolved: v })) }}
                        {...bind('unresolved')}
                        placeholder="A question it didn't answer, a part that isn't settled."
                        ariaLabel="What it left open"
                        minRows={2}
                        maxHeight={200}
                      />
                    </div>
                    <div>
                      <Eyebrow style={{ marginBottom: 8 }}>Something you now want to make</Eyebrow>
                      <TextArea
                        voice
                        value={answers.next}
                        onChange={(v) => { clearInterim(); setAnswers((a) => ({ ...a, next: v })) }}
                        {...bind('next')}
                        placeholder="One idea per line."
                        ariaLabel="What you now want to make"
                        minRows={2}
                        maxHeight={200}
                      />
                    </div>
                  </div>
                </>
              )}

              {error && <p role="alert" style={{ ...typeRoles.small, color: t.danger, margin: '16px 0 0' }}>{error}</p>}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
                {step > 0 && <GhostButton size="sm" onClick={() => setStep((s) => s - 1)} disabled={isSubmitting}>Back</GhostButton>}
                <div style={{ flex: 1 }} />
                {last ? (
                  <PrimaryButton onClick={() => void finish()} loading={isSubmitting} loadingLabel="Keeping…">Keep this</PrimaryButton>
                ) : (
                  <>
                    <GhostButton size="sm" onClick={() => setStep((s) => s + 1)}>Skip</GhostButton>
                    <QuietButton onClick={() => setStep((s) => s + 1)}>Next</QuietButton>
                  </>
                )}
              </div>
            </Card>
            <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted, margin: 0, textAlign: 'center' }}>
              {isRecording || focusedField ? `Speaking into: ${target === 'remembered' ? 'what you want to remember' : target === 'unresolved' ? 'what it left open' : 'what you want to make next'}. ` : ''}
              Keeping this marks the piece as done. Skip everything and it still does.
            </p>
          </div>
        )}
      </Container>
    </PageShell>
  )
}

export default function ReflectPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: shell.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: shell.muted }}><WorkingDots /> Loading…</p>
        </div>
      }
    >
      <ReflectContent />
    </Suspense>
  )
}
