'use client'

// studio/src/app/dev/work/page.tsx — the new work model, driven entirely from
// memory so it runs with no database and no account. Every altitude and every
// gesture is the real component; only the store behind them is fake.
//
// It exists so the shape can be felt before migration 002 is applied, and so
// the views can be checked without credentials.

import { useCallback, useMemo, useState } from 'react'
import { Container, PageHeader, PageShell } from '@/components/shell/page-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, PrimaryButton } from '@/components/ui/buttons'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha } from '@/lib/design-tokens'
import type { Rule, Thread, ThreadTag, WorkNode } from '@/lib/studio/node-types'
import { appearancesOf, buildTree, findNode, flatten, newRule, pathTo, rulesInForce, wordCount } from '@/lib/studio/tree'
import { Grid } from '@/components/work/grid'
import { FlowRead, Storyline } from '@/components/work/storyline'
import { Writing } from '@/components/work/writing'
import { ThreadRead } from '@/components/work/thread-read'
import { RuleList } from '@/components/work/rules'
import { InlineField, Label, Trail } from '@/components/work/bits'

const NOW = '2026-09-14T09:00:00.000Z'
const uid = () => (globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}`)

function node(partial: Partial<WorkNode> & { id: string }): WorkNode {
  return {
    user_id: 'dev', project_id: 'dev', parent_id: null, position: 0,
    title: '', intent: '', beat: '', stands_whole: false, rules: [],
    body: '', extent: 0, status: 'open', created_at: NOW, updated_at: NOW,
    ...partial,
  }
}

function p(text: string): string {
  return text.split('\n\n').map((para) => `<p>${para}</p>`).join('')
}

// ── a short film series, which is the four-deep case ────────────────────────
const SEED_NODES: WorkNode[] = [
  node({
    id: 'f1', position: 0, stands_whole: true, title: 'one · the long way round',
    intent: 'A woman drives her mother home the long way so the conversation has room to happen. The film has to earn the silence at the end.',
    rules: [newRule('the mother never explains herself')],
  }),
  node({
    id: 'f1s1', parent_id: 'f1', position: 0, title: 'the pickup',
    intent: 'Establish that they have not spoken properly in a year, without either of them saying so.',
    beat: 'polite, and wrong',
    status: 'drafted',
    body: p(`INT. HOSPITAL FOYER — LATE AFTERNOON\n\nCLARA waits by the doors with her coat still on. Her mother, ROSA, comes out slowly, refusing the arm of the nurse beside her.\n\nROSA\nYou came.\n\nCLARA\nI said I would.\n\nRosa looks at the car through the glass. Then at her daughter's face. Then at the car again.`),
  }),
  node({
    id: 'f1s2', parent_id: 'f1', position: 1, title: 'the wrong turn',
    intent: 'Clara takes the road past the old house. She does not say why and Rosa does not ask.',
    beat: 'the first crack',
    body: p(`INT. CAR — DUSK\n\nThe indicator ticks. Clara turns right where she should have gone straight.\n\nRosa says nothing for a long time.`),
  }),
  node({
    id: 'f1s3', parent_id: 'f1', position: 2, title: 'the silence',
    intent: 'They arrive. Neither gets out. This is the thing the whole film was for.',
    beat: 'nothing said, everything landed',
  }),
  node({
    id: 'f2', position: 1, stands_whole: true, title: 'two · what the house kept',
    intent: 'The house is sold. Clara has one afternoon to empty it and finds the thing she has been avoiding since the first film.',
  }),
  node({
    id: 'f3', position: 2, stands_whole: true, title: 'three · nine nights',
    intent: 'The wake. Nine nights of people arriving. Clara has to be the one who speaks, and she is the one who cannot.',
  }),
]

