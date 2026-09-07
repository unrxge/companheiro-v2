'use client'

import { useState, useEffect } from 'react'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { PrimaryButton } from '@/components/ui/buttons'
import { TextField, TextArea } from '@/components/ui/field'
import { Pill } from '@/components/ui/pill'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { useTerritories } from '@/hooks/useTerritories'
import { arcHue, type as typeRoles, type Arc } from '@/lib/design-tokens'

interface CaptureResult {
  id: string
  raw_input: string
  unpacked: string
  arc: Arc
  thematic_territory: string
  link_context: string | null
}

interface PreviousCapture {
  id: string
  raw_input: string
  unpacked: string
  arc: string
  thematic_territory: string
  url: string | null
  link_context: string | null
  created_at: string
}

export default function CollectorPage() {
  const { t } = useTheme()
  const territories = useTerritories()

  const [input, setInput] = useState('')
  const [url, setUrl] = useState('')
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null)
  const [previousCaptures, setPreviousCaptures] = useState<PreviousCapture[]>([])
  const [isLoadingPrevious, setIsLoadingPrevious] = useState(true)
  const [selectedCapture, setSelectedCapture] = useState<PreviousCapture | null>(null)

  useEffect(() => {
    const fetchPreviousCaptures = async () => {
      try {
        const res = await fetch('/api/idea-lab/captures')
        const data = await res.json()
        setPreviousCaptures(data.captures || [])
      } catch (err) {
        console.error('Failed to fetch previous captures:', err)
      } finally {
        setIsLoadingPrevious(false)
      }
    }
    fetchPreviousCaptures()
  }, [])

  const handleCaptureAnother = () => {
    setShowSuccess(false)
    setCaptureResult(null)
    setInput('')
    setUrl('')
  }

  const handleCapture = async () => {
    if (!input.trim()) {
      setError('Please add some text to capture')
      return
    }
    setIsCapturing(true)
    setError(null)
    try {
      const res = await fetch('/api/collector/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_input: input.trim(), url: url.trim() || undefined }),
      })
      const data = await res.json()
      if (!data.success) {
        setError(data.error || 'Failed to capture')
        return
      }
      setCaptureResult(data.capture)
      setShowSuccess(true)
      setPreviousCaptures((prev) => [{ ...data.capture, url: url.trim() || null, created_at: new Date().toISOString() }, ...prev])
    } catch (err) {
      console.error('Capture error:', err)
      setError('Failed to capture. Please try again.')
    } finally {
      setIsCapturing(false)
    }
  }

  return (
    <PageShell mood="ember" intensity={0.8} maxWidth={720}>
      <PageHeader eyebrow="Companheiro · Collector" title="Capture" back="/idea-lab" />

      <Container>
        {showSuccess && captureResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Eyebrow>Captured</Eyebrow>
            <Card>
              <p style={{ ...typeRoles.quote, color: t.textPrimary }}>{captureResult.unpacked}</p>
              {captureResult.link_context && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${t.divider}` }}>
                  <Eyebrow style={{ marginBottom: 8 }}>Analysis</Eyebrow>
                  <p style={{ ...typeRoles.small, color: t.textSecondary, whiteSpace: 'pre-line' }}>{captureResult.link_context}</p>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <Pill hue={arcHue[captureResult.arc] ?? 'ember'} dot>{captureResult.arc}</Pill>
                <Pill hue={territories.hue(captureResult.thematic_territory)}>{territories.label(captureResult.thematic_territory)}</Pill>
              </div>
            </Card>
            <PrimaryButton onClick={handleCaptureAnother} full>Capture another</PrimaryButton>
          </div>
        ) : (
          <>
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {error && <p style={{ ...typeRoles.small, fontSize: 12, color: t.danger }}>{error}</p>}
                <TextArea
                  value={input}
                  onChange={setInput}
                  placeholder="What caught your eye?"
                  ariaLabel="Capture"
                  voice
                  maxHeight={220}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && input.trim() && !isCapturing) {
                      e.preventDefault()
                      handleCapture()
                    }
                  }}
                />
                <TextField type="url" value={url} onChange={setUrl} placeholder="Paste a link" ariaLabel="Link" />
                <PrimaryButton onClick={handleCapture} disabled={isCapturing || !input.trim()} loading={isCapturing} loadingLabel="Capturing…" full>
                  Capture
                </PrimaryButton>
              </div>
            </Card>

            <div style={{ marginTop: 24 }}>
              <Eyebrow style={{ marginBottom: 12 }}>Previously captured</Eyebrow>
              <Card padding="4px 20px">
                {isLoadingPrevious ? (
                  <p style={{ ...typeRoles.small, color: t.textMuted, padding: '12px 0' }}>Loading…</p>
                ) : previousCaptures.length === 0 ? (
                  <p style={{ ...typeRoles.small, color: t.textSecondary, padding: '12px 0' }}>Nothing captured yet.</p>
                ) : (
                  previousCaptures.map((capture, index) => (
                    <button
                      key={capture.id}
                      onClick={() => setSelectedCapture(capture)}
                      style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 0 12px 10px', marginLeft: -10, borderLeft: '2px solid transparent', borderBottom: index < previousCaptures.length - 1 ? `1px solid ${t.divider}` : 'none', cursor: 'pointer', transition: 'border-color 0.2s ease', font: 'inherit' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderLeftColor = t.ember }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderLeftColor = 'transparent' }}
                    >
                      <p style={{ ...typeRoles.small, color: t.textPrimary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{capture.raw_input}</p>
                      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                        {capture.arc && <Pill hue={arcHue[capture.arc as Arc] ?? 'ember'} dot>{capture.arc}</Pill>}
                        {capture.thematic_territory && <Pill hue={territories.hue(capture.thematic_territory)}>{territories.short(capture.thematic_territory)}</Pill>}
                      </div>
                    </button>
                  ))
                )}
              </Card>
            </div>
          </>
        )}
      </Container>

      {selectedCapture && (
        <ModalDialog
          onClose={() => setSelectedCapture(null)}
          title="Capture"
          subtitle={
            <>
              <span>{selectedCapture.arc}</span>
              <span>•</span>
              <span>{territories.label(selectedCapture.thematic_territory)}</span>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {selectedCapture.raw_input && (
              <Card padding={16}>
                <Eyebrow>Raw input</Eyebrow>
                <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary, marginTop: 6 }}>{selectedCapture.raw_input}</p>
              </Card>
            )}
            {selectedCapture.url && (
              <Card padding={16}>
                <Eyebrow>Source</Eyebrow>
                <a href={selectedCapture.url} target="_blank" rel="noopener noreferrer" style={{ ...typeRoles.small, color: t.ember, wordBreak: 'break-all', marginTop: 6, display: 'inline-block' }}>
                  {selectedCapture.url}
                </a>
              </Card>
            )}
            {(selectedCapture.link_context || selectedCapture.unpacked) && (
              <Card padding={16}>
                <Eyebrow>Analysis</Eyebrow>
                <p style={{ ...typeRoles.small, color: t.textSecondary, marginTop: 6, whiteSpace: 'pre-line' }}>{selectedCapture.link_context || selectedCapture.unpacked}</p>
              </Card>
            )}
            <p style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted }}>Captured on {new Date(selectedCapture.created_at).toLocaleDateString()}</p>
          </div>
        </ModalDialog>
      )}
    </PageShell>
  )
}
