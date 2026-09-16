'use client'

// studio/src/components/work/work-page.tsx — levels 2 and 1 of one project.
//
//   level 2  the board    a canvas: the pieces across it, the threads beneath
//   level 1  the writing  a page: one piece, its parts, and nothing else
//
// They are deliberately different surfaces. Vision is spatial and wants room
// to be moved around in; writing is linear and wants to be left alone. So the
// board is a bounded canvas with everything on glass over it, and the writing
// is a quiet column with its tools on the rail, out of the way.
//
// Depth is never presented. A project opens as its pieces; parts appear inside
// a piece when the work asks for them; nothing here is hard-coded to a depth.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Container, PageHeader, PageShell } from '@/components/shell/page-shell'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { CanvasStage, StageHeader } from '@/components/surface/stage'
import { Level, useTravel } from '@/components/surface/travel'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'
import { LEVELS } from '@/lib/studio/levels'
import type { CheckOutcome, Rule, Thread, TreeNode } from '@/lib/studio/node-types'
import { useWork } from '@/lib/studio/use-work'
import { appearancesOf, findNode, newRule, pathTo, rulesInForce } from '@/lib/studio/tree'
import { Board, type BoardActions } from '@/components/work/board'
import { Storyline } from '@/components/work/storyline'
import { Studio } from '@/components/work/studio'
import { ThreadRead } from '@/components/work/thread-read'
import { Companion } from '@/components/work/companion'
import { CompanionLauncher, Drawer, Rail, RAIL_TOOLS, type RailKey } from '@/components/work/rail'
import { CheckCard, RuleList } from '@/components/work/rules'
import { Empty, InlineField, Label, Trail, useRoomBeside } from '@/components/work/bits'

export type Focus =
  | { kind: 'project' }
  | { kind: 'node'; id: string }
  | { kind: 'thread'; id: string }

type View = 'write' | 'map' | 'flow'

export function WorkPage({ projectId, focus }: { projectId: string; focus: Focus }) {
  return (
    <Level>
      <Work projectId={projectId} focus={focus} />
    </Level>
  )
}