const SEED_THREADS: Thread[] = [
  {
    id: 'th-rosa', user_id: 'dev', project_id: 'dev', position: 0, hue: 'ember',
    name: 'rosa, withheld',
    intent: 'She never explains herself. By the third film the audience should understand her completely without her having said a single direct thing.',
    rules: [newRule('she never answers the question she was asked')],
    created_at: NOW, updated_at: NOW,
  },
  {
    id: 'th-house', user_id: 'dev', project_id: 'dev', position: 1, hue: 'tide',
    name: 'the house',
    intent: 'It moves from background to subject to absence across the three films.',
    rules: [], created_at: NOW, updated_at: NOW,
  },
]

const SEED_TAGS: ThreadTag[] = [
  { node_id: 'f1', thread_id: 'th-rosa', note: 'she is introduced refusing help' },
  { node_id: 'f1s1', thread_id: 'th-rosa', note: '“you came” — a question dressed as a statement' },
  { node_id: 'f1s2', thread_id: 'th-house', note: 'seen through a window, never named' },
  { node_id: 'f2', thread_id: 'th-house', note: 'the house becomes the subject' },
  { node_id: 'f3', thread_id: 'th-rosa', note: 'absent, and still not explaining herself' },
]

type Focus = { kind: 'project' } | { kind: 'node'; id: string } | { kind: 'thread'; id: string }

