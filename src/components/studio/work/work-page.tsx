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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Container, PageHeader, PageShell } from '@/components/shell/page-shell'
import { Dock } from '@/components/shell/dock'
import { useTheme } from '@/components/theme/theme-provider'
import { GhostButton, QuietButton } from '@/components/ui/buttons'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { CanvasStage, StageHeader } from '@/components/studio/surface/stage'
import { Level, useTravel } from '@/components/studio/surface/travel'
import { canvasType } from '@/lib/studio/canvas-tokens'
import { alpha, radius, shell } from '@/lib/design-tokens'
import { LEVELS } from '@/lib/studio/levels'
import type { CheckOutcome, Rule, Thread, TreeNode } from '@/lib/studio/node-types'
import { useWork } from '@/lib/studio/use-work'
import { appearancesOf, findNode, newRule, pathTo, rulesInForce, wordCount } from '@/lib/studio/tree'
import { Board, type BoardActions } from '@/components/studio/work/board'
import { Studio } from '@/components/studio/work/studio'
import { ThreadRead } from '@/components/studio/work/thread-read'
import { Companion, type ProposedEdit } from '@/components/studio/work/companion'
import { LockModal } from '@/components/studio/work/lock-modal'
import { CompanionLauncher, Drawer, PART_TOOLS, Rail, RAIL_TOOLS, type RailKey } from '@/components/studio/work/rail'
import { CheckCard, RuleList } from '@/components/studio/work/rules'
import { Empty, InlineField, Label, Trail, useRoomBeside } from '@/components/studio/work/bits'
import { AnchorsPanel, ConceptPanel, PieceFooter, TasksPanel, isWritingTask, usePieceTools } from '@/components/studio/work/write-tools'

export type Focus =
  | { kind: 'project' }
  | { kind: 'node'; id: string }
  | { kind: 'thread'; id: string }

