'use client'

import { useState, useEffect, Suspense } from 'react'
import { motion } from 'motion/react'
import { useCardTheme } from '@/hooks/useCardTheme'
import { cardPalette, shellBackground, accentColor } from '@/lib/card-theme'
import { UnderlineLink } from '@/components/ui/underline-link'
import { IconButton } from '@/components/ui/icon-button'
import { ThemeToggleButton } from '@/components/ui/theme-toggle-button'

interface ActivePiece {
  id: string
  title: string
  stage: string
  arc: string
}

interface RecentCapture {
  id: string
  raw_input: string
  arc: string
}

function HomeContent() {
  const { theme, toggle } = useCardTheme('light')
  const c = cardPalette[theme]

  const [activePieces, setActivePieces] = useState<ActivePiece[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [greeting, setGreeting] = useState('')
  const [pieceCounts, setPieceCounts] = useState<{ active: number; queue: number; completed: number } | null>(null)

  const [recentCaptures, setRecentCaptures] = useState<RecentCapture[]>([])
  const [isLoadingCaptures, setIsLoadingCaptures] = useState(true)
  const [captureUrl, setCaptureUrl] = useState('')
  const [captureNote, setCaptureNote] = useState('')
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [justCaptured, setJustCaptured] = useState(false)

  useEffect(() => {
    const hour = new Date().getHours()
    const greetingText = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
    setGreeting(greetingText)
  }, [])

  useEffect(() => {
    const fetchActivePieces = async () => {
      try {
        const res = await fetch('/api/project-board/pieces')
        const data = await res.json()
        setActivePieces((data.active || []).slice(0, 5))
        setPieceCounts({
          active: (data.active || []).length,
          queue: (data.queue || []).length,
          completed: (data.archived || []).length,
        })
      } catch (err) {
        console.error('Failed to fetch active pieces:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchActivePieces()
  }, [])

  const fetchRecentCaptures = async () => {
    try {
      const res = await fetch('/api/idea-lab/captures')
      const data = await res.json()
      setRecentCaptures((data.captures || []).slice(0, 3))
    } catch (err) {
      console.error('Failed to fetch recent captures:', err)
    } finally {
      setIsLoadingCaptures(false)
    }
  }

  useEffect(() => {
    fetchRecentCaptures()
  }, [])

  const handleQuickCapture = async () => {
    const note = captureNote.trim()
    const url = captureUrl.trim()
    const rawInput = note || url

    if (!rawInput) {
      setCaptureError('Paste a link or add a note')
      return
    }

    setIsCapturing(true)
    setCaptureError(null)

    try {
      const res = await fetch('/api/collector/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          raw_input: rawInput,
          url: url || undefined,
        }),
      })

      const data = await res.json()

      if (!data.success) {
        setCaptureError(data.error || 'Failed to capture')
        return
      }

      setCaptureUrl('')
      setCaptureNote('')
      setJustCaptured(true)
      setTimeout(() => setJustCaptured(false), 2000)
      fetchRecentCaptures()
    } catch (err) {
      console.error('Quick capture error:', err)
      setCaptureError('Failed to capture. Please try again.')
    } finally {
      setIsCapturing(false)
    }
  }

  const greetingWords = greeting.split(' ')

  const eyebrowStyle: React.CSSProperties = {
    color: c.textSecondary,
    fontSize: '11px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-geist-sans)',
    fontWeight: 600,
    margin: 0,
  }

  const total = (pieceCounts?.active ?? 0) + (pieceCounts?.queue ?? 0) + (pieceCounts?.completed ?? 0)
  const pipelineStats = [
    { label: 'Queue', value: pieceCounts?.queue ?? 0, color: '#F59E0B' },
    { label: 'Active', value: pieceCounts?.active ?? 0, color: '#10B981' },
    { label: 'Completed', value: pieceCounts?.completed ?? 0, color: '#8B5CF6' },
  ]

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: shellBackground,
      }}
    >
      <div style={{ position: 'relative', padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
        {/* Header: plain text on the shell, no card chrome of its own */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            marginBottom: '32px',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '12px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                color: '#6e6c67',
                fontSize: '11px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontFamily: 'var(--font-geist-sans)',
                fontWeight: 600,
                margin: '0 0 12px',
              }}
            >
              Companheiro
            </p>
            <h1
              style={{
                color: '#e8e6e0',
                fontSize: 'clamp(22px, 6vw, 34px)',
                fontFamily: 'var(--font-geist-sans)',
                fontWeight: 700,
                margin: 0,
                letterSpacing: '-0.02em',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              {greetingWords.map((word, i) => (
                <motion.span
                  key={i}
                  style={{ display: 'inline-block', marginRight: '0.28em' }}
                  initial={{ y: '110%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.7, delay: 0.15 + i * 0.08, ease: [0.33, 1, 0.68, 1] }}
                >
                  {word}
                </motion.span>
              ))}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, paddingBottom: '2px' }}>
            <IconButton href="/portrait" ariaLabel="My portrait">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8e6e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
              </svg>
            </IconButton>
            <ThemeToggleButton theme={theme} onToggle={toggle} />
          </div>
        </motion.div>

        {/* Container: the panel the header is enveloped by, holding all cards */}
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
      {/* Grid: Mobile stacked, Desktop 3-col with left 2/3, right 1/3 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: In Progress section */}
        <motion.div
          className="md:col-span-2"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
        >
          <div
            style={{
              backgroundColor: c.cardBg,
              boxShadow: c.shadow,
              borderRadius: '22px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <p style={{ ...eyebrowStyle, marginBottom: '16px' }}>In progress</p>

            {isLoading ? (
              <p style={{ color: c.textMuted, fontSize: '12px' }}>Loading...</p>
            ) : activePieces.length === 0 ? (
              <p style={{ color: c.textSecondary, fontSize: '13px', lineHeight: '1.6' }}>
                Nothing in motion yet. Start from the project board.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                {activePieces.map((piece, index) => (
                  <a
                    key={piece.id}
                    href={`/project-board?piece_id=${piece.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '16px 0',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      borderBottom: index < activePieces.length - 1 ? `1px solid ${c.divider}` : 'none',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLAnchorElement
                      el.style.paddingLeft = '8px'
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLAnchorElement
                      el.style.paddingLeft = '0'
                    }}
                  >
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#10B981',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p
                        style={{
                          color: c.textPrimary,
                          fontSize: '13px',
                          margin: 0,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {piece.title}
                      </p>
                    </div>
                    <div
                      className="hidden md:flex"
                      style={{
                        gap: '8px',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: c.textSecondary,
                        flexShrink: 0,
                      }}
                    >
                      <span>{piece.arc}</span>
                      <span style={{ color: c.textMuted }}>•</span>
                      <span>{piece.stage}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}

            <div
              style={{
                paddingTop: activePieces.length > 0 ? '16px' : 0,
                borderTop: activePieces.length > 0 ? `1px solid ${c.divider}` : 'none',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '16px',
              }}
            >
              <UnderlineLink href="/idea-lab" color={c.textSecondary}>New idea</UnderlineLink>
              <UnderlineLink href="/project-board" color={c.textSecondary}>View full board →</UnderlineLink>
            </div>
          </div>

          {/* Ideas: proportional bar showing how the total splits across Active/Queue/Completed */}
          <div style={{ marginTop: '24px' }}>
            <p style={{ ...eyebrowStyle, marginBottom: '14px' }}>Ideas</p>
            <div
              style={{
                display: 'flex',
                width: '100%',
                height: '10px',
                borderRadius: '999px',
                overflow: 'hidden',
                backgroundColor: c.divider,
              }}
            >
              {total > 0 &&
                pipelineStats
                  .filter((stat) => stat.value > 0)
                  .map((stat) => (
                    <div
                      key={stat.label}
                      style={{
                        flexGrow: stat.value,
                        flexBasis: 0,
                        backgroundColor: stat.color,
                        transition: 'flex-grow 0.4s ease',
                      }}
                    />
                  ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', marginTop: '16px' }}>
              {pipelineStats.map((stat) => (
                <div key={stat.label} style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      backgroundColor: stat.color,
                      display: 'inline-block',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-geist-sans)',
                      fontWeight: 700,
                      fontSize: '18px',
                      color: c.textPrimary,
                    }}
                  >
                    {stat.value}
                  </span>
                  <span style={{ fontSize: '12px', color: c.textMuted }}>{stat.label}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Right column: Capture widget */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
        >
          <div
            style={{
              backgroundColor: c.cardBg,
              boxShadow: c.shadow,
              borderRadius: '22px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }}
          >
            <p style={eyebrowStyle}>Capture what&apos;s alive</p>

            {/* Quick capture form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
              <input
                type="url"
                value={captureUrl}
                onChange={(e) => setCaptureUrl(e.target.value)}
                placeholder="Paste a link that inspired you..."
                style={{
                  width: '100%',
                  backgroundColor: c.inputBg,
                  border: `1px solid ${c.inputBorder}`,
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '13px',
                  color: c.textPrimary,
                  outline: 'none',
                }}
              />
              <input
                type="text"
                value={captureNote}
                onChange={(e) => setCaptureNote(e.target.value)}
                placeholder="What caught your eye? (optional)"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isCapturing) handleQuickCapture()
                }}
                style={{
                  width: '100%',
                  backgroundColor: c.inputBg,
                  border: `1px solid ${c.inputBorder}`,
                  borderRadius: '10px',
                  padding: '10px 12px',
                  fontSize: '13px',
                  color: c.textPrimary,
                  outline: 'none',
                }}
              />
              {captureError && (
                <p style={{ color: '#f87171', fontSize: '11px', margin: 0 }}>{captureError}</p>
              )}
              <motion.button
                onClick={handleQuickCapture}
                disabled={isCapturing || (!captureUrl.trim() && !captureNote.trim())}
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: justCaptured ? '#10B981' : theme === 'light' ? '#171613' : '#e8e6e0',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: isCapturing ? 'not-allowed' : 'pointer',
                  opacity: isCapturing || (!captureUrl.trim() && !captureNote.trim() && !justCaptured) ? 0.4 : 1,
                  transition: 'opacity 0.2s ease, background-color 0.2s ease',
                  color: justCaptured ? '#0f0e0d' : theme === 'light' ? '#f7f6f3' : '#111110',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {isCapturing ? 'Capturing...' : justCaptured ? 'Captured ✓' : 'Capture'}
              </motion.button>
            </div>

            {/* Recent captures */}
            <div
              style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: `1px solid ${c.divider}`,
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
              }}
            >
              {isLoadingCaptures ? (
                <p style={{ color: c.textMuted, fontSize: '12px' }}>Loading...</p>
              ) : recentCaptures.length === 0 ? (
                <p style={{ color: c.textSecondary, fontSize: '13px', lineHeight: '1.6' }}>
                  Nothing captured yet.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflowY: 'auto', flex: 1 }}>
                  {recentCaptures.map((capture, index) => (
                    <a
                      key={capture.id}
                      href="/collector"
                      style={{
                        display: 'block',
                        padding: '10px 0 10px 10px',
                        marginLeft: '-10px',
                        borderLeft: '2px solid transparent',
                        textDecoration: 'none',
                        borderBottom: index < recentCaptures.length - 1 ? `1px solid ${c.divider}` : 'none',
                        transition: 'border-color 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.borderLeftColor = accentColor
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.borderLeftColor = 'transparent'
                      }}
                    >
                      <p
                        style={{
                          color: c.textPrimary,
                          fontSize: '12px',
                          margin: 0,
                          lineHeight: '1.5',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {capture.raw_input}
                      </p>
                      <span style={{ color: c.textSecondary, fontSize: '11px' }}>{capture.arc}</span>
                    </a>
                  ))}
                </div>
              )}

              <div
                style={{
                  paddingTop: '12px',
                  marginTop: 'auto',
                  display: 'flex',
                  justifyContent: 'flex-end',
                }}
              >
                <UnderlineLink href="/collector" color={c.textSecondary}>View all captures →</UnderlineLink>
              </div>
            </div>
          </div>
        </motion.div>
        </div>
        </motion.div>
      </div>

      {/* Floating check-in mic button */}
      <motion.a
        href="/check-in"
        aria-label="Start check-in"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.4, ease: 'easeOut' }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '60px',
          height: '60px',
          borderRadius: '50%',
          backgroundColor: '#e8e6e0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(232, 230, 224, 0.08)',
          zIndex: 50,
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLAnchorElement
          el.style.backgroundColor = '#d4d2cd'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLAnchorElement
          el.style.backgroundColor = '#e8e6e0'
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111110" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </motion.a>
    </div>
  )
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: shellBackground,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p style={{ color: '#6a6866' }}>Loading...</p>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  )
}
