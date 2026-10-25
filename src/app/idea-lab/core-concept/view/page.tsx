'use client'

// The core concept as it stood when it was locked, read again: the same page
// the locking ended on, every part settled. A piece that has a concept of its
// own shows that one; a piece without one shows its project's. Reached from
// the Concept step of the Write · Test · Reflect ribbon. Nothing here changes
// the concept: that is done in the piece's own concept panel and the vision
// room, where each change is kept with its date.

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from '@/components/theme/theme-provider'
import { PageShell, PageHeader, Container, Card, Eyebrow } from '@/components/shell/page-shell'
import { GhostButton } from '@/components/ui/buttons'
import { Pill } from '@/components/ui/pill'
import { ConversationLogModal } from '@/components/conversation/conversation-log-modal'
import { JourneyCurve, JourneyNavNode } from '@/components/widgets'
import { DashedList } from '@/components/widgets/dashed-list'
import { work } from '@/lib/studio/work-api'
import type { WorkNode } from '@/lib/studio/node-types'
import type { Project } from '@/lib/studio/types'
import { arcHue, type as typeRoles, type Arc } from '@/lib/design-tokens'
import { WorkingDots } from '@/components/ui/working'

const ARCS: Arc[] = ['Breakaway', 'Beginning', 'Expansion', 'Integration']

interface Concept {
  core_truth: string
  conviction: string
  emotional_journey: string
  open_threads: string[]
}

const has = (s: string | null | undefined) => !!s && s.trim().length > 0

/** The piece's own concept, if it has one; otherwise the project's; otherwise none. */
function conceptFor(project: Project, node: WorkNode | null): { whose: 'piece' | 'project'; concept: Concept } | null {
  if (node && (has(node.core_truth) || has(node.intent) || has(node.emotional_journey))) {
    return {
      whose: 'piece',
      concept: {
        core_truth: node.core_truth ?? '',
        conviction: node.intent ?? '',
        emotional_journey: node.emotional_journey ?? '',
        open_threads: node.open_threads ?? [],
      },
    }
  }
  const own = project.settings?.concept
  if (own && (has(own.core_truth) || has(own.intent) || has(own.emotional_journey))) {
    return {
      whose: 'project',
      concept: {
        core_truth: own.core_truth ?? '',
        conviction: own.intent ?? '',
        emotional_journey: own.emotional_journey ?? '',
        open_threads: own.open_threads ?? [],
      },
    }
  }
  return null
}

export default function CoreConceptViewPage() {
  return (
    <Suspense fallback={null}>
      <CoreConceptView />
    </Suspense>
  )
}