type View = 'write' | 'flow'

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

  // The write-lock: shared with the main app (same user_settings row), so a
  // lock started there holds here too. Refetched occasionally rather than
  // trusted for the whole session, since it can change from outside this tab.
  const [lockedUntil, setLockedUntil] = useState<string | null>(null)
  const [lockModalOpen, setLockModalOpen] = useState(false)
  const [locking, setLocking] = useState(false)
  const refreshLock = useCallback(() => {
    fetch('/api/studio/assistant-lock', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { lockedUntil: null }))
      .then((d: { lockedUntil: string | null }) => setLockedUntil(d.lockedUntil))
      .catch(() => {})
  }, [])
  useEffect(() => {
    refreshLock()
    const id = setInterval(refreshLock, 60_000)
    return () => clearInterval(id)
  }, [refreshLock])
  const confirmLock = useCallback(async (minutes: number) => {
    if (minutes <= 0) return
    setLocking(true)
    try {
      const res = await fetch('/api/studio/assistant-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ minutes }),
      })
      const data: { success: boolean; lockedUntil?: string } = await res.json()
      if (data.success && data.lockedUntil) {
        setLockedUntil(data.lockedUntil)
        setLockModalOpen(false)
      }
    } finally {
      setLocking(false)
    }
  }, [])

  // What's highlighted right now in the piece being written, and any
  // rewrite the companion has proposed for it — the thread connecting
  // Studio (which owns the editors) and Companion (which owns the request).
  const [selection, setSelection] = useState<{ nodeId: string; text: string } | null>(null)
  const [proposal, setProposal] = useState<ProposedEdit | null>(null)

  const goNode = useCallback((id: string, from?: HTMLElement | null) => {
    go(`/p/${projectId}/n/${id}`, 'in', from)
  }, [go, projectId])
  const goThread = useCallback((id: string) => router.push(`/p/${projectId}/thread/${id}`), [projectId, router])
  const goProject = useCallback((from?: HTMLElement | null) => {
    go(`/p/${projectId}`, 'out', from)
  }, [go, projectId])
  const goShelf = useCallback((from?: HTMLElement | null) => go('/project-board', 'out', from), [go])

  const node = focus.kind === 'node' ? findNode(roots, focus.id) : null
  const thread: Thread | null =
    focus.kind === 'thread' ? tree.threads.find((th) => th.id === focus.id) ?? null : null
  const trail = useMemo(() => (node ? pathTo(roots, node.id) : []), [roots, node])
  const parent = trail.length > 1 ? trail[trail.length - 2] : null
  const readOnly = project?.status !== 'active'

  // A whole piece (not a part of one) carries the Write page's tools with it.
  const isRootPiece = focus.kind === 'node' && !!node && !node.parent_id
  const tools = usePieceTools(isRootPiece && node ? node.id : null)
  const [shaping, setShaping] = useState<'shape' | 'divide' | null>(null)
  const [shapeNote, setShapeNote] = useState<string | null>(null)
  const flushRef = useRef<(() => Promise<void>) | null>(null)

  const focusKey = focus.kind === 'project' ? 'project' : `${focus.kind}:${focus.id}`
  useEffect(() => { setCheckNote(null); setShapeNote(null) }, [focusKey])

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
      confirmLabel: 'Delete',
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
      await api.editNode(target.id, { status: 'open' })
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

  /** Shaping and dividing are routes that write the parts themselves, so the tree is read again afterwards. */
  const reshape = useCallback(async (kind: 'shape' | 'divide', pieceId: string, alreadyParts = false) => {
    if (shaping) return
    if (kind === 'divide' && alreadyParts) {
      const ok = await confirm({
        title: 'Cut the draft along its beats?',
        body: 'The words stay exactly as they are, in order. The parts are cut again, so their names, and where anchor lines were placed, start over.',
        confirmLabel: 'Divide',
      })
      if (!ok) return
    }
    setShaping(kind)
    setShapeNote(null)
    try {
      await flushRef.current?.()
      const res = await fetch(kind === 'shape' ? '/api/write/sections/seed' : '/api/write/sections/divide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ node_id: pieceId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setShapeNote(typeof data.error === 'string' ? data.error : 'That did not work. Try again in a moment.')
        return
      }
      await api.refresh()
      await tools.reloadLines()
    } catch {
      setShapeNote('That did not work. Try again in a moment.')
    } finally {
      setShaping(null)
    }
  }, [api, confirm, shaping, tools])

  /** Everything typed is saved first, so Test reads the draft as it stands. */
  const readyForTest = useCallback(async (pieceId: string) => {
    await flushRef.current?.()
    router.push(`/write/test?node_id=${pieceId}`)
  }, [router])

  const boardActions: BoardActions = useMemo(() => ({
    openPiece: (id, from) => goNode(id, from),
    beginWriting: (id) => router.push(`/write?node_id=${id}`),
    addPiece: () => void api.addNode(null),
    removePiece: (piece) => void removeNode(piece),
    renamePiece: (id, title) => void api.editNode(id, { title }),
    reorder: (ids) => void api.reorderRoots(ids),
    movePiece: (id, at) => void api.editNode(id, { board_x: at?.x ?? null, board_y: at?.y ?? null }),
    addThread: (hue) => api.addThread(hue),
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
  }), [api, goNode, goThread, makeConstraint, removeNode, roots, router, setProjectField, tree.threads])

  // A project with exactly one piece and nothing running across it yet has
  // nothing for the board to show — skip straight to the writing. Derived,
  // not persisted (idea-lab-trajectory-layer convention): the moment a second
  // root piece is added via the board's own "add a piece" affordance, this
  // stops matching and the next load falls back to the board on its own.
  //
  // "Create a project from this piece" sets settings.board, which turns the
  // skip off for good: the one piece shows as a card, ready for more.
  const lonePiece = roots.length === 1 && roots[0].threads.length === 0 && !project?.settings?.board
    ? roots[0]
    : null
  const singlePieceNode = focus.kind === 'project' ? lonePiece : null
  // While the piece is alone, "the project" would only bounce back here —
  // so up goes to the shelf instead.
  const goUp = useCallback(() => (lonePiece ? goShelf() : goProject()), [lonePiece, goShelf, goProject])
  const [makingProject, setMakingProject] = useState(false)
  const makeProject = useCallback(async () => {
    if (!project) return
    setMakingProject(true)
    await api.editProject({ settings: { board: true } })
    goProject()
  }, [api, goProject, project])
  useEffect(() => {
    if (state.status !== 'ready' || !singlePieceNode) return
    router.replace(`/p/${projectId}/n/${singlePieceNode.id}`)
  }, [state.status, singlePieceNode, projectId, router])

  // ── loading and error ─────────────────────────────────────────────────────
  if (state.status === 'loading') {
    return (
      <>
        <CanvasStage header={<StageHeader title="Opening…" onUp={goShelf} upLabel={`Back to ${LEVELS.shelf.name}`} />}>
          <span />
        </CanvasStage>
        <Dock />
      </>
    )
  }
  if (state.status === 'error' || !project) {
    return (
      <PageShell mood="neutral">
        <PageHeader eyebrow={null} title="It did not open" size="md" />
        <Container padding={32}>
          <p style={{ ...canvasType.body, color: t.textSecondary, margin: '0 0 16px' }}>
            {state.status === 'error' ? state.message : 'The project is missing.'}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <QuietButton onClick={() => void api.reload()}>Try again</QuietButton>
            <GhostButton onClick={() => router.push('/project-board')}>Back to the project board</GhostButton>
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
  const savingMark = saving ? 'Saving…' : null

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
    <>
    <Drawer open={rail !== null} title={railTitle} onClose={() => setRail(null)}>
      {rail === 'intent' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <InlineField
            ariaLabel="What this is for"
            value={scopeIntent}
            placeholder={scopeNode ? 'Say what this part has to do…' : 'Say what the whole project is, and what it has to do…'}
            multiline
            disabled={readOnly}
            onCommit={setScopeIntent}
            style={{ ...canvasType.conceptBody, color: t.textPrimary }}
          />

          {scopeNode && parent && (parent.intent || parent.title) && (
            <div style={{ borderLeft: `2px solid ${alpha(t.violet, 0.5)}`, paddingLeft: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Label style={{ color: alpha(t.violet, 0.9) }}>It owes {parent.title || 'the part above'}</Label>
              {parent.intent && <p style={{ ...canvasType.small, color: t.textSecondary, margin: 0 }}>{parent.intent}</p>}
              <InlineField
                ariaLabel="The beat this part carries"
                value={scopeNode.beat}
                placeholder="What it has to do here…"
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
                Stands whole on its own
              </span>
            </label>
          )}

          {scopeNode && !readOnly && (
            <div style={{ borderTop: `1px solid ${alpha(t.textPrimary, 0.08)}`, paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <GhostButton size="sm" onClick={() => void runCheck(scopeNode.id)} disabled={checking}>
                {checking ? 'Reading…' : 'Check it against the rules'}
              </GhostButton>
              <button
                type="button"
                onClick={() => void removeNode(scopeNode)}
                style={{ ...canvasType.chip, color: t.textMuted, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                Delete this part
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

      {rail === 'concept' && scopeNode && <ConceptPanel node={scopeNode} projectId={projectId} />}

      {rail === 'anchors' && scopeNode && (
        <AnchorsPanel
          lines={tools.lines}
          parts={scopeNode.children.map((c, i) => ({ id: c.id, label: c.title || `Part ${i + 1}` }))}
          onAdd={(text) => tools.addLine(text)}
          onRemove={(id) => void tools.removeLine(id)}
        />
      )}

      {rail === 'tasks' && (
        <TasksPanel tasks={tools.tasks} onToggle={(task) => void tools.toggleTask(task)} onAdd={tools.addTask} />
      )}

      {rail === 'companion' && (
        <Companion
          projectId={projectId}
          nodeId={scopeNode?.id ?? null}
          scope={scopeNode ? (scopeNode.title || 'this part') : 'the whole project'}
          canSuggest={!!scopeNode}
          selection={scopeNode && selection?.nodeId === scopeNode.id ? selection : null}
          onClearSelection={() => setSelection(null)}
          lockedUntil={lockedUntil}
          onRequestLock={() => setLockModalOpen(true)}
          onProposedEdit={setProposal}
          disabled={readOnly}
        />
      )}
    </Drawer>
    <LockModal
      open={lockModalOpen}
      busy={locking}
      onClose={() => setLockModalOpen(false)}
      onConfirm={(minutes) => void confirmLock(minutes)}
    />
    </>
  )

  // ── level 2: the board ────────────────────────────────────────────────────
  if (focus.kind === 'project' && singlePieceNode) {
    // Redirecting (see the effect above) — render nothing board-shaped in
    // the meantime so it never flashes before the writing view takes over.
    return (
      <>
        <CanvasStage header={<StageHeader title="Opening…" onUp={goShelf} upLabel={`Back to ${LEVELS.shelf.name}`} />}>
          <span />
        </CanvasStage>
        <Dock />
      </>
    )
  }
  if (focus.kind === 'project') {
    return (
      <>
        <CanvasStage
          mood="ember"
          intensity={0.6}
          header={
            <StageHeader
              onUp={(el) => goShelf(el)}
              upLabel={`Back to ${LEVELS.shelf.name}`}
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
              conceptualisation_log: project.conceptualisation_log,
              // Started via "Skip straight to writing": offer the core concept later.
              coreConceptHref: roots.length > 0 && !roots[0].core_truth ? `/idea-lab/core-concept?project=${projectId}` : null,
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
        <Dock />
        {companionDrawer}
      </>
    )
  }

  // ── level 1: the writing (and the filtered read of one thread) ────────────
  const headerTitle =
    focus.kind === 'thread' ? thread?.name || 'A thread'
    : node?.title || 'Untitled'

  const isLone = !!node && lonePiece?.id === node.id
  const words = node ? (node.children.length > 0 ? node.children.reduce((n, c) => n + wordCount(c.body), 0) : wordCount(node.body)) : 0
  const pendingTasks = tools.tasks.filter((x) => isWritingTask(x) && x.status === 'pending').length

  return (
    <PageShell mood="tide">
      <PageHeader
        eyebrow={null}
        title={headerTitle}
        size="md"
        actions={
          <span
            aria-live="polite"
            style={{ ...canvasType.chip, color: shell.muted, opacity: saving ? 1 : 0, transition: 'opacity 160ms ease' }}
          >
            Saving…
          </span>
        }
        back={goUp}
      />

      <Container
        padding={26}
        style={{
          paddingRight: rail && roomBeside ? 478 : 70,
          transition: 'padding-right 200ms ease',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Piece controls sit here, not in the header, so the title keeps its room on a phone. */}
          <style>{`
            .piece-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }
            .piece-bar-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
            .piece-bar-actions { display: flex; flex-wrap: wrap; gap: 8px; }
            /* On a phone the view switch stays beside the trail and the buttons drop to their own row. */
            @media (max-width: 719px) {
              .piece-bar-tools { display: contents; }
              .piece-bar-switch { order: 1; margin-left: auto; }
              .piece-bar-actions { order: 2; flex-basis: 100%; }
            }
          `}</style>
          <div className="piece-bar">
            <Trail
              steps={focus.kind === 'node' ? trail : []}
              onGo={(id) => goNode(id)}
              projectTitle={project.title}
              onGoProject={goUp}
            />
            {focus.kind === 'node' && node && (
              <div className="piece-bar-tools">
                {isLone && (
                  <div className="piece-bar-actions">
                    <GhostButton size="sm" onClick={() => void makeProject()} loading={makingProject} loadingLabel="Creating…">
                      Create a project from this piece
                    </GhostButton>
                  </div>
                )}
                <div className="piece-bar-switch">
                  <ViewSwitch view={view} onChange={setView} />
                </div>
              </div>
            )}
          </div>

          {checks}
          {checkNote && <p style={{ ...canvasType.small, color: t.textMuted, margin: 0 }}>{checkNote}</p>}

          {focus.kind === 'node' && node && (
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
              onReorder={(ids) => void api.reorder(node.id, ids)}
              onEditBeat={(id, beat) => void api.editNode(id, { beat })}
              onOpenThread={goThread}
              onFinished={() => goProject()}
              onSelectionChange={setSelection}
              proposal={proposal}
              onProposalHandled={() => setProposal(null)}
              lines={tools.lines}
              onAddLine={(text, partId) => void tools.addLine(text, partId)}
              onRemoveLine={(id) => void tools.removeLine(id)}
              flushRef={flushRef}
              disabled={readOnly}
            />
          )}
          {focus.kind === 'node' && node && isRootPiece && (
            <PieceFooter
              projectId={projectId}
              nodeId={node.id}
              words={words}
              canShape={!readOnly && node.children.length === 0 && words === 0 && !!(node.emotional_journey || node.core_truth || node.intent)}
              canDivide={!readOnly && words > 30 && !node.children.some((c) => c.is_locked)}
              sectioned={node.children.length > 0}
              busy={shaping}
              note={shapeNote}
              onShape={() => void reshape('shape', node.id)}
              onDivide={() => void reshape('divide', node.id, node.children.length > 0)}
              onReady={() => void readyForTest(node.id)}
            />
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
        tools={isRootPiece ? undefined : PART_TOOLS}
        counts={{ rules: liveRuleCount, anchors: tools.lines.length, tasks: pendingTasks }}
      />
      {companionDrawer}
    </PageShell>
  )
}

/** write · flow, the two ways to read a piece — each its own colour when
 *  active, the same two hues the rest of the studio already uses for the
 *  same ideas: tide for the words themselves, verdant for a finished,
 *  settled read. The map used to be a third option here; it is a standing
 *  part of the writing view now (section-dock.tsx), not a place you switch
 *  away to. */
function ViewSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const { t } = useTheme()
  const options: Array<{ key: View; label: string; tone: string }> = [
    { key: 'write', label: 'Write', tone: t.tide },
    { key: 'flow', label: 'Flow', tone: t.verdant },
  ]
  return (
    <div
      role="group"
      aria-label="How to look at this"
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
            background: view === o.key ? alpha(o.tone, 0.16) : 'transparent',
            color: view === o.key ? o.tone : t.textMuted,
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
