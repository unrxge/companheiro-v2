'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { PrimaryButton, GhostButton, QuietButton } from '@/components/ui/buttons'
import { TextArea } from '@/components/ui/field'
import { JourneyNav } from '@/components/widgets'
import { shell, type as typeRoles } from '@/lib/design-tokens'

interface PieceData {
  id: string
  title: string
  substack_draft: string
  short_form_script: string
}

function TranslateContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTheme()
  const pieceId = searchParams.get('piece_id')

  const [piece, setPiece] = useState<PieceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [script, setScript] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!pieceId) {
      router.push('/project-board')
      return
    }
    fetch('/api/write/draft', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ piece_id: pieceId, stage: 'translating' }) }).catch(() => {})
    fetchPiece()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId, router])

  const fetchPiece = async () => {
    try {
      const res = await fetch(`/api/project-board/piece?id=${pieceId}`)
      const data = await res.json()
      if (data.success) {
        setPiece(data.piece)
        setScript(data.piece.short_form_script || '')
      }
    } catch (err) {
      console.error('Failed to fetch piece:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleGenerateScript = async () => {
    if (!pieceId || isGenerating) return
    setIsGenerating(true)
    try {
      const res = await fetch('/api/write/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ piece_id: pieceId }) })
      const data = await res.json()
      setScript(data.script || '')
    } catch (err) {
      console.error('Failed to generate script:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  const saveScript = async (stage?: 'executing') => {
    if (!pieceId) return
    setIsSaving(true)
    try {
      await fetch('/api/write/draft', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ piece_id: pieceId, short_form_script: script, ...(stage ? { stage } : {}) }) })
      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
    } catch (err) {
      console.error('Failed to save script:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleMarkReady = async () => {
    await saveScript('executing')
    router.push(`/post-publication?piece_id=${pieceId}`)
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  if (!pieceId) return null

  return (
    <PageShell mood="violet">
      <PageHeader
        eyebrow="Write · Shape"
        title={piece?.title || 'Translate'}
        subtitle="Long-form to short-form. The draft stays as it is; the script is yours to shape."
        size="md"
        back={`/write?piece_id=${pieceId}`}
        actions={script ? <PrimaryButton size="sm" onClick={handleMarkReady} loading={isSaving} loadingLabel="Saving…">Ready to post →</PrimaryButton> : undefined}
      />

      <Container>
        <div style={{ marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 320px', maxWidth: 520 }}>
            <JourneyNav pieceId={pieceId} step="shape" />
          </div>
          <GhostButton size="sm" href={`/write/reimagine?piece_id=${pieceId}`}>Or reimagine it through a lens →</GhostButton>
        </div>

        {isLoading || !piece ? (
          <p style={{ ...typeRoles.small, color: t.textMuted }}>Loading…</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
            <Card>
              <Eyebrow style={{ marginBottom: 12 }}>Long-form draft</Eyebrow>
              <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {(piece.substack_draft || '').split(/\n{2,}/).map((para, i) => (
                  <p key={i} style={{ ...typeRoles.ui, fontSize: 15, lineHeight: 1.7, color: t.textSecondary, marginBottom: 12, whiteSpace: 'pre-wrap' }}>{para}</p>
                ))}
              </div>
            </Card>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <Eyebrow>Short-form script</Eyebrow>
                {script && <GhostButton size="sm" onClick={() => copy(script)}>{copied ? 'Copied' : 'Copy'}</GhostButton>}
              </div>
              {!script ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 0' }}>
                  <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary, textAlign: 'center', maxWidth: '36ch' }}>A script cut from the draft, in your voice, shaped for the short form.</p>
                  <QuietButton onClick={handleGenerateScript} loading={isGenerating} loadingLabel="Generating…">Generate the script</QuietButton>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <TextArea voice value={script} onChange={setScript} ariaLabel="Short-form script" minRows={10} maxHeight={900} style={{ fontSize: 15, lineHeight: 1.7 }} />
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <GhostButton size="sm" onClick={handleGenerateScript} loading={isGenerating} loadingLabel="Regenerating…">Regenerate</GhostButton>
                    <QuietButton size="sm" onClick={() => saveScript()} loading={isSaving} loadingLabel="Saving…">{saved ? 'Saved ✓' : 'Save script'}</QuietButton>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </Container>
    </PageShell>
  )
}

export default function TranslatePage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: shell.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: shell.muted }}>Loading…</p>
        </div>
      }
    >
      <TranslateContent />
    </Suspense>
  )
}
