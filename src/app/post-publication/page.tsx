'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useDictation } from '@/lib/use-dictation'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { PrimaryButton } from '@/components/ui/buttons'
import { TextArea, TextField } from '@/components/ui/field'
import { MicButton } from '@/components/ui/mic-button'
import { JourneyNav } from '@/components/widgets'
import { shell, type as typeRoles } from '@/lib/design-tokens'

interface PieceData {
  title: string
  one_sentence: string
}

type Field = 'thread' | 'what_it_opened' | 'unresolved' | 'natural_continuations'

const FIELDS: { key: Field; label: string; placeholder: string; single?: boolean }[] = [
  { key: 'thread', label: 'What thread does this piece belong to?', placeholder: "e.g. 'Authenticity in creative work'", single: true },
  { key: 'what_it_opened', label: 'What did this piece open up?', placeholder: 'What questions, ideas, or conversations did this spark?' },
  { key: 'unresolved', label: 'What did it leave unresolved?', placeholder: "What threads remain loose? What didn't you get to explore?" },
  { key: 'natural_continuations', label: 'Where could this naturally go next?', placeholder: 'Potential next pieces or directions, one per line' },
]

function PostPublicationContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTheme()
  const pieceId = searchParams.get('piece_id')

  const [piece, setPiece] = useState<PieceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [focusedField, setFocusedField] = useState<Field | null>(null)
  const [form, setForm] = useState<Record<Field, string>>({ thread: '', what_it_opened: '', unresolved: '', natural_continuations: '' })
  const focusedFieldRef = useRef<Field | null>(null)
  focusedFieldRef.current = focusedField
  const formRef = useRef(form)
  formRef.current = form
  // Dictation lands in the last focused field, so the mic can sit outside the form.
  const lastFieldRef = useRef<Field>('what_it_opened')

  const { isRecording, interimText, handleRecordToggle, clearInterim } = useDictation({
    onAppend: useCallback((text: string) => {
      const field = focusedFieldRef.current ?? lastFieldRef.current
      setForm((prev) => {
        const cur = prev[field] || ''
        return { ...prev, [field]: cur + (cur && !cur.endsWith(' ') ? ' ' : '') + text }
      })
    }, []),
    getContext: () => (formRef.current[focusedFieldRef.current ?? lastFieldRef.current] || '').slice(-80),
  })

  useEffect(() => {
    if (!pieceId) {
      router.push('/project-board')
      return
    }
    fetch(`/api/project-board/piece?id=${pieceId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setPiece({ title: data.piece.title, one_sentence: data.piece.one_sentence })
      })
      .catch((err) => console.error('Failed to fetch piece:', err))
      .finally(() => setIsLoading(false))
  }, [pieceId, router])

  const handleSubmit = async () => {
    if (!pieceId) return
    setIsSubmitting(true)
    try {
      const res = await fetch('/api/post-publication/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ piece_id: pieceId, ...form }) })
      const data = await res.json()
      if (data.success) router.push(`/read?piece_id=${pieceId}`)
    } catch (err) {
      console.error('Failed to submit:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!pieceId) return null
  const target = focusedField ?? lastFieldRef.current

  return (
    <PageShell mood="violet" maxWidth={760}>
      <PageHeader eyebrow="Write · Post" title={piece?.title || 'Post-publication'} subtitle="It is out. Before it goes quiet, say what it opened and what it left open." size="md" back={`/write/translate?piece_id=${pieceId}`} />

      <Container>
        <div style={{ marginBottom: 22 }}>
          <JourneyNav pieceId={pieceId} step="post" />
        </div>

        {isLoading ? (
          <p style={{ ...typeRoles.small, color: t.textMuted }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Card>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <MicButton recording={isRecording} onToggle={handleRecordToggle} size={48} />
                <div>
                  <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary, fontWeight: 500 }}>{isRecording ? 'Listening' : 'Dictate any answer'}</p>
                  <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted }}>
                    Speaking into: {FIELDS.find((f) => f.key === target)?.label.replace(/\?$/, '')}
                    {isRecording && interimText ? ` · ${interimText}` : ''}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {FIELDS.map((f) => (
                  <div key={f.key}>
                    <Eyebrow style={{ marginBottom: 8 }}>{f.label}</Eyebrow>
                    {f.single ? (
                      <TextField
                        value={form[f.key]}
                        onChange={(v) => setForm((p) => ({ ...p, [f.key]: v }))}
                        onFocus={() => { setFocusedField(f.key); lastFieldRef.current = f.key }}
                        onBlur={() => setFocusedField(null)}
                        placeholder={f.placeholder}
                        ariaLabel={f.label}
                      />
                    ) : (
                      <TextArea
                        voice
                        value={form[f.key]}
                        onChange={(v) => { clearInterim(); setForm((p) => ({ ...p, [f.key]: v })) }}
                        onFocus={() => { setFocusedField(f.key); lastFieldRef.current = f.key }}
                        onBlur={() => setFocusedField(null)}
                        placeholder={f.placeholder}
                        ariaLabel={f.label}
                        minRows={2}
                        maxHeight={220}
                      />
                    )}
                  </div>
                ))}
              </div>
            </Card>
            <PrimaryButton onClick={handleSubmit} disabled={isSubmitting} loading={isSubmitting} loadingLabel="Logging…" full size="lg">
              Log this piece and close the loop →
            </PrimaryButton>
          </div>
        )}
      </Container>
    </PageShell>
  )
}

export default function PostPublicationPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: shell.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: shell.muted }}>Loading…</p>
        </div>
      }
    >
      <PostPublicationContent />
    </Suspense>
  )
}