function Work({ projectId, focus }: { projectId: string; focus: Focus }) {
  const { t } = useTheme()
  const router = useRouter()
  const go = useTravel()
  const confirm = useConfirm()
  const { state, project, tree, roots, api, saving, tagFor } = useWork(projectId)
  const [view, setView] = useState<View>('write')
  const [rail, setRail] = useState<RailKey | null>(null)
  const [checking, setChecking] = useState(false)
  const [checkNote, setCheckNote] = useState<string | null>(null)
  const roomBeside = useRoomBeside()

  const goNode = useCallback((id: string, from?: HTMLElement | null) => {
    go(`/p/${projectId}/n/${id}`, 'in', from)
  }, [go, projectId])
  const goThread = useCallback((id: string) => router.push(`/p/${projectId}/thread/${id}`), [projectId, router])
  const goProject = useCallback((from?: HTMLElement | null) => {
    go(`/p/${projectId}`, 'out', from)
  }, [go, projectId])
  const goShelf = useCallback((from?: HTMLElement | null) => go('/shelf', 'out', from), [go])

  const node = focus.kind === 'node' ? findNode(roots, focus.id) : null
  const thread: Thread | null =
    focus.kind === 'thread' ? tree.threads.find((th) => th.id === focus.id) ?? null : null
  const trail = useMemo(() => (node ? pathTo(roots, node.id) : []), [roots, node])
  const parent = trail.length > 1 ? trail[trail.length - 2] : null
  const readOnly = project?.status !== 'active'

  const focusKey = focus.kind === 'project' ? 'project' : `${focus.kind}:${focus.id}`
  useEffect(() => { setCheckNote(null) }, [focusKey])

  const appearancesFor = useCallback((threadId: string) => appearancesOf(roots, threadId), [roots])

  const openChecks = useMemo(
    () => (node ? tree.open_checks.filter((c) => c.node_id === node.id) : tree.open_checks),
    [tree.open_checks, node],
  )

  const projectRules = useMemo(
    () => ((project?.rules ?? []) as Rule[]).filter((r) => r && typeof r.id === 'string'),
    [project],
  )

  const inherited = useMemo(() => {
    const live = projectRules.filter((r) => !r.retired_at).map((rule) => ({ rule, from: 'the project' }))
    if (!node) return live
    const above = rulesInForce(roots, node.id).filter((r) => r.inherited)
    return [...live, ...above.map(({ rule, source }) => ({ rule, from: source.title || 'above' }))]
  }, [node, roots, projectRules])

  const setProjectField = api.editProject

  const runCheck = useCallback(async (nodeId: string) => {
    setChecking(true)
    setCheckNote(null)
    const res = await api.runCheck(nodeId)
    setChecking(false)
    if (res.checks.length === 0) setCheckNote(res.reason ?? 'Nothing collided.')
    else setRail(null)
  }, [api])

  /** Amending retires the old wording wherever it lives and puts the new one in
   *  its place. This is the only way a rule changes after a collision. */
  const amendRule = useCallback(async (checkId: string, newText: string) => {
    const check = tree.open_checks.find((c) => c.id === checkId)
    if (!check) return
    const swap = (rules: Rule[]) => rules.map((r) => (r.id === check.rule_id ? { ...r, text: newText } : r))
    if (check.source_thread_id) {
      const th = tree.threads.find((x) => x.id === check.source_thread_id)
      if (th) await api.editThread(th.id, { rules: swap(th.rules) })
      return
    }
    if (check.source_node_id) {
      const owner = findNode(roots, check.source_node_id)
      if (owner) { await api.editNode(owner.id, { rules: swap(owner.rules) }); return }
    }
    await setProjectField({ rules: swap(projectRules) })
  }, [api, projectRules, roots, setProjectField, tree.open_checks, tree.threads])

  const resolve = useCallback(
    (checkId: string, outcome: CheckOutcome, note?: string) => void api.resolveCheck(checkId, outcome, note),
    [api],
  )

  /** Removing a part takes everything under it, so it always says what else goes. */
  const removeNode = useCallback(async (target: TreeNode) => {
    const inside = target.children.length
    const ok = await confirm({
      title: `Delete “${target.title || 'this part'}”?`,
      body: inside > 0
        ? `Everything inside it goes too — ${inside} ${inside === 1 ? 'part' : 'parts'}. This cannot be undone.`
        : 'This cannot be undone.',
      confirmLabel: 'delete',
      danger: true,
    })
    if (!ok) return
    const up = pathTo(roots, target.id)
    const above = up.length > 1 ? up[up.length - 2] : null
    await api.removeNode(target.id)
    if (focus.kind === 'node' && focus.id === target.id) {
      if (above) goNode(above.id)
      else goProject()
    }
  }, [api, confirm, focus, goNode, goProject, roots])

  /** Breaking something open must never hide what is already written. */
  const breakIntoParts = useCallback(async (target: TreeNode) => {
    const hasWords = target.body.trim().length > 0
    const first = await api.addNode(target.id)
    if (!first) return
    if (hasWords) {
      await api.editNode(first.id, {
        title: target.title || '', body: target.body, beat: target.beat, status: target.status,
      })
      await api.editNode(target.id, { body: '', status: 'open' })
    }
  }, [api])

  /**
   * A thread that reaches every piece has stopped being a thread. Its words
   * become a rule on the project — where they get teeth — and the thread and
   * all its marks come off the board.
   */
  const makeConstraint = useCallback(async (th: Thread) => {
    const words = [th.intent.trim() || th.name.trim(), ...th.rules.filter((r) => !r.retired_at).map((r) => r.text)]
    const additions = words.filter(Boolean).map(newRule)
    if (additions.length) await setProjectField({ rules: [...projectRules, ...additions] })
    await api.removeThread(th.id)
  }, [api, projectRules, setProjectField])

  const boardActions: BoardActions = useMemo(() => ({
    openPiece: (id, from) => goNode(id, from),
    addPiece: () => void api.addNode(null),
    removePiece: (piece) => void removeNode(piece),
    renamePiece: (id, title) => void api.editNode(id, { title }),
    reorder: (ids) => void api.reorderRoots(ids),
    movePiece: (id, at) => void api.editNode(id, { board_x: at?.x ?? null, board_y: at?.y ?? null }),
    addThread: () => api.addThread(),
    editThread: (id, patch) => void api.editThread(id, patch),
    removeThread: (id) => void api.removeThread(id),
    moveThread: (id, at) => void api.editThread(id, { board_x: at?.x ?? null, board_y: at?.y ?? null }),
    tag: (nodeId, threadId, note) => void api.tag(nodeId, threadId, note),
    untag: (nodeId, threadId) => void api.untag(nodeId, threadId),
    makeConstraint: (th) => void makeConstraint(th),
    readThread: goThread,
    renameProject: (title) => void setProjectField({ title }),
    editProjectIntent: (intent) => void setProjectField({ intent }),
    editProjectRules: (rules) => void setProjectField({ rules }),
    moveVision: (at) => void setProjectField({ vision_x: at?.x ?? null, vision_y: at?.y ?? null }),
    /** Clears every hand placement at once: every piece, every thread's hub,
     *  and the vision block all fall back to their auto positions. */
    tidyBoard: () => {
      for (const piece of roots) void api.editNode(piece.id, { board_x: null, board_y: null })
      for (const th of tree.threads) void api.editThread(th.id, { board_x: null, board_y: null })
      void setProjectField({ vision_x: null, vision_y: null })
    },
  }), [api, goNode, goThread, makeConstraint, removeNode, roots, setProjectField, tree.threads])

  // ── loading and error ─────────────────────────────────────────────────────
  if (state.status === 'loading') {
    return (
      <CanvasStage header={<StageHeader title="opening…" onUp={goShelf} upLabel={`back to ${LEVELS.shelf.name}`} />}>
        <span />
      </CanvasStage>
    )
  }
  if (state.status === 'error' || !project) {
    return (
      <PageShell dock={false} mood="neutral">
        <PageHeader eyebrow={null} title="it did not open" size="md" />
        <Container padding={32}>
          <p style={{ ...canvasType.body, color: t.textSecondary, margin: '0 0 16px' }}>
            {state.status === 'error' ? state.message : 'The project is missing.'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <QuietButton onClick={() => void api.reload()}>try again</QuietButton>
            <GhostButton onClick={() => router.push('/shelf')}>back to the shelf</GhostButton>
          </div>
        </Container>
      </PageShell>
    )
  }

  // What the rail is standing over: a part, or the whole project.
  const scopeNode = focus.kind === 'node' ? node : null
  const scopeRules = scopeNode ? scopeNode.rules : projectRules
  const scopeIntent = scopeNode ? scopeNode.intent : (project.intent ?? '')
  const liveRuleCount = scopeRules.filter((r) => !r.retired_at).length

  const setScopeRules = (rules: Rule[]) => {
    if (scopeNode) void api.editNode(scopeNode.id, { rules })
    else void setProjectField({ rules })
  }
  const setScopeIntent = (intent: string) => {
    if (scopeNode) void api.editNode(scopeNode.id, { intent })
    else void setProjectField({ intent })
  }

  const railTitle = RAIL_TOOLS.find((x) => x.key === rail)?.label ?? ''
  const savingMark = saving ? 'saving…' : null

  const checks = openChecks.length > 0 && (
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
  )

  const companionDrawer = (
    <Drawer open={rail !== null} title={railTitle} onClose={() => setRail(null)}>
      {rail === 'intent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <InlineField
            ariaLabel="what this is for"
            value={scopeIntent}
            placeholder={scopeNode ? 'say what this part has to do…' : 'say what the whole project is, and what it has to do…'}
            multiline
            disabled={readOnly}
            onCommit={setScopeIntent}
            style={{ ...canvasType.conceptBody, color: t.textPrimary }}
          />

          {scopeNode && parent && (parent.intent || parent.title) && (
            <div style={{ borderLeft: `2px solid ${alpha(t.violet, 0.5)}`, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label style={{ color: alpha(t.violet, 0.9) }}>it owes {parent.title || 'the part above'}</Label>
              {parent.intent && <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>{parent.intent}</p>}
              <InlineField
                ariaLabel="the beat this part carries"
                value={scopeNode.beat}
                placeholder="what it has to do here…"
                multiline
                disabled={readOnly}
                onCommit={(beat) => void api.editNode(scopeNode.id, { beat })}
                style={{ ...canvasType.small, color: t.textPrimary }}
              />
            </div>
          )}

          {scopeNode && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: readOnly ? 'default' : 'pointer' }}>
              <input
                type="checkbox"
                checked={scopeNode.stands_whole}
                disabled={readOnly}
                onChange={(e) => void api.editNode(scopeNode.id, { stands_whole: e.target.checked })}
              />
              <span style={{ ...canvasType.chip, color: scopeNode.stands_whole ? t.violet : t.textMuted }}>
                stands whole on its own
              </span>
            </label>
          )}

          {scopeNode && !readOnly && (
            <div style={{ borderTop: `1px solid ${alpha(t.textPrimary, 0.08)}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <GhostButton size="sm" onClick={() => void runCheck(scopeNode.id)} disabled={checking}>
                {checking ? 'reading…' : 'check it against the rules'}
              </GhostButton>
              <button
                type="button"
                onClick={() => void removeNode(scopeNode)}
                style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                delete this part
              </button>
            </div>
          )}
        </div>
      )}

      {rail === 'rules' && (
        <RuleList
          rules={scopeRules}
          inherited={scopeNode ? inherited : []}
          disabled={readOnly}
          onChange={setScopeRules}
        />
      )}

      {rail === 'companion' && (
        <Companion
          projectId={projectId}
          nodeId={scopeNode?.id ?? null}
          scope={scopeNode ? (scopeNode.title || 'this part') : 'the whole project'}
          disabled={readOnly}
        />
      )}
    </Drawer>
  )

  // ── level 2: the board ────────────────────────────────────────────────────
  if (focus.kind === 'project') {
    return (
      <>
        <CanvasStage
          header={
            <StageHeader
              onUp={(el) => goShelf(el)}
              upLabel={`back to ${LEVELS.shelf.name}`}
              status={savingMark}
            />
          }
        >
          <Board
            project={{
              title: project.title,
              intent: project.intent ?? '',
              rules: projectRules,
              vision_x: project.vision_x,
              vision_y: project.vision_y,
            }}
            pieces={roots}
            threads={tree.threads}
            checks={openChecks}
            onResolveCheck={resolve}
            onAmendCheck={(id, text) => void amendRule(id, text)}
            tagFor={tagFor}
            appearancesFor={appearancesFor}
            actions={boardActions}
            disabled={readOnly}
          />
          {/* Bottom and centred, not a small icon in a corner pill — this is
             the invitation to talk the vision through, not an afterthought. */}
          <CompanionLauncher
            active={rail === 'companion'}
            onClick={() => setRail((r) => (r === 'companion' ? null : 'companion'))}
          />
        </CanvasStage>
        {companionDrawer}
      </>
    )
  }

  // ── level 1: the writing (and the filtered read of one thread) ────────────
  const headerTitle =
    focus.kind === 'thread' ? thread?.name || 'a thread'
    : node?.title || 'untitled'

  return (
    <PageShell dock={false} mood="neutral">
      <PageHeader
        eyebrow={null}
        title={headerTitle}
        size="md"
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span
              aria-live="polite"
              style={{ ...canvasType.chip, color: shell.muted, opacity: saving ? 1 : 0, transition: 'opacity 160ms ease' }}
            >
              saving…
            </span>
            {focus.kind === 'node' && node && <ViewSwitch view={view} onChange={setView} />}
          </div>
        }
        back={() => goProject()}
      />

      <Container
        padding={26}
        style={{
          paddingRight: rail && roomBeside ? 478 : 70,
          transition: 'padding-right 200ms ease',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Trail
            steps={focus.kind === 'node' ? trail : []}
            onGo={(id) => goNode(id)}
            projectTitle={project.title}
            onGoProject={() => goProject()}
          />

          {checks}
          {checkNote && <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>{checkNote}</p>}

          {focus.kind === 'node' && node && (
            view === 'map' ? (
              node.children.length > 0 ? (
                <Storyline
                  parts={node.children}
                  threads={tree.threads}
                  onOpen={(id) => goNode(id)}
                  onReorder={(ids) => void api.reorder(node.id, ids)}
                  onEditBeat={(id, beat) => void api.editNode(id, { beat })}
                  onAdd={(afterId) => void api.addNode(node.id, afterId)}
                  onOpenThread={goThread}
                  onRemove={(part) => void removeNode(part)}
                  disabled={readOnly}
                />
              ) : (
                <Empty line="Nothing to map yet — this part has no parts of its own." />
              )
            ) : (
              <Studio
                node={node}
                threads={tree.threads}
                flow={view === 'flow'}
                onEdit={(id, patch) => api.editNode(id, patch)}
                onAdd={(afterId) =>
                  node.children.length > 0
                    ? void api.addNode(node.id, afterId)
                    : void breakIntoParts(node)
                }
                onRemove={(part) => void removeNode(part)}
                onOpenPart={(id) => goNode(id)}
                onOpenThread={goThread}
                onFinished={() => goProject()}
                disabled={readOnly}
              />
            )
          )}
          {focus.kind === 'node' && !node && <Empty line="That part is gone." />}

          {focus.kind === 'thread' && thread && (
            <ThreadRead
              thread={thread}
              appearances={appearancesFor(thread.id)}
              tagFor={tagFor}
              onOpen={(id) => goNode(id)}
              onUntag={(nodeId) => void api.untag(nodeId, thread.id)}
              onEditThread={(patch) => void api.editThread(thread.id, patch)}
              disabled={readOnly}
            />
          )}
          {focus.kind === 'thread' && !thread && <Empty line="That thread is gone." />}
        </div>
      </Container>

      <Rail
        open={rail}
        onOpen={setRail}
        hidden={focus.kind === 'thread'}
        counts={{ rules: liveRuleCount }}
      />
      {companionDrawer}
    </PageShell>
  )
}

/** write · map · flow, the three ways to look at a piece. */
function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const { t } = useTheme()
  const options: Array<{ key: View; label: string }> = [
    { key: 'write', label: 'write' },
    { key: 'map', label: 'map' },
    { key: 'flow', label: 'flow' },
  ]
  return (
    <div
      role="group"
      aria-label="how to look at this"
      style={{
        display: 'inline-flex', padding: 2, gap: 2,
        background: alpha(t.textPrimary, 0.06), borderRadius: radius.field,
      }}
    >
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={view === o.key}
          onClick={() => onChange(o.key)}
          style={{
            ...canvasType.chip, padding: '4px 10px', borderRadius: radius.field - 2,
            border: 'none', cursor: 'pointer',
            background: view === o.key ? t.cardBg : 'transparent',
            color: view === o.key ? t.textPrimary : t.textMuted,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
