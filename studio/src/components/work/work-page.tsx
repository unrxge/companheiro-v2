'use client'

// studio/src/components/work/work-page.tsx — the whole work, at whatever
// altitude you are standing.
//
// Depth is never presented. A project opens as one piece; the altitude above
// appears when a second piece or a thread exists; parts appear inside a piece
// when the work asks for them. The interface is learned once and the only
// thing that changes between altitudes is granularity.

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Container, PageHeader, PageShell } from '@/components/shell/page-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, PrimaryButton, QuietButton } from '@/components/ui/buttons'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius } from '@/lib/design-tokens'
import type { CheckOutcome, Rule, Thread, TreeNode } from '@/lib/studio/node-types'
import { useWork } from '@/lib/studio/use-work'
import { work as workApi } from '@/lib/studio/work-api'
import { findNode, flatten, pathTo, rulesInForce, showsProjectAltitude } from '@/lib/studio/tree'
import { Grid } from '@/components/work/grid'
import { Storyline, FlowRead } from '@/components/work/storyline'
import { Writing } from '@/components/work/writing'
import { ThreadRead } from '@/components/work/thread-read'
import { CheckCard, RuleList } from '@/components/work/rules'
import { Empty, InlineField, Label, Trail } from '@/components/work/bits'

export type Focus =
  | { kind: 'project' }
  | { kind: 'node'; id: string }
  | { kind: 'thread'; id: string }

