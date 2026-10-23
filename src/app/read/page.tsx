'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow, Divider } from '@/components/shell/page-shell'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { Pill } from '@/components/ui/pill'
import { UnderlineLink } from '@/components/ui/underline-link'
import { JourneyNav, JourneyNavNode, JourneyCurve } from '@/components/widgets'
import { useTerritories } from '@/hooks/useTerritories'
import { ReflectionLogView } from '@/components/widgets/reflection-log'
import { arcHue, journeyStepFromStage, shell, type as typeRoles, type Arc } from '@/lib/design-tokens'
import { WorkingDots } from '@/components/ui/working'

interface Reflection {
  thread: string | null
  what_it_opened: string | null
  unresolved: string | null
  natural_continuations: string[] | null
  feeling?: string | null
  created_at: string
}

interface Piece {
  id: string
  project_id?: string | null
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
  const nodeId = searchParams.get('node_id')

  const [piece, setPiece] = useState<Piece | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [copied, setCopied] = useState<'md' | 'script' | null>(null)

  useEffect(() => {
    if (!pieceId && !nodeId) {
      router.push('/project-board')
      return
    }
    const url = nodeId ? `/api/read/node?node_id=${nodeId}` : `/api/project-board/piece?id=${pieceId}`
    fetch(url)
      .then((r) => r.json())
      .then((d) => { if (d.success) setPiece(d.piece) })
      .catch((err) => console.error('Failed to load piece:', err))
      .finally(() => setIsLoading(false))
  }, [pieceId, nodeId, router])

  const copy = (kind: 'md' | 'script') => {
    if (!piece) return
    const text = kind === 'md' ? `# ${piece.title}\n\n${piece.substack_draft ?? ''}` : piece.short_form_script ?? ''
    navigator.clipboard.writeText(text)
    setCopied(kind)
    setTimeout(() => setCopied(null), 1500)
  }

  if (!pieceId && !nodeId) return null

  const words = (piece?.substack_draft ?? '').trim().split(/\s+/).filter(Boolean).length

  return (
    <PageShell mood={piece ? arcHue[piece.arc] ?? 'violet' : 'violet'} maxWidth={860}>
      <PageHeader
        eyebrow="Finished"
        title={piece?.title ?? 'Finished piece'}
        subtitle={piece ? `${piece.posted_at ? `Finished ${new Date(piece.posted_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not finished yet'} · ${words.toLocaleString()} words` : undefined}
        back={nodeId ? (piece?.project_id ? `/p/${piece.project_id}` : '/project-board') : '/project-board'}
        actions={
          piece ? (
            <>
              {nodeId && piece.project_id && <GhostButton size="sm" href={`/p/${piece.project_id}/n/${piece.id}?edit=1`}>Keep editing</GhostButton>}
              {piece.short_form_script && <GhostButton size="sm" onClick={() => copy('script')}>{copied === 'script' ? 'Copied' : 'Copy script'}</GhostButton>}
              <QuietButton size="sm" onClick={() => copy('md')}>{copied === 'md' ? 'Copied' : 'Copy as Markdown'}</QuietButton>
            </>
          ) : undefined
        }
      />

      <Container>
        {isLoading || !piece ? (
          <p style={{ ...typeRoles.small, color: t.textMuted }}>{isLoading ? <><WorkingDots /> Loading…</> : 'Piece not found.'}</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px', maxWidth: 520 }}>
                {nodeId ? (
                  <JourneyNavNode projectId={piece.project_id ?? null} nodeId={piece.id} step={journeyStepFromStage(piece.stage)} />
                ) : (
                  <JourneyNav pieceId={piece.id} step={journeyStepFromStage(piece.stage)} />
                )}
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

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {piece.emotional_journey && (
                <Card>
                  <Eyebrow style={{ marginBottom: 12 }}>The journey it was written to take</Eyebrow>
                  <JourneyCurve text={piece.emotional_journey} />
                </Card>
              )}
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <Eyebrow>Looking back</Eyebrow>
                  {piece.reflection ? <Pill hue="violet">{new Date(piece.reflection.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</Pill> : nodeId ? <UnderlineLink href={`/reflect?node_id=${piece.id}`} color={t.ember}>Look back on it →</UnderlineLink> : null}
                </div>
                {piece.reflection ? (
                  <ReflectionLogView
                    log={{
                      thread: piece.reflection.thread,
                      feeling: piece.reflection.feeling,
                      opened: piece.reflection.what_it_opened,
                      unresolved: piece.reflection.unresolved,
                      next: piece.reflection.natural_continuations ?? [],
                    }}
                  />
                ) : (
                  <p style={{ ...typeRoles.ui, fontSize: 14, color: t.textSecondary }}>Nothing looked back on yet. It is a short conversation, and every question can be skipped.</p>
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
          <p style={{ color: shell.muted }}><WorkingDots /> Loading…</p>
        </div>
      }
    >
      <ReadContent />
    </Suspense>
  )
}
