'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { useCardTheme } from '@/hooks/useCardTheme'
import { cardPalette, shellBackground, accentColor } from '@/lib/card-theme'
import { IconButton } from '@/components/ui/icon-button'
import { ThemeToggleButton } from '@/components/ui/theme-toggle-button'
import { ModalDialog } from '@/components/ui/modal-dialog'

type Arc = 'Breakaway' | 'Beginning' | 'Expansion' | 'Integration'
type ThematicTerritory =
  | 'creativity_devotion_curiosity'
  | 'healthy_masculinity_emotional_regulation'
  | 'inner_child_tending_expression'
  | 'slow_living_life_in_service'

interface CaptureResult {
  id: string
  raw_input: string
  unpacked: string
  arc: Arc
  thematic_territory: ThematicTerritory
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

const TERRITORY_LABELS: Record<ThematicTerritory, string> = {
  creativity_devotion_curiosity: 'Creativity, devotion & curiosity',
  healthy_masculinity_emotional_regulation: 'Healthy masculinity & emotional regulation',
  inner_child_tending_expression: 'Inner child tending & expression',
  slow_living_life_in_service: 'Slow living & life in service',
}

function territoryLabel(territory: string): string {
  return TERRITORY_LABELS[territory as ThematicTerritory] || territory
}

export default function CollectorPage() {
  const { theme, toggle } = useCardTheme('light')
  const c = cardPalette[theme]

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
        body: JSON.stringify({
          raw_input: input.trim(),
          url: url.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        setError(data.error || 'Failed to capture')
        return
      }

      setCaptureResult(data.capture)
      setShowSuccess(true)
    } catch (err) {
      console.error('Capture error:', err)
      setError('Failed to capture. Please try again.')
    } finally {
      setIsCapturing(false)
    }
  }