export function WorkPage({ projectId, focus }: { projectId: string; focus: Focus }) {
  const { t } = useTheme()
  const router = useRouter()
  const { state, project, tree, roots, api, saving, tagFor } = useWork(projectId)
  const [view, setView] = useState<'parts' | 'flow'>('parts')
  const [checking, setChecking] = useState(false)
  const [checkNote, setCheckNote] = useState<string | null>(null)
  const [showProjectRules, setShowProjectRules] = useState(false)

  const goNode = useCallback((id: string) => router.push(`/p/${projectId}/n/${id}`), [projectId, router])
  const goThread = useCallback((id: string) => router.push(`/p/${projectId}/thread/${id}`), [projectId, router])
  const goProject = useCallback(() => router.push(`/p/${projectId}`), [projectId, router])

  const node = focus.kind === 'node' ? findNode(roots, focus.id) : null
  const thread: Thread | null =
    focus.kind === 'thread' ? tree.threads.find((th) => th.id === focus.id) ?? null : null
  const trail = useMemo(() => (node ? pathTo(roots, node.id) : []), [roots, node])
  const parent = trail.length > 1 ? trail[trail.length - 2] : null
  const readOnly = project?.status !== 'active'

  const openChecks = useMemo(
    () => (node ? tree.open_checks.filter((c) => c.node_id === node.id) : tree.open_checks),
    [tree.open_checks, node],
  )

  const inherited = useMemo(() => {
    if (!node) return []
    const all = rulesInForce(roots, node.id).filter((r) => r.inherited)
    const projectRules = ((project?.rules ?? []) as Rule[]).filter((r) => r && !r.retired_at)
    return [
      ...projectRules.map((rule) => ({ rule, from: 'the project' })),
      ...all.map(({ rule, source }) => ({ rule, from: source.title || 'above' })),
    ]
  }, [node, roots, project])

  const runCheck = useCallback(async (nodeId: string) => {
    setChecking(true)
    setCheckNote(null)
    const res = await api.runCheck(nodeId)
    setChecking(false)
    if (res.checks.length === 0) setCheckNote(res.reason ?? 'nothing collided')
  }, [api])

  /** Amending retires the old wording wherever it lives and puts the new one
   *  in its place. This is the only way a rule changes after a collision. */
  const amendRule = useCallback(async (checkId: string, newText: string) => {
    const check = tree.open_checks.find((c) => c.id === checkId)
    if (!check) return
    const swap = (rules: Rule[]) =>
      rules.map((r) =>
        r.id === check.rule_id ? { ...r, text: newText } : r,
      )
    if (check.source_thread_id) {
      const th = tree.threads.find((x) => x.id === check.source_thread_id)
      if (th) await api.editThread(th.id, { rules: swap(th.rules) })
      return
    }
    if (check.source_node_id) {
      const owner = findNode(roots, check.source_node_id)
      if (owner) { await api.editNode(owner.id, { rules: swap(owner.rules) }); return }
    }
    if (project) {
      const next = swap((project.rules ?? []) as Rule[])
      await workApi.tree(projectId).catch(() => null)
      await fetch(`/api/studio/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: next }),
      })
      await api.reload()
    }
  }, [api, project, projectId, roots, tree.open_checks, tree.threads])

  const resolve = useCallback(
    (checkId: string, outcome: CheckOutcome, note?: string) => void api.resolveCheck(checkId, outcome, note),
    [api],
  )

  const setProjectField = useCallback(async (patch: { intent?: string; rules?: Rule[] }) => {
    await fetch(`/api/studio/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    await api.reload()
  }, [api, projectId])

  // ── loading and error ─────────────────────────────────────────────────────
  if (state.status === 'loading') {
    return (
      <PageShell dock={false} mood="neutral">
        <PageHeader eyebrow="studio" title="opening…" size="md" />
      </PageShell>
    )
  }
  if (state.status === 'error' || !project) {
    return (
      <PageShell dock={false} mood="neutral">
        <PageHeader eyebrow="studio" title="it did not open" size="md" />
        <Container padding={32}>
          <p style={{ ...canvasType.body, color: t.textSecondary, margin: '0 0 16px' }}>
            {state.status === 'error' ? state.message : 'the project is missing'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <QuietButton onClick={() => void api.reload()}>try again</QuietButton>
            <GhostButton onClick={() => router.push('/shelf')}>back to the shelf</GhostButton>
          </div>
        </Container>
      </PageShell>
    )
  }

  // ── progressive disclosure ────────────────────────────────────────────────
  // One piece and no threads: there is no altitude above worth showing, so the
  // project opens straight into the work.
  const showGrid = showsProjectAltitude(roots, tree.threads.length)
  if (focus.kind === 'project' && !showGrid && roots.length === 1) {
    return <RedirectInto onMount={() => goNode(roots[0].id)} />
  }

  const headerTitle =
    focus.kind === 'thread' ? thread?.name || 'a thread'
    : focus.kind === 'node' ? node?.title || 'untitled'
    : project.title

  return (
    <PageShell dock={false} mood="neutral">
      <PageHeader
        eyebrow={saving ? 'saving…' : 'studio'}
        title={headerTitle}
        size="md"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {focus.kind === 'node' && node && node.children.length > 0 && (
              <GhostButton size="sm" onClick={() => setView(view === 'parts' ? 'flow' : 'parts')}>
                {view === 'parts' ? 'read it through' : 'back to the parts'}
              </GhostButton>
            )}
            <GhostButton size="sm" onClick={() => router.push('/shelf')}>the shelf</GhostButton>
          </div>
        }
      />

      <Container padding={28}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* where you are */}
          {focus.kind !== 'project' && (
            <Trail
              steps={focus.kind === 'node' ? trail : []}
              onGo={goNode}
              projectTitle={project.title}
              onGoProject={goProject}
            />
          )}

          {/* collisions waiting for an answer */}
          {openChecks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {openChecks.map((check) => (
                <CheckCard
                  key={check.id}
                  check={check}
                  onResolve={(outcome, note) => resolve(check.id, outcome, note)}
                  onAmend={(text) => void amendRule(check.id, text)}
                />
              ))}
            </div>
          )}
          {checkNote && (
            <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>{checkNote}</p>
          )}

          {/* ── the project altitude ─────────────────────────────────────── */}
          {focus.kind === 'project' && (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Label>what the whole thing is for</Label>
                <InlineField
                  ariaLabel="what the whole project is for"
                  value={project.intent ?? ''}
                  placeholder="say what this project is, and what it has to do…"
                  multiline
                  disabled={readOnly}
                  onCommit={(intent) => void setProjectField({ intent })}
                  style={{ ...canvasType.conceptBody, color: t.textSecondary }}
                />
                <button
                  type="button"
                  onClick={() => setShowProjectRules((s) => !s)}
                  style={{
                    ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none',
                    padding: 0, alignSelf: 'flex-start', cursor: 'pointer',
                  }}
                >
                  {showProjectRules ? 'hide the rules' : `rules (${((project.rules ?? []) as Rule[]).filter((r) => r && !r.retired_at).length})`}
                </button>
                {showProjectRules && (
                  <div
                    style={{
                      borderLeft: `2px solid ${alpha(t.ember, 0.4)}`, paddingLeft: 12, marginTop: 4,
                    }}
                  >
                    <RuleList
                      rules={((project.rules ?? []) as Rule[]) ?? []}
                      disabled={readOnly}
                      onChange={(rules) => void setProjectField({ rules })}
                    />
                  </div>
                )}
              </div>

              <Grid
                pieces={roots}
                threads={tree.threads}
                tagFor={tagFor}
                onOpenPiece={goNode}
                onOpenThread={goThread}
                onToggle={(nodeId, threadId, on) => {
                  if (on) void api.tag(nodeId, threadId)
                  else void api.untag(nodeId, threadId)
                }}
                onEditNote={(nodeId, threadId, note) => void api.tag(nodeId, threadId, note)}
                onAddPiece={() => void api.addNode(null)}
                onAddThread={() => void api.addThread()}
                onEditThread={(id, patch) => void api.editThread(id, patch)}
                onRemoveThread={(id) => void api.removeThread(id)}
                disabled={readOnly}
              />
            </>
          )}

          {/* ── a part of the work ───────────────────────────────────────── */}
          {focus.kind === 'node' && node && (
            node.children.length === 0 ? (
              <>
                <Writing
                  node={node}
                  parent={parent}
                  threads={tree.threads}
                  inheritedRules={inherited}
                  checks={openChecks}
                  checking={checking}
                  disabled={readOnly}
                  onEdit={(patch) => void api.editNode(node.id, patch)}
                  onRunCheck={() => void runCheck(node.id)}
                  onOpenThread={goThread}
                />
                {!readOnly && (
                  <div style={{ borderTop: `1px solid ${alpha(t.textPrimary, 0.1)}`, paddingTop: 16 }}>
                    <p style={{ ...canvasType.small, color: t.textMuted, margin: '0 0 10px' }}>
                      if this needs a beginning, a middle and an end of its own, give it parts.
                    </p>
                    <PrimaryButton size="sm" onClick={() => void api.addNode(node.id)}>
                      break it into parts
                    </PrimaryButton>
                  </div>
                )}
              </>
            ) : (
              <>
                <NodeHead
                  node={node}
                  readOnly={readOnly}
                  onEdit={(patch) => void api.editNode(node.id, patch)}
                  inherited={inherited}
                />
                {view === 'parts' ? (
                  <Storyline
                    parts={node.children}
                    threads={tree.threads}
                    onOpen={goNode}
                    onReorder={(ids) => void api.reorder(node.id, ids)}
                    onEditBeat={(id, beat) => void api.editNode(id, { beat })}
                    onAdd={(afterId) => void api.addNode(node.id, afterId)}
                    disabled={readOnly}
                  />
                ) : (
                  <FlowRead parts={flatten(node.children).filter((n) => n.children.length === 0)} />
                )}
                {!readOnly && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <GhostButton size="sm" onClick={() => void runCheck(node.id)} disabled={checking}>
                      {checking ? 'reading…' : 'check the whole thing against the rules'}
                    </GhostButton>
                  </div>
                )}
              </>
            )
          )}

          {focus.kind === 'node' && !node && <Empty line="that part is gone." />}

          {/* ── one thread, read through ─────────────────────────────────── */}
          {focus.kind === 'thread' && thread && (
            <ThreadRead
              thread={thread}
              appearances={flatten(roots)
                .filter((n) => n.threads.includes(thread.id))
                .map((n) => ({ node: n, trail: pathTo(roots, n.id).map((s) => s.title || 'untitled') }))}
              tagFor={tagFor}
              onOpen={goNode}
              onEditThread={(patch) => void api.editThread(thread.id, patch)}
              disabled={readOnly}
            />
          )}
          {focus.kind === 'thread' && !thread && <Empty line="that thread is gone." />}

          {/* the first piece */}
          {focus.kind === 'project' && roots.length === 0 && !readOnly && (
            <PrimaryButton size="sm" onClick={() => void api.addNode(null)}>
              start the first piece
            </PrimaryButton>
          )}
        </div>
      </Container>
    </PageShell>
  )
}

