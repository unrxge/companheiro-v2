'use client'

import { useCallback, useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { motion as m } from 'motion/react'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow, Divider } from '@/components/shell/page-shell'
import { QuietButton, GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { TextField } from '@/components/ui/field'
import { UnderlineLink } from '@/components/ui/underline-link'
import { SettingsButton } from '@/components/settings/settings-sheet'
import { ModalDialog } from '@/components/ui/modal-dialog'
import { ProportionBar, StageRibbon, WeatherStrip } from '@/components/widgets'
import { journeyStepFromStage, JOURNEY_LABELS, shell, type as typeRoles, type Mood } from '@/lib/design-tokens'
import { atmosphereFromCheckIns, weatherDays, type StoredCheckIn, type WritingActivityRow } from '@/lib/check-in-signals'

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

interface Letter {
  id: string | null
  week_start: string
  body: string
  created_at: string
  read_at: string | null
}

function HomeContent() {
  const { t } = useTheme()
  const router = useRouter()

  const [activePieces, setActivePieces] = useState<ActivePiece[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [greeting, setGreeting] = useState('')
  const [pieceCounts, setPieceCounts] = useState<{ active: number; queue: number; completed: number } | null>(null)

  const [checkIns, setCheckIns] = useState<StoredCheckIn[]>([])
  const [writingActivity, setWritingActivity] = useState<WritingActivityRow[]>([])
  const [recentCaptures, setRecentCaptures] = useState<RecentCapture[]>([])
  const [isLoadingCaptures, setIsLoadingCaptures] = useState(true)
  const [captureUrl, setCaptureUrl] = useState('')
  const [captureNote, setCaptureNote] = useState('')
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)
  const [justCaptured, setJustCaptured] = useState(false)

  const [letterState, setLetterState] = useState<{ optedIn: boolean; letter: Letter | null }>({ optedIn: false, letter: null })
  const [letterOpen, setLetterOpen] = useState(false)
  const [writingLetter, setWritingLetter] = useState(false)

  useEffect(() => {
    const hour = new Date().getHours()
    setGreeting(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')
  }, [])

  // First run: seed the territories before anything else.
  useEffect(() => {
    fetch('/api/onboarding')
      .then((r) => r.json())
      .then((d) => {
        if (d && d.onboarded === false) router.replace('/welcome')
      })
      .catch(() => {})
  }, [router])

  useEffect(() => {
    const load = async () => {
      try {
        const [piecesRes, historyRes, activityRes] = await Promise.all([fetch('/api/project-board/pieces'), fetch('/api/check-in/history'), fetch('/api/write/activity')])
        const data = await piecesRes.json()
        const history = await historyRes.json()
        const activity = await activityRes.json()
        setActivePieces((data.active || []).slice(0, 5))
        setPieceCounts({
          active: (data.active || []).length,
          queue: (data.queue || []).length + (data.draftCount ?? 0),
          completed: (data.archived || []).length,
        })
        setCheckIns(history.checkIns || [])
        setWritingActivity(activity.activity || [])
      } catch (err) {
        console.error('Failed to load home:', err)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [])

  const fetchRecentCaptures = useCallback(async () => {
    try {
      const res = await fetch('/api/idea-lab/captures')
      const data = await res.json()
      setRecentCaptures((data.captures || []).slice(0, 3))
    } catch (err) {
      console.error('Failed to fetch recent captures:', err)
    } finally {
      setIsLoadingCaptures(false)
    }
  }, [])

  useEffect(() => {
    fetchRecentCaptures()
  }, [fetchRecentCaptures])

  useEffect(() => {
    fetch(`/api/letter?tz_offset=${new Date().getTimezoneOffset()}`)
      .then((r) => r.json())
      .then((d) => setLetterState({ optedIn: !!d.optedIn, letter: d.letter ?? null }))
      .catch(() => {})
  }, [])

  const writeLetter = async () => {
    setWritingLetter(true)
    try {
      const res = await fetch(`/api/letter?tz_offset=${new Date().getTimezoneOffset()}&generate=1`)
      const d = await res.json()
      if (d.letter) {
        setLetterState({ optedIn: true, letter: d.letter })
        setLetterOpen(true)
      }
    } finally {
      setWritingLetter(false)
    }
  }

  const openLetter = () => {
    setLetterOpen(true)
    const l = letterState.letter
    if (l?.id && !l.read_at) {
      fetch('/api/letter', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: l.id }) }).catch(() => {})
      setLetterState((s) => (s.letter ? { ...s, letter: { ...s.letter, read_at: new Date().toISOString() } } : s))
    }
  }

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
        body: JSON.stringify({ raw_input: rawInput, url: url || undefined }),
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

  const { mood, intensity } = atmosphereFromCheckIns(checkIns)
  const days = weatherDays(checkIns, 30, writingActivity)
  const hasWeather = checkIns.length > 0 || writingActivity.some((a) => a.seconds >= 60)
  const total = (pieceCounts?.active ?? 0) + (pieceCounts?.queue ?? 0) + (pieceCounts?.completed ?? 0)
  const greetingWords = greeting.split(' ')

  return (
    <PageShell mood={mood as Mood} intensity={intensity}>
      <PageHeader
        title={
          <span style={{ display: 'inline-block', overflow: 'hidden', whiteSpace: 'nowrap' }}>
            {greetingWords.map((word, i) => (
              <m.span key={i} style={{ display: 'inline-block', marginRight: '0.28em' }} initial={{ y: '110%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.7, delay: 0.15 + i * 0.08, ease: [0.33, 1, 0.68, 1] }}>
                {word}
              </m.span>
            ))}
          </span>
        }
        actions={<SettingsButton />}
      />

      <Container>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="md:col-span-2" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Card>
              <Eyebrow style={{ marginBottom: 16 }}>In progress</Eyebrow>
              {isLoading ? (
                <p style={{ ...typeRoles.small, color: t.textMuted }}>Loading…</p>
              ) : activePieces.length === 0 ? (
                <p style={{ ...typeRoles.small, color: t.textSecondary }}>Nothing in motion yet. Start from the project board.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {activePieces.map((piece, index) => {
                    const step = journeyStepFromStage(piece.stage)
                    return (
                      <a
                        key={piece.id}
                        href={`/write?piece_id=${piece.id}`}
                        style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', textDecoration: 'none', borderBottom: index < activePieces.length - 1 ? `1px solid ${t.divider}` : 'none', borderLeft: '2px solid transparent', marginLeft: -12, paddingLeft: 10, transition: 'border-color 0.2s ease' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderLeftColor = t.ember }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderLeftColor = 'transparent' }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: t.verdant, flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ ...typeRoles.ui, fontSize: 14, fontWeight: 500, color: t.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{piece.title}</p>
                          <div style={{ marginTop: 6, maxWidth: 220 }}>
                            <StageRibbon step={step} compact />
                          </div>
                        </div>
                        <span className="hidden md:inline" style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted, flexShrink: 0 }}>
                          {piece.arc} · {JOURNEY_LABELS[step]}
                        </span>
                      </a>
                    )
                  })}
                </div>
              )}
              <div style={{ paddingTop: 16, borderTop: activePieces.length > 0 ? `1px solid ${t.divider}` : 'none', display: 'flex', justifyContent: 'flex-end', gap: 16 }}>
                <UnderlineLink href="/idea-lab" color={t.textSecondary}>New idea</UnderlineLink>
                <UnderlineLink href="/project-board" color={t.textSecondary}>View full board →</UnderlineLink>
              </div>
            </Card>

            <div>
              <Eyebrow style={{ marginBottom: 14 }}>Ideas</Eyebrow>
              <ProportionBar
                segments={[
                  { label: 'Queue', value: pieceCounts?.queue ?? 0, hue: 'ochre' },
                  { label: 'Active', value: pieceCounts?.active ?? 0, hue: 'verdant' },
                  { label: 'Completed', value: pieceCounts?.completed ?? 0, hue: 'violet' },
                ]}
                legend={total > 0 || !isLoading}
              />
            </div>

            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 12 }}>
                <Eyebrow>Inner weather · 30 days</Eyebrow>
                <UnderlineLink href="/check-in" color={t.textSecondary}>Check in →</UnderlineLink>
              </div>
              {hasWeather ? (
                <WeatherStrip days={days} onSelect={() => router.push('/check-in#history')} />
              ) : (
                <p style={{ ...typeRoles.small, color: t.textSecondary }}>No check-ins or writing sessions yet. Once you have either, the last thirty days show here: height is energy, colour is arc.</p>
              )}
            </Card>
          </div>

          {/* Right column: capture */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <Card style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <Eyebrow>Capture what&apos;s alive</Eyebrow>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                <TextField type="url" value={captureUrl} onChange={setCaptureUrl} placeholder="Paste a link that inspired you…" ariaLabel="Link" style={{ fontSize: 13, padding: '10px 12px' }} />
                <TextField
                  value={captureNote}
                  onChange={setCaptureNote}
                  placeholder="What caught your eye? (optional)"
                  ariaLabel="Note"
                  style={{ fontSize: 13, padding: '10px 12px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isCapturing) handleQuickCapture()
                  }}
                />
                {captureError && <p style={{ ...typeRoles.small, fontSize: 11, color: t.danger }}>{captureError}</p>}
                <QuietButton onClick={handleQuickCapture} disabled={isCapturing || (!captureUrl.trim() && !captureNote.trim())} loading={isCapturing} loadingLabel="Capturing…" full style={justCaptured ? { backgroundColor: t.verdant, color: '#fff' } : undefined}>
                  {justCaptured ? 'Captured ✓' : 'Capture'}
                </QuietButton>
              </div>

              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${t.divider}`, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                {isLoadingCaptures ? (
                  <p style={{ ...typeRoles.small, color: t.textMuted }}>Loading…</p>
                ) : recentCaptures.length === 0 ? (
                  <p style={{ ...typeRoles.small, color: t.textSecondary }}>Nothing captured yet.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {recentCaptures.map((capture, index) => (
                      <a
                        key={capture.id}
                        href="/collector"
                        style={{ display: 'block', padding: '10px 0 10px 10px', marginLeft: -10, borderLeft: '2px solid transparent', textDecoration: 'none', borderBottom: index < recentCaptures.length - 1 ? `1px solid ${t.divider}` : 'none', transition: 'border-color 0.2s ease' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderLeftColor = t.ember }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderLeftColor = 'transparent' }}
                      >
                        <p style={{ ...typeRoles.small, fontSize: 12, color: t.textPrimary, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{capture.raw_input}</p>
                        <span style={{ ...typeRoles.small, fontSize: 11, color: t.textMuted }}>{capture.arc}</span>
                      </a>
                    ))}
                  </div>
                )}
                <div style={{ paddingTop: 12, marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                  <UnderlineLink href="/collector" color={t.textSecondary}>View all captures →</UnderlineLink>
                </div>
              </div>
            </Card>

            {letterState.optedIn && (
              <Card>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                  <Eyebrow>The Sunday letter</Eyebrow>
                  {letterState.letter && !letterState.letter.read_at && <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: t.ember, display: 'inline-block' }} aria-label="Unread" />}
                </div>
                {letterState.letter ? (
                  <>
                    <p style={{ ...typeRoles.quote, fontSize: 15, color: t.textPrimary, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{letterState.letter.body}</p>
                    <div style={{ marginTop: 12 }}>
                      <GhostButton size="sm" onClick={openLetter}>Read the letter</GhostButton>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{ ...typeRoles.small, color: t.textSecondary }}>This week&apos;s letter has not been written yet.</p>
                    <div style={{ marginTop: 12 }}>
                      <PrimaryButton size="sm" onClick={writeLetter} loading={writingLetter} loadingLabel="Writing…">Write it now</PrimaryButton>
                    </div>
                  </>
                )}
              </Card>
            )}
          </div>
        </div>
      </Container>

      {letterOpen && letterState.letter && (
        <ModalDialog onClose={() => setLetterOpen(false)} title="The Sunday letter" subtitle={<span>Week of {new Date(letterState.letter.week_start).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</span>} maxWidth="600px">
          <Card>
            {letterState.letter.body.split(/\n{2,}/).map((para, i) => (
              <p key={i} style={{ ...typeRoles.ui, fontSize: 16, lineHeight: 1.7, color: t.textPrimary, marginBottom: 14 }}>{para}</p>
            ))}
            <Divider style={{ margin: '4px 0 12px' }} />
            <p style={{ ...typeRoles.small, fontSize: 12, color: t.textMuted }}>Written from your week. You can turn the letter off in Settings.</p>
          </Card>
        </ModalDialog>
      )}
    </PageShell>
  )
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: shell.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: shell.muted }}>Loading…</p>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  )
}
