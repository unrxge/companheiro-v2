'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
import { useCardTheme } from '@/hooks/useCardTheme'
import { cardPalette, shellBackground } from '@/lib/card-theme'

interface PortraitEntry {
  id: string
  kind: 'processing_pattern' | 'recurring_theme' | 'creative_pattern' | 'guidance_note'
  statement: string
  reinforcement_count: number
  last_reinforced_at: string
}

const KIND_LABELS: Record<PortraitEntry['kind'], string> = {
  processing_pattern: 'How you process things',
  recurring_theme: 'What keeps recurring',
  creative_pattern: 'How you develop ideas',
  guidance_note: 'What kind of guidance works',
}

function IconButton({
  href,
  ariaLabel,
  children,
}: {
  href: string
  ariaLabel: string
  children: React.ReactNode
}) {
  return (
    <motion.a
      href={href}
      aria-label={ariaLabel}
      title={ariaLabel}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.93 }}
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        border: '1px solid rgba(232, 230, 224, 0.14)',
        backgroundColor: 'rgba(232, 230, 224, 0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {children}
    </motion.a>
  )
}

function ThemeToggle({ theme, onToggle }: { theme: 'light' | 'dark'; onToggle: () => void }) {
  return (
    <motion.button
      onClick={onToggle}
      aria-label={theme === 'light' ? 'Switch to dark cards' : 'Switch to light cards'}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.93 }}
      style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        border: '1px solid rgba(232, 230, 224, 0.14)',
        backgroundColor: 'rgba(232, 230, 224, 0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {theme === 'light' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8e6e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e8e6e0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </motion.button>
  )
}

export default function PortraitPage() {
  const { theme, toggle } = useCardTheme('light')
  const c = cardPalette[theme]

  const [entries, setEntries] = useState<PortraitEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [retiringId, setRetiringId] = useState<string | null>(null)

  useEffect(() => {
    fetchEntries()
  }, [])

  const fetchEntries = async () => {
    try {
      const res = await fetch('/api/portrait/list')
      const data = await res.json()
      setEntries(data.entries || [])
    } catch (err) {
      console.error('Failed to fetch portrait:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRetire = async (id: string) => {
    setRetiringId(id)
    try {
      const res = await fetch('/api/portrait/retire', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      if (res.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id))
      }
    } catch (err) {
      console.error('Failed to retire entry:', err)
    } finally {
      setRetiringId(null)
    }
  }

  const grouped = (Object.keys(KIND_LABELS) as PortraitEntry['kind'][])
    .map((kind) => ({ kind, items: entries.filter((e) => e.kind === kind) }))
    .filter((g) => g.items.length > 0)

  const eyebrowStyle: React.CSSProperties = {
    color: c.textSecondary,
    fontSize: '11px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontFamily: 'var(--font-geist-sans)',
    fontWeight: 600,
    margin: 0,
  }

  return (
    <div
      style={{
        position: 'relative',
        minHeight: '100vh',
        background: shellBackground,
      }}
    >
      <div style={{ position: 'relative', padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
        {/* Header: plain text on the shell, no card chrome of its own */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            marginBottom: '32px',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-start',
            rowGap: '12px',
          }}
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
              My portrait
            </h1>
          </div>
          <div style={{ marginTop: '6px', marginLeft: 'auto', flexShrink: 0 }}>
            <ThemeToggle theme={theme} onToggle={toggle} />
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
          <p style={{ color: c.textSecondary, fontSize: '13px', lineHeight: '1.6', margin: '0 0 24px' }}>
            What the system has come to understand about you — only things you&apos;ve confirmed.
            Nothing here shapes tone, only how it approaches you. Retire anything that no longer fits.
          </p>

          {isLoading ? (
            <p style={{ color: c.textMuted, fontSize: '12px' }}>Loading...</p>
          ) : entries.length === 0 ? (
            <p style={{ color: c.textSecondary, fontSize: '13px', lineHeight: '1.6' }}>
              Nothing confirmed yet. As you check in, develop ideas, and zoom out over time, the
              system may occasionally ask if a pattern it&apos;s noticed feels true — what you confirm
              shows up here.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {grouped.map(({ kind, items }, groupIndex) => (
                <motion.div
                  key={kind}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 + groupIndex * 0.05, ease: 'easeOut' }}
                  style={{
                    backgroundColor: c.cardBg,
                    boxShadow: c.shadow,
                    borderRadius: '22px',
                    padding: '20px',
                  }}
                >
                  <p style={{ ...eyebrowStyle, marginBottom: '4px' }}>{KIND_LABELS[kind]}</p>
                  <div>
                    {items.map((entry, index) => (
                      <div
                        key={entry.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: '16px',
                          padding: '16px 0',
                          borderBottom: index < items.length - 1 ? `1px solid ${c.divider}` : 'none',
                        }}
                      >
                        <p style={{ color: c.textPrimary, fontSize: '14px', lineHeight: '1.6', margin: 0, flex: 1 }}>
                          {entry.statement}
                        </p>
                        <button
                          onClick={() => handleRetire(entry.id)}
                          disabled={retiringId === entry.id}
                          style={{
                            fontSize: '11px',
                            color: c.textMuted,
                            background: 'none',
                            border: 'none',
                            cursor: retiringId === entry.id ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                            opacity: retiringId === entry.id ? 0.5 : 1,
                            padding: 0,
                            transition: 'color 0.2s ease',
                          }}
                          onMouseEnter={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = '#f87171'
                          }}
                          onMouseLeave={(e) => {
                            (e.currentTarget as HTMLButtonElement).style.color = c.textMuted
                          }}
                        >
                          {retiringId === entry.id ? 'Retiring...' : 'Forget this'}
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
