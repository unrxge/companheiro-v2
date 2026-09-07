'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { PrimaryButton, GhostButton, QuietButton } from '@/components/ui/buttons'
import { Pill } from '@/components/ui/pill'
import { JourneyNav } from '@/components/widgets'
import { shell, type as typeRoles } from '@/lib/design-tokens'

interface CoverageItem {
  item: string
  status: 'landed' | 'partial' | 'missing'
  note: string
}

interface TestResult {
  coverage: CoverageItem[]
  emotional_journey: { verdict: string; drift: string }
  challenge: string[]
}

const STATUS: Record<CoverageItem['status'], { hue: 'verdant' | 'ochre' | 'danger'; label: string }> = {
  landed: { hue: 'verdant', label: 'Landed' },
  partial: { hue: 'ochre', label: 'Partial' },
  missing: { hue: 'danger', label: 'Missing' },
}

function TestContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTheme()
  const pieceId = searchParams.get('piece_id')

  const [result, setResult] = useState<TestResult | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!pieceId) {
      router.push('/project-board')
      return
    }
    // Entering Test moves the piece to that step of its journey.
    fetch('/api/write/draft', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ piece_id: pieceId, stage: 'testing' }) }).catch(() => {})
    runTest()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieceId])

  const runTest = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/write/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ piece_id: pieceId }) })
      const data = await res.json()
      if (data.error) setError(data.error)
      else setResult(data)
    } catch (err) {
      console.error('Test failed:', err)
      setError('Failed to test the draft. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!pieceId) return null

  const landed = result?.coverage.filter((c) => c.status === 'landed').length ?? 0
  const partial = result?.coverage.filter((c) => c.status === 'partial').length ?? 0
  const missing = result?.coverage.filter((c) => c.status === 'missing').length ?? 0

  return (
    <PageShell mood="ochre" maxWidth={820}>
      <PageHeader eyebrow="Write · Test" title="Read cold" subtitle="Your finished draft, read against what you set out to make." size="md" back={`/write?piece_id=${pieceId}`} />

      <Container>
        <div style={{ marginBottom: 22 }}>
          <JourneyNav pieceId={pieceId} step="test" />
        </div>

        {isLoading ? (
          <Card>
            <p style={{ ...typeRoles.ui, color: t.textSecondary }}>Reading the whole thing…</p>
          </Card>
        ) : error ? (
          <Card>
            <p style={{ ...typeRoles.small, color: t.danger }}>{error}</p>
            <div style={{ marginTop: 12 }}>
              <GhostButton size="sm" onClick={runTest}>Try again</GhostButton>
            </div>
          </Card>
        ) : result ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {result.coverage.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                  <Eyebrow>What you wanted in it</Eyebrow>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {landed > 0 && <Pill hue="verdant" dot>{landed} landed</Pill>}
                    {partial > 0 && <Pill hue="ochre" dot>{partial} partial</Pill>}
                    {missing > 0 && <Pill hue="danger" dot>{missing} missing</Pill>}
                  </div>
                </div>
                {/* Coverage bar: the proportion that landed, at a glance */}
                <div style={{ display: 'flex', gap: 2, height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: t.divider, marginBottom: 14 }} role="img" aria-label={`${landed} landed, ${partial} partial, ${missing} missing`}>
                  {landed > 0 && <div style={{ flexGrow: landed, flexBasis: 0, backgroundColor: t.verdant }} />}
                  {partial > 0 && <div style={{ flexGrow: partial, flexBasis: 0, backgroundColor: t.ochre }} />}
                  {missing > 0 && <div style={{ flexGrow: missing, flexBasis: 0, backgroundColor: t.danger }} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {result.coverage.map((c, i) => {
                    const st = STATUS[c.status] || STATUS.partial
                    return (
                      <Card key={i} padding="14px 16px">
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: t[st.hue], flexShrink: 0, marginTop: 7 }} />
                          <p style={{ ...typeRoles.ui, fontSize: 15, fontWeight: 500, color: t.textPrimary, flex: 1 }}>{c.item}</p>
                          <Pill hue={st.hue}>{st.label}</Pill>
                        </div>
                        {c.note && <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary, marginTop: 6, paddingLeft: 18 }}>{c.note}</p>}
                      </Card>
                    )
                  })}
                </div>
              </div>
            )}

            {result.emotional_journey.verdict && (
              <div>
                <Eyebrow style={{ marginBottom: 12 }}>The emotional arc</Eyebrow>
                <Card>
                  <p style={{ ...typeRoles.ui, fontSize: 15, color: t.textPrimary }}>{result.emotional_journey.verdict}</p>
                  {result.emotional_journey.drift && (
                    <div style={{ marginTop: 12, paddingLeft: 12, borderLeft: `2px solid ${t.ochre}` }}>
                      <Eyebrow style={{ marginBottom: 4, color: t.ochre }}>Where it drifts</Eyebrow>
                      <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary }}>{result.emotional_journey.drift}</p>
                    </div>
                  )}
                </Card>
              </div>
            )}

            {result.challenge.length > 0 && (
              <div>
                <Eyebrow style={{ marginBottom: 12 }}>The hard questions</Eyebrow>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {result.challenge.map((q, i) => (
                    <Card key={i} padding="14px 16px">
                      <p style={{ ...typeRoles.quote, fontSize: 16, color: t.textPrimary }}>{q}</p>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', paddingTop: 6 }}>
              <PrimaryButton href={`/write/translate?piece_id=${pieceId}`}>Shape it: translate →</PrimaryButton>
              <QuietButton href={`/write/reimagine?piece_id=${pieceId}`}>Reimagine</QuietButton>
              <GhostButton onClick={runTest}>Test again</GhostButton>
            </div>
          </div>
        ) : null}
      </Container>
    </PageShell>
  )
}

export default function WriteTestPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: shell.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: shell.muted }}>Loading…</p>
        </div>
      }
    >
      <TestContent />
    </Suspense>
  )
}
