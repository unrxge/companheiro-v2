'use client'

import { useState, useEffect, Suspense } from 'react'

interface ActivePiece {
  id: string
  title: string
  stage: string
  arc: string
}

function HomeContent() {
  const [activePieces, setActivePieces] = useState<ActivePiece[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [greeting, setGreeting] = useState('')

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
      <div style={{ marginBottom: '48px' }}>
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
              }}
            >
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

        {/* Right column: Action cards */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {/* Check-in card */}
          <a
            href="/check-in"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '32px 24px',
              backgroundColor: '#1a1917',
              border: '1px solid #2a2825',
              borderRadius: '12px',
              cursor: 'pointer',
              textDecoration: 'none',
              flex: 1,
              minHeight: '160px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.borderColor = '#4a4846'
              el.style.backgroundColor = '#1f1d1b'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.borderColor = '#2a2825'
              el.style.backgroundColor = '#1a1917'
            }}
          >
            {/* Sun SVG icon */}
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a8a6a0" strokeWidth="1.5">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#e8e6e0', fontSize: '14px', margin: 0, fontWeight: 500 }}>Check-in</p>
              <p style={{ color: '#6a6866', fontSize: '12px', margin: '4px 0 0 0', fontWeight: 400 }}>
                How are you today
              </p>
            </div>
          </a>

          {/* Collector card */}
          <a
            href="/collector"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              padding: '32px 24px',
              backgroundColor: '#1a1917',
              border: '1px solid #2a2825',
              borderRadius: '12px',
              cursor: 'pointer',
              textDecoration: 'none',
              flex: 1,
              minHeight: '160px',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.borderColor = '#4a4846'
              el.style.backgroundColor = '#1f1d1b'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLAnchorElement
              el.style.borderColor = '#2a2825'
              el.style.backgroundColor = '#1a1917'
            }}
          >
            {/* Pencil/Capture SVG icon */}
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#a8a6a0" strokeWidth="1.5">
              <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M3 7h18M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <div style={{ textAlign: 'center' }}>
              <p style={{ color: '#e8e6e0', fontSize: '14px', margin: 0, fontWeight: 500 }}>Collector</p>
              <p style={{ color: '#6a6866', fontSize: '12px', margin: '4px 0 0 0', fontWeight: 400 }}>
                Capture what&apos;s alive
              </p>
            </div>
          </a>
        </div>
      </div>
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
