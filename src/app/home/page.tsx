'use client'

import { useState, useEffect, Suspense } from 'react'

interface ActivePiece {
  id: string
  title: string
  stage: string
  arc: string
}

interface RecentCapture {
  id: string
  unpacked: string
  arc: string
}

function HomeContent() {
  const [activePieces, setActivePieces] = useState<ActivePiece[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [greeting, setGreeting] = useState('')

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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(ellipse at top, #161412 0%, #0f0e0d 70%)',
        padding: '24px',
        maxWidth: '1200px',
        margin: '0 auto',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: '48px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p
            style={{
              color: '#4a4846',
              fontSize: '11px',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: '12px',
              margin: 0,
            }}
          >
            Companheiro
          </p>
          <h1
            style={{
              color: '#e8e6e0',
              fontSize: '28px',
              fontWeight: 300,
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            {greeting}
          </h1>
        </div>
        <a
          href="/portrait"
          style={{
            color: '#6a6866',
            fontSize: '12px',
            textDecoration: 'underline',
            textUnderlineOffset: '4px',
            marginTop: '4px',
          }}
        >
          My portrait
        </a>
      </div>

      {/* Grid: Mobile stacked, Desktop 3-col with left 2/3, right 1/3 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: In Progress section */}
        <div className="md:col-span-2">
          <div
            style={{
              backgroundColor: '#141312',
              border: '1px solid #1f1d1b',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <p
              style={{
                color: '#4a4846',
                fontSize: '11px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '16px',
                margin: 0,
              }}
            >
              In progress
            </p>

            {isLoading ? (
              <p style={{ color: '#3d3c39', fontSize: '12px' }}>Loading...</p>
            ) : activePieces.length === 0 ? (
              <p style={{ color: '#6a6866', fontSize: '13px', lineHeight: '1.6' }}>
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
                      borderBottom: index < activePieces.length - 1 ? '1px solid #1f1d1b' : 'none',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLAnchorElement
                      el.style.paddingLeft = '8px'
                      el.style.color = '#e8e6e0'
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
                          color: '#e8e6e0',
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
                      style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        fontSize: '11px',
                        color: '#8c8a87',
                        flexShrink: 0,
                      }}
                    >
                      <span>{piece.arc}</span>
                      <span style={{ color: '#3d3c39' }}>•</span>
                      <span>{piece.stage}</span>
                    </div>
                  </a>
                ))}
              </div>
            )}

            <div
              style={{
                paddingTop: activePieces.length > 0 ? '16px' : 0,
                borderTop: activePieces.length > 0 ? '1px solid #1f1d1b' : 'none',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '16px',
              }}
            >
              <a
                href="/idea-lab"
                style={{
                  color: '#6a6866',
                  fontSize: '12px',
                  textDecoration: 'underline',
                  textUnderlineOffset: '4px',
                  cursor: 'pointer',
                  transition: 'color 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.color = '#e8e6e0'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.color = '#6a6866'
                }}
              >
                New idea
              </a>
              <a
                href="/project-board"
                style={{
                  color: '#6a6866',
                  fontSize: '12px',
                  textDecoration: 'underline',
                  textUnderlineOffset: '4px',
                  cursor: 'pointer',
                  transition: 'color 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.color = '#e8e6e0'
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.color = '#6a6866'
                }}
              >
                View full board →
              </a>
            </div>
          </div>
        </div>

        {/* Right column: Capture widget */}
        <div>
          <div
            style={{
              backgroundColor: '#141312',
              border: '1px solid #1f1d1b',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
            }}
          >
            <p
              style={{
                color: '#4a4846',
                fontSize: '11px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                marginBottom: '16px',
                margin: 0,
              }}
            >
              Capture what&apos;s alive
            </p>

            {/* Quick capture form */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
              <input
                type="url"
                value={captureUrl}
                onChange={(e) => setCaptureUrl(e.target.value)}
                placeholder="Paste a link that inspired you..."
                style={{
                  width: '100%',
                  backgroundColor: '#1c1c1a',
                  border: '1px solid #2a2825',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontSize: '13px',
                  color: '#e8e6e0',
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
                  backgroundColor: '#1c1c1a',
                  border: '1px solid #2a2825',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  fontSize: '13px',
                  color: '#e8e6e0',
                  outline: 'none',
                }}
              />
              {captureError && (
                <p style={{ color: '#f87171', fontSize: '11px', margin: 0 }}>{captureError}</p>
              )}
              <button
                onClick={handleQuickCapture}
                disabled={isCapturing || (!captureUrl.trim() && !captureNote.trim())}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: justCaptured ? '#10B981' : '#e8e6e0',
                  color: justCaptured ? '#0f0e0d' : '#111110',
                  fontSize: '12px',
                  fontWeight: 500,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isCapturing ? 'not-allowed' : 'pointer',
                  opacity: isCapturing || (!captureUrl.trim() && !captureNote.trim() && !justCaptured) ? 0.4 : 1,
                  transition: 'all 0.2s ease',
                }}
              >
                {isCapturing ? 'Capturing...' : justCaptured ? 'Captured ✓' : 'Capture'}
              </button>
            </div>

            {/* Recent captures */}
            <div
              style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: '1px solid #1f1d1b',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                minHeight: 0,
              }}
            >
              {isLoadingCaptures ? (
                <p style={{ color: '#3d3c39', fontSize: '12px' }}>Loading...</p>
              ) : recentCaptures.length === 0 ? (
                <p style={{ color: '#6a6866', fontSize: '13px', lineHeight: '1.6' }}>
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
                        padding: '10px 0',
                        textDecoration: 'none',
                        borderBottom: index < recentCaptures.length - 1 ? '1px solid #1f1d1b' : 'none',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.paddingLeft = '4px'
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLAnchorElement).style.paddingLeft = '0'
                      }}
                    >
                      <p
                        style={{
                          color: '#d4d2cd',
                          fontSize: '12px',
                          margin: 0,
                          lineHeight: '1.5',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {capture.unpacked}
                      </p>
                      <span style={{ color: '#6a6866', fontSize: '11px' }}>{capture.arc}</span>
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
                <a
                  href="/collector"
                  style={{
                    color: '#6a6866',
                    fontSize: '12px',
                    textDecoration: 'underline',
                    textUnderlineOffset: '4px',
                    cursor: 'pointer',
                    transition: 'color 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.color = '#e8e6e0'
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLAnchorElement).style.color = '#6a6866'
                  }}
                >
                  View all captures →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating check-in mic button */}
      <a
        href="/check-in"
        aria-label="Start check-in"
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
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          transition: 'all 0.2s ease',
          zIndex: 50,
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLAnchorElement
          el.style.backgroundColor = '#d4d2cd'
          el.style.transform = 'scale(1.05)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLAnchorElement
          el.style.backgroundColor = '#e8e6e0'
          el.style.transform = 'scale(1)'
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111110" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      </a>
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
            background: 'radial-gradient(ellipse at top, #161412 0%, #0f0e0d 70%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <p style={{ color: '#4a4846' }}>Loading...</p>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  )
}