/** Title, what it is for, whether it stands whole, and its own rules. */
function NodeHead({
  node,
  readOnly,
  onEdit,
  inherited,
}: {
  node: TreeNode
  readOnly: boolean
  onEdit: (patch: Partial<TreeNode>) => void
  inherited: Array<{ rule: Rule; from: string }>
}) {
  const { t } = useTheme()
  const [openRules, setOpenRules] = useState(false)
  const live = node.rules.filter((r) => !r.retired_at).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <InlineField
        ariaLabel="the title of this part"
        value={node.title}
        placeholder="untitled"
        disabled={readOnly}
        onCommit={(title) => onEdit({ title })}
        style={{ ...canvasType.headingLg, color: t.textPrimary }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Label>what this is for</Label>
        <InlineField
          ariaLabel="what this is for"
          value={node.intent}
          placeholder="say what it has to do…"
          multiline
          disabled={readOnly}
          onCommit={(intent) => onEdit({ intent })}
          style={{ ...canvasType.body, color: t.textSecondary }}
        />
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: readOnly ? 'default' : 'pointer' }}>
          <input
            type="checkbox"
            checked={node.stands_whole}
            disabled={readOnly}
            onChange={(e) => onEdit({ stands_whole: e.target.checked })}
          />
          <span style={{ ...canvasType.chip, color: node.stands_whole ? t.violet : t.textMuted }}>
            stands whole on its own
          </span>
        </label>
        <button
          type="button"
          onClick={() => setOpenRules((s) => !s)}
          style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {openRules ? 'hide the rules' : `rules (${live})`}
        </button>
      </div>
      {openRules && (
        <div style={{ borderLeft: `2px solid ${alpha(t.ember, 0.4)}`, paddingLeft: 12 }}>
          <RuleList
            rules={node.rules}
            inherited={inherited}
            disabled={readOnly}
            onChange={(rules) => onEdit({ rules })}
          />
        </div>
      )}
    </div>
  )
}

function RedirectInto({ onMount }: { onMount: () => void }) {
  const { t } = useTheme()
  useMemo(() => { queueMicrotask(onMount) }, [onMount])
  return (
    <PageShell dock={false} mood="neutral">
      <PageHeader eyebrow="studio" title="opening…" size="md" />
      <Container padding={32}>
        <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>opening the work…</p>
      </Container>
    </PageShell>
  )
}