export default function DevWorkPage() {
  const { t } = useTheme()
  const [nodes, setNodes] = useState<WorkNode[]>(() =>
    SEED_NODES.map((n) => ({ ...n, extent: wordCount(n.body) })),
  )
  const [threads, setThreads] = useState<Thread[]>(SEED_THREADS)
  const [tags, setTags] = useState<ThreadTag[]>(SEED_TAGS)
  const [projectIntent, setProjectIntent] = useState(
    'Three short films about a daughter and a mother, released a month apart. Each one has to stand on its own for someone who finds it first, and the three together have to say the thing none of them says alone.',
  )
  const [projectRules, setProjectRules] = useState<Rule[]>([
    newRule('no voiceover, ever'),
    newRule('every film ends on an image, not a line'),
  ])
  const [focus, setFocus] = useState<Focus>({ kind: 'project' })
  const [view, setView] = useState<'parts' | 'flow'>('parts')
  const [showRules, setShowRules] = useState(false)

  const roots = useMemo(() => buildTree(nodes, tags, threads.map((x) => x.id)), [nodes, tags, threads])
  const current = focus.kind === 'node' ? findNode(roots, focus.id) : null
  const thread = focus.kind === 'thread' ? threads.find((x) => x.id === focus.id) ?? null : null
  const trail = useMemo(() => (current ? pathTo(roots, current.id) : []), [roots, current])
  const parent = trail.length > 1 ? trail[trail.length - 2] : null

  const appearancesFor = useCallback((threadId: string) => appearancesOf(roots, threadId), [roots])

  const removeNode = useCallback((id: string) => {
    setNodes((prev) => {
      const doomed = new Set([id])
      let grew = true
      while (grew) {
        grew = false
        for (const n of prev) {
          if (n.parent_id && doomed.has(n.parent_id) && !doomed.has(n.id)) { doomed.add(n.id); grew = true }
        }
      }
      return prev.filter((n) => !doomed.has(n.id))
    })
    setTags((prev) => prev.filter((x) => x.node_id !== id))
    setFocus({ kind: 'project' })
  }, [])

  const tagFor = useCallback(
    (nodeId: string, threadId: string) => tags.find((x) => x.node_id === nodeId && x.thread_id === threadId),
    [tags],
  )

  const editNode = useCallback((id: string, patch: Partial<WorkNode>) => {
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id !== id) return n
        const next = { ...n, ...patch }
        if (typeof patch.body === 'string') next.extent = wordCount(patch.body)
        return next
      }),
    )
  }, [])

  const addNode = useCallback((parentId: string | null, afterId?: string | null) => {
    const id = uid()
    setNodes((prev) => {
      const siblings = prev.filter((n) => n.parent_id === parentId)
      const at = afterId ? siblings.findIndex((s) => s.id === afterId) + 1 : siblings.length
      const fresh = node({ id, parent_id: parentId, position: at, title: '' })
      const shifted = prev.map((n) =>
        n.parent_id === parentId && n.position >= at ? { ...n, position: n.position + 1 } : n,
      )
      return [...shifted, fresh]
    })
    setFocus({ kind: 'node', id })
  }, [])

  const reorder = useCallback((ids: string[]) => {
    setNodes((prev) => prev.map((n) => {
      const at = ids.indexOf(n.id)
      return at === -1 ? n : { ...n, position: at }
    }))
  }, [])

  const inherited = useMemo(() => {
    if (!current) return []
    const above = rulesInForce(roots, current.id).filter((r) => r.inherited)
    return [
      ...projectRules.filter((r) => !r.retired_at).map((rule) => ({ rule, from: 'the project' })),
      ...above.map(({ rule, source }) => ({ rule, from: source.title || 'above' })),
    ]
  }, [current, roots, projectRules])

  const title =
    focus.kind === 'thread' ? thread?.name || 'a thread'
    : focus.kind === 'node' ? current?.title || 'untitled'
    : 'nine nights'

  return (
    <PageShell dock={false} mood="neutral">
      <PageHeader
        eyebrow="dev · in memory, no database"
        title={title}
        size="md"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            {focus.kind === 'node' && current && current.children.length > 0 && (
              <GhostButton size="sm" onClick={() => setView(view === 'parts' ? 'flow' : 'parts')}>
                {view === 'parts' ? 'read it through' : 'back to the parts'}
              </GhostButton>
            )}
            {focus.kind !== 'project' && (
              <GhostButton size="sm" onClick={() => setFocus({ kind: 'project' })}>the whole project</GhostButton>
            )}
          </div>
        }
      />

      <Container padding={28}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {focus.kind !== 'project' && (
            <Trail
              steps={focus.kind === 'node' ? trail : []}
              onGo={(id) => setFocus({ kind: 'node', id })}
              projectTitle="nine nights"
              onGoProject={() => setFocus({ kind: 'project' })}
            />
          )}

          {focus.kind === 'project' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Label>what the whole thing is for</Label>
                <InlineField
                  ariaLabel="what the whole project is for"
                  value={projectIntent}
                  multiline
                  onCommit={setProjectIntent}
                  style={{ ...canvasType.conceptBody, color: t.textSecondary }}
                />
                <button
                  type="button"
                  onClick={() => setShowRules((s) => !s)}
                  style={{
                    ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none',
                    padding: 0, alignSelf: 'flex-start', cursor: 'pointer',
                  }}
                >
                  {showRules ? 'hide the rules' : `rules (${projectRules.filter((r) => !r.retired_at).length})`}
                </button>
                {showRules && (
                  <div style={{ borderLeft: `2px solid ${alpha(t.ember, 0.4)}`, paddingLeft: 12, marginTop: 4 }}>
                    <RuleList rules={projectRules} onChange={setProjectRules} />
                  </div>
                )}
              </div>

              <Grid
                pieces={roots}
                threads={threads}
                tagFor={tagFor}
                appearancesFor={appearancesFor}
                onOpenPiece={(id) => setFocus({ kind: 'node', id })}
                onOpenThread={(id) => setFocus({ kind: 'thread', id })}
                onOpenNode={(id) => setFocus({ kind: 'node', id })}
                onToggle={(nodeId, threadId, on) =>
                  setTags((prev) =>
                    on
                      ? [...prev, { node_id: nodeId, thread_id: threadId, note: '' }]
                      : prev.filter((x) => !(x.node_id === nodeId && x.thread_id === threadId)),
                  )
                }
                onEditNote={(nodeId, threadId, note) =>
                  setTags((prev) => [
                    ...prev.filter((x) => !(x.node_id === nodeId && x.thread_id === threadId)),
                    { node_id: nodeId, thread_id: threadId, note },
                  ])
                }
                onAddPiece={() => addNode(null)}
                onAddThread={() =>
                  setThreads((prev) => [
                    ...prev,
                    {
                      id: uid(), user_id: 'dev', project_id: 'dev', position: prev.length,
                      name: '', intent: '', rules: [],
                      hue: (['ember', 'verdant', 'violet', 'ochre', 'tide'] as const)[prev.length % 5],
                      created_at: NOW, updated_at: NOW,
                    },
                  ])
                }
                onEditThread={(id, patch) =>
                  setThreads((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)))
                }
                onRemoveThread={(id) => {
                  setThreads((prev) => prev.filter((x) => x.id !== id))
                  setTags((prev) => prev.filter((x) => x.thread_id !== id))
                }}
              />
            </>
          )}

          {focus.kind === 'node' && current && (
            current.children.length === 0 ? (
              <>
                <Writing
                  node={current}
                  parent={parent}
                  threads={threads}
                  inheritedRules={inherited}
                  checking={false}
                  onEdit={(patch) => editNode(current.id, patch)}
                  onRunCheck={() => undefined}
                  onOpenThread={(id) => setFocus({ kind: 'thread', id })}
                  onFinished={() => setFocus(parent ? { kind: 'node', id: parent.id } : { kind: 'project' })}
                  onRemove={() => removeNode(current.id)}
                />
                <div style={{ borderTop: `1px solid ${alpha(t.textPrimary, 0.1)}`, paddingTop: 16 }}>
                  <p style={{ ...canvasType.small, color: t.textMuted, margin: '0 0 10px' }}>
                    If this needs a beginning, a middle and an end of its own, give it parts.
                  </p>
                  <PrimaryButton size="sm" onClick={() => addNode(current.id)}>break it into parts</PrimaryButton>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <InlineField
                    ariaLabel="the title of this part"
                    value={current.title}
                    placeholder="untitled"
                    onCommit={(title) => editNode(current.id, { title })}
                    style={{ ...canvasType.headingLg, color: t.textPrimary }}
                  />
                  <Label>what this is for</Label>
                  <InlineField
                    ariaLabel="what this is for"
                    value={current.intent}
                    placeholder="say what it has to do…"
                    multiline
                    onCommit={(intent) => editNode(current.id, { intent })}
                    style={{ ...canvasType.body, color: t.textSecondary }}
                  />
                  <div style={{ borderLeft: `2px solid ${alpha(t.ember, 0.4)}`, paddingLeft: 12 }}>
                    <RuleList
                      rules={current.rules}
                      inherited={inherited}
                      onChange={(rules) => editNode(current.id, { rules })}
                    />
                  </div>
                </div>
                {view === 'parts' ? (
                  <Storyline
                    parts={current.children}
                    threads={threads}
                    onOpen={(id) => setFocus({ kind: 'node', id })}
                    onReorder={reorder}
                    onEditBeat={(id, beat) => editNode(id, { beat })}
                    onAdd={(afterId) => addNode(current.id, afterId)}
                    onOpenThread={(id) => setFocus({ kind: 'thread', id })}
                    onRemove={(part) => removeNode(part.id)}
                  />
                ) : (
                  <FlowRead parts={flatten(current.children).filter((n) => n.children.length === 0)} />
                )}
              </>
            )
          )}

          {focus.kind === 'thread' && thread && (
            <ThreadRead
              thread={thread}
              appearances={appearancesFor(thread.id)}
              tagFor={tagFor}
              onOpen={(id) => setFocus({ kind: 'node', id })}
              onUntag={(nodeId) =>
                setTags((prev) => prev.filter((x) => !(x.node_id === nodeId && x.thread_id === thread.id)))
              }
              onEditThread={(patch) =>
                setThreads((prev) => prev.map((x) => (x.id === thread.id ? { ...x, ...patch } : x)))
              }
            />
          )}
        </div>
      </Container>
    </PageShell>
  )
}
