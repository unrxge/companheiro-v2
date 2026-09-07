'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow, Divider } from '@/components/shell/page-shell'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { Pill } from '@/components/ui/pill'
import { UnderlineLink } from '@/components/ui/underline-link'
import { JourneyNav, JourneyCurve } from '@/components/widgets'
import { useTerritories } from '@/hooks/useTerritories'
import { arcHue, journeyStepFromStage, shell, type as typeRoles, type Arc } from '@/lib/design-tokens'

interface Reflection {
  thread: string | null
  what_it_opened: string | null
  unresolved: string | null
  natural_continuations: string[] | null
  created_at: string
}

interface Piece {
  id: string
  title: string
  arc: Arc
  thematic_territory: string
  one_sentence: string
  core_truth: string
  emotional_journey: string
  substack_draft: string | null
  short_form_script: string | null
  stage: string
  posted_at: string | null
  created_at: string
  reflection: Reflection | null
}

/**
 * The Reading room. A quiet view of a finished piece with its reflection
 * attached. "Look what you made" is the feeling; copy as Markdown and copy
 * the script are the two exits.
 */
function ReadContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { t } = useTheme()
  const territories = useTerritories()
  const pieceId = searchParams.get('piece_id')

  const [piece, setPiece] = useState<Piece | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState<'md' | 'script' | null>(null)

  useEffect(() => {
    if (!pieceId) {
      router.push('/project-board')
      return
    }
    fetch(`/api/project-board/piece?id=${pieceId}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setPiece(d.piece) })
      .catch((err) => console.error('Failed to load piece:', err))
      .finally(() => setIsLoading(false))
  }, [pieceId, router])

  const copy = (kind: 'md' | 'script') => {
    if (!piece) return
    const text = kind === 'md' ? `# ${piece.title}\n\n${piece.substack_draft ?? ''}` : piece.short_form_script ?? ''
    navigator.clipboard.writeText(text)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1500)
  }

  if (!pieceId) return null

  const words = (piece?.substack_draft ?? '').trim().split(/\s+/).filter(Boolean).length
  const openThreads = [piece?.reflection?.unresolved, ...(piece?.reflection?.natural_continuations ?? [])].filter(Boolean) as string[]

  return (
    <PageShell mood={piece ? arcHue[piece.arc] ?? 'violet' : 'violet'} maxWidth={860}>
      <PageHeader
        eyebrow="Reading room"
        title={piece?.title ?? 'Reading room'}
        subtitle={piece ? `${piece.posted_at ? `Posted ${new Date(piece.posted_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not yet posted'} · ${words.toLocaleString()} words` : undefined}
        back="/project-board"
        actions={
          piece ? (
            <>
              {piece.short_form_script && <GhostButton size="sm" onClick={() => copy('script')}>{copied === 'script' ? 'Copied' : 'Copy script'}</GhostButton>}
              <QuietButton size="sm" onClick={() => copy('md')}>{copied === 'md' ? 'Copied' : 'Copy as Markdown'}</QuietButton>
            </>
          ) : undefined
        }
      />

      <Container>
        {isLoading || !piece ? (
          <p style={{ ...typeRoles.small, color: t.textMuted }}>{isLoading ? 'Loading…' : 'Piece not found.'}</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px', maxWidth: 520 }}>
                <JourneyNav pieceId={piece.id} step={journeyStepFromStage(piece.stage)} />
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Pill hue={arcHue[piece.arc] ?? 'ember'} dot>{piece.arc}</Pill>
                {piece.thematic_territory && <Pill hue={territories.hue(piece.thematic_territory)}>{territories.short(piece.thematic_territory)}</Pill>}
              </div>
            </div>

            <Card padding="clamp(24px, 5vw, 48px)">
              <article style={{ maxWidth: 680, margin: '0 auto' }}>
                {piece.one_sentence && <p style={{ ...typeRoles.quote, fontSize: 20, color: t.textSecondary, marginBottom: 28 }}>{piece.one_sentence}</p>}
                {(piece.substack_draft ?? '').split(/\n{2,}/).filter((p) => p.trim()).map((para, i) => (
                  <p key={i} style={{ ...typeRoles.ui, fontSize: 17, lineHeight: 1.8, color: t.textPrimary, marginBottom: 20, whiteSpace: 'pre-wrap' }}>{para}</p>
                ))}
                {!piece.substack_draft && <p style={{ ...typeRoles.ui, color: t.textMuted }}>No draft was saved for this piece.</p>}
                {piece.core_truth && (
                  <>
                    <Divider style={{ margin: '28px 0 20px' }} />
                    <Eyebrow style={{ marginBottom: 8 }}>Core truth</Eyebrow>
                    <p style={{ ...typeRoles.quote, color: t.textPrimary }}>{piece.core_truth}</p>
                  </>
                )}
              </article>
            </Card>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
              {piece.emotional_journey && (
                <Card>
                  <Eyebrow style={{ marginBottom: 12 }}>The journey it was written to take</Eyebrow>
                  <JourneyCurve text={piece.emotional_journey} />
                </Card>
              )}
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <Eyebrow>Reflection</Eyebrow>
                  {piece.reflection ? <Pill hue="violet">{new Date(piece.reflection.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Pill> : <UnderlineLink href={`/post-publication?piece_id=${piece.id}`} color={t.ember}>Write it →</UnderlineLink>}
                </div>
                {piece.reflection ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {piece.reflection.thread && (
                      <div>
                        <Eyebrow style={{ marginBottom: 4, fontSize: 10 }}>Thread</Eyebrow>
                        <p style={{ ...typeRoles.ui, fontSize: 14, fontWeight: 500, color: t.textPrimary }}>{piece.reflection.thread}</p>
                      </div>
                    )}
                    {piece.reflection.what_it_opened && (
                      <div>
                        <Eyebrow style={{ marginBottom: 4, fontSize: 10 }}>What it opened</Eyebrow>
                        <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary }}>{piece.reflection.what_it_opened}</p>
                      </div>
                    )}
                    {openThreads.length > 0 && (
                      <div>
                        <Eyebrow style={{ marginBottom: 6, fontSize: 10, color: t.ember }}>Still open</Eyebrow>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {openThreads.map((th, i) => (
                            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', border: `2px solid ${t.ember}`, flexShrink: 0, marginTop: 6 }} />
                              <div style={{ flex: 1 }}>
                                <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textPrimary }}>{th}</p>
                                <UnderlineLink href={`/idea-lab/conceptualise?seed=${encodeURIComponent(th)}`} color={t.textMuted}>Develop this →</UnderlineLink>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary }}>No reflection logged yet. What it opened and what it left open are what feed the next idea.</p>
                )}
              </Card>
            </div>
          </div>
        )}
      </Container>
    </PageShell>
  )
}

export default function ReadPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: '100dvh', background: shell.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p style={{ color: shell.muted }}>Loading…</p>
        </div>
      }
    >
      <ReadContent />
    </Suspense>
  )
}