function CoreConceptView() {
  const router = useRouter()
  const params = useSearchParams()
  const projectId = params.get('project')
  const nodeId = params.get('node')
  const { t } = useTheme()

  const [loaded, setLoaded] = useState<{ project: Project; node: WorkNode | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showConversation, setShowConversation] = useState(false)

  useEffect(() => {
    if (!projectId) { router.replace('/project-board'); return }
    let live = true
    work.tree(projectId)
      .then((res) => {
        if (!live) return
        const node = nodeId ? res.tree.nodes.find((n) => n.id === nodeId && !n.parent_id) ?? null : null
        setLoaded({ project: res.project, node })
      })
      .catch(() => { if (live) setError('The core concept did not open.') })
    return () => { live = false }
  }, [projectId, nodeId, router])

  const found = loaded ? conceptFor(loaded.project, loaded.node) : null

  // Neither the piece nor the project has one yet: it is built, not read.
  useEffect(() => {
    if (loaded && !found && projectId) router.replace(`/idea-lab/core-concept?project=${projectId}`)
  }, [loaded, found, projectId, router])

  const goBack = () => {
    if (window.history.length > 1) router.back()
    else router.push(projectId ? (nodeId ? `/p/${projectId}/n/${nodeId}` : `/p/${projectId}`) : '/project-board')
  }

  const project = loaded?.project ?? null
  const log = project?.conceptualisation_log ?? null
  const arc = project?.arc as Arc | undefined
  const theme = project?.thematic_territory ?? ''

  return (
    <PageShell mood="ember" maxWidth={900}>
      <PageHeader
        eyebrow={null}
        title="Core concept"
        subtitle={found && loaded ? (found.whose === 'piece' ? loaded.node?.title || undefined : `The project’s: ${loaded.project.title}`) : undefined}
        size="md"
        clampOnPhone
        back={goBack}
        actions={log && log.length > 0 ? <GhostButton size="sm" onClick={() => setShowConversation(true)}>Conversation</GhostButton> : undefined}
      />

      <Container>
        {error ? (
          <p style={{ ...typeRoles.small, color: t.danger }}>{error}</p>
        ) : !found || !loaded ? (
          <p style={{ ...typeRoles.small, color: t.textMuted }}><WorkingDots /> Opening…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {loaded.node && projectId && (
              <div style={{ maxWidth: 520 }}>
                <JourneyNavNode projectId={projectId} nodeId={loaded.node.id} step="concept" />
              </div>
            )}

            {found.whose === 'project' && loaded.node && (
              <p style={{ ...typeRoles.small, fontSize: 13, color: t.textMuted, margin: 0 }}>
                This piece has no core concept of its own, so this is the one its project holds.
              </p>
            )}

            {(arc || theme) && (
              <Card>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
                  {arc && ARCS.includes(arc) && (
                    <div>
                      <Eyebrow style={{ marginBottom: 10 }}>Movement</Eyebrow>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <Pill hue={arcHue[arc]} selected size="md" dot>{arc}</Pill>
                      </div>
                    </div>
                  )}
                  {theme && (
                    <div>
                      <Eyebrow style={{ marginBottom: 10 }}>Theme</Eyebrow>
                      <p style={{ ...typeRoles.ui, fontSize: 15, color: t.textPrimary, margin: 0 }}>{theme}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {(has(found.concept.conviction) || has(found.concept.emotional_journey)) && (
              <Card>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
                  {has(found.concept.conviction) && (
                    <div>
                      <Eyebrow style={{ marginBottom: 10 }}>Conviction statement</Eyebrow>
                      <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
                        <div style={{ width: 3, borderRadius: 2, background: t.ember, flexShrink: 0, minHeight: '2em', opacity: 0.6 }} />
                        <p style={{ ...typeRoles.ui, fontSize: 16, lineHeight: 1.65, fontWeight: 500, color: t.textPrimary, margin: 0 }}>{found.concept.conviction}</p>
                      </div>
                    </div>
                  )}
                  {has(found.concept.emotional_journey) && (
                    <div>
                      <Eyebrow style={{ marginBottom: 10 }}>Emotional journey</Eyebrow>
                      <JourneyCurve text={found.concept.emotional_journey} />
                      <p style={{ ...typeRoles.ui, fontSize: 14, lineHeight: 1.65, color: t.textSecondary, margin: '12px 0 0', whiteSpace: 'pre-wrap' }}>{found.concept.emotional_journey}</p>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {has(found.concept.core_truth) && (
              <Card style={{ padding: '36px 28px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, textAlign: 'center' }}>
                  <Eyebrow>Core truth</Eyebrow>
                  <p style={{ ...typeRoles.ui, fontSize: 20, fontWeight: 500, lineHeight: 1.5, letterSpacing: '-0.02em', maxWidth: 560, color: t.textPrimary, margin: 0 }}>{found.concept.core_truth}</p>
                </div>
              </Card>
            )}

            {found.concept.open_threads.length > 0 && (
              <Card>
                <Eyebrow style={{ marginBottom: 10 }}>Open threads</Eyebrow>
                <DashedList text={found.concept.open_threads.join('\n')} />
              </Card>
            )}
          </div>
        )}
      </Container>

      {showConversation && log && <ConversationLogModal messages={log} onClose={() => setShowConversation(false)} />}
    </PageShell>
  )
}