  const eyebrowStyle: React.CSSProperties = {
    color: c.textSecondary,
    fontSize: '11px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-geist-sans)',
    fontWeight: 600,
    margin: 0,
  }

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: c.inputBg,
    border: `1px solid ${c.inputBorder}`,
    borderRadius: '10px',
    padding: '12px 14px',
    fontSize: '14px',
    color: c.textPrimary,
    outline: 'none',
  }

  return (
    <div style={{ position: 'relative', minHeight: '100vh', background: shellBackground }}>
      <div style={{ position: 'relative', padding: '24px', maxWidth: '640px', margin: '0 auto' }}>
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{ marginBottom: '32px', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', rowGap: '12px' }}
        >
          <div style={{ flexShrink: 0 }}>
            <IconButton href="/home" ariaLabel="Back to home">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8e6e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </IconButton>
            <h1
              style={{
                color: '#e8e6e0',
                fontSize: 'clamp(24px, 8vw, 34px)',
                fontFamily: 'var(--font-geist-sans)',
                fontWeight: 700,
                margin: '16px 0 0',
                letterSpacing: '-0.02em',
              }}
            >
              Capture
            </h1>
          </div>
          <div style={{ marginTop: '6px', marginLeft: 'auto', flexShrink: 0 }}>
            <ThemeToggleButton theme={theme} onToggle={toggle} />
          </div>
        </motion.div>

        {/* Container */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
          style={{
            backgroundColor: c.containerBg,
            boxShadow: c.containerShadow,
            borderRadius: '28px',
            padding: '24px',
            transition: 'background-color 0.3s ease',
          }}
        >
          {showSuccess && captureResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={eyebrowStyle}>Captured</p>

              <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '16px', padding: '20px' }}>
                <p style={{ fontSize: '15px', lineHeight: 1.6, color: c.textPrimary, margin: 0 }}>
                  {captureResult.unpacked}
                </p>

                {captureResult.link_context && (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${c.divider}` }}>
                    <p style={{ ...eyebrowStyle, marginBottom: '8px' }}>Analysis</p>
                    <p style={{ fontSize: '13px', lineHeight: 1.6, color: c.textSecondary, margin: 0, whiteSpace: 'pre-line' }}>
                      {captureResult.link_context}
                    </p>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '16px' }}>
                  <div style={{ backgroundColor: c.inputBg, borderRadius: '10px', padding: '10px 12px' }}>
                    <p style={{ fontSize: '10px', color: c.textMuted, margin: '0 0 2px' }}>Arc</p>
                    <p style={{ fontSize: '13px', fontWeight: 600, color: c.textPrimary, margin: 0 }}>{captureResult.arc}</p>
                  </div>
                  <div style={{ backgroundColor: c.inputBg, borderRadius: '10px', padding: '10px 12px' }}>
                    <p style={{ fontSize: '10px', color: c.textMuted, margin: '0 0 2px' }}>Territory</p>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: c.textPrimary, margin: 0 }}>
                      {territoryLabel(captureResult.thematic_territory)}
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleCaptureAnother}
                className="transition-opacity"
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: accentColor,
                  color: '#ffffff',
                  fontFamily: 'var(--font-geist-sans)',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Capture another
              </button>
            </div>
          ) : (
            <>
              {/* Capture form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {error && (
                  <p style={{ fontSize: '12px', color: '#f87171', margin: 0 }}>{error}</p>
                )}

                <textarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value)
                    e.target.style.height = 'auto'
                    e.target.style.height = e.target.scrollHeight + 'px'
                  }}
                  placeholder="What caught your eye?"
                  rows={2}
                  style={{ ...fieldStyle, resize: 'none', overflowY: 'auto', maxHeight: '220px', lineHeight: 1.6 }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && input.trim() && !isCapturing) {
                      e.preventDefault()
                      handleCapture()
                    }
                  }}
                />
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste a link"
                  style={fieldStyle}
                />
                <motion.button
                  onClick={handleCapture}
                  disabled={isCapturing || !input.trim()}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: accentColor,
                    color: '#ffffff',
                    fontFamily: 'var(--font-geist-sans)',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: isCapturing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isCapturing ? 'Capturing...' : 'Capture'}
                </motion.button>
              </div>

              {/* Previously captured */}
              <div style={{ marginTop: '24px', paddingTop: '24px', borderTop: `1px solid ${c.divider}` }}>
                <p style={{ ...eyebrowStyle, marginBottom: '14px' }}>Previously captured</p>

                {isLoadingPrevious ? (
                  <p style={{ fontSize: '12px', color: c.textMuted, margin: 0 }}>Loading...</p>
                ) : previousCaptures.length === 0 ? (
                  <p style={{ fontSize: '13px', color: c.textSecondary, lineHeight: 1.6, margin: 0 }}>
                    Nothing captured yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {previousCaptures.map((capture, index) => (
                      <button
                        key={capture.id}
                        onClick={() => setSelectedCapture(capture)}
                        style={{
                          textAlign: 'left',
                          background: 'none',
                          padding: '12px 0 12px 10px',
                          marginLeft: '-10px',
                          borderLeft: '2px solid transparent',
                          borderBottom: index < previousCaptures.length - 1 ? `1px solid ${c.divider}` : 'none',
                          cursor: 'pointer',
                          transition: 'border-color 0.2s ease',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderLeftColor = accentColor
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLButtonElement).style.borderLeftColor = 'transparent'
                        }}
                      >
                        <p
                          style={{
                            fontSize: '13px',
                            lineHeight: 1.5,
                            color: c.textPrimary,
                            margin: 0,
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {capture.raw_input}
                        </p>
                        <span style={{ fontSize: '11px', color: c.textMuted }}>{capture.arc}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Capture Detail Modal */}
      {selectedCapture && (
        <ModalDialog
          theme={theme}
          onClose={() => setSelectedCapture(null)}
          title="Capture"
          subtitle={
            <>
              <span>{selectedCapture.arc}</span>
              <span>•</span>
              <span>{territoryLabel(selectedCapture.thematic_territory)}</span>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {selectedCapture.raw_input && (
              <div>
                <p style={eyebrowStyle}>Raw input</p>
                <p style={{ color: c.textPrimary, fontSize: '14px', lineHeight: 1.6, margin: '6px 0 0' }}>
                  {selectedCapture.raw_input}
                </p>
              </div>
            )}

            {selectedCapture.url && (
              <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '14px', padding: '16px' }}>
                <p style={eyebrowStyle}>Source</p>
                <a
                  href={selectedCapture.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: '13px', color: accentColor, wordBreak: 'break-all', marginTop: '6px', display: 'inline-block' }}
                >
                  {selectedCapture.url}
                </a>
              </div>
            )}

            {selectedCapture.link_context && (
              <div style={{ backgroundColor: c.cardBg, boxShadow: c.shadow, borderRadius: '14px', padding: '16px' }}>
                <p style={eyebrowStyle}>Analysis</p>
                <p style={{ color: c.textSecondary, fontSize: '13px', lineHeight: 1.6, margin: '6px 0 0', whiteSpace: 'pre-line' }}>
                  {selectedCapture.link_context}
                </p>
              </div>
            )}

            <p style={{ fontSize: '11px', color: c.textMuted, margin: 0, paddingTop: '4px', borderTop: `1px solid ${c.divider}` }}>
              Captured on {new Date(selectedCapture.created_at).toLocaleDateString()}
            </p>
          </div>
        </ModalDialog>
      )}
    </div>
  )
}
