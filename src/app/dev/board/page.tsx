'use client'

// src/app/dev/board/page.tsx — a harness for the board, development only
// (it renders nothing in a production build).
//
// The board is three clicks behind a login and a project, which makes a purely
// visual change to it awkward to see. This mounts the real <Board /> over
// in-memory state so threads can be made, named, moved and deleted without a
// session or a database. Nothing here is imported by the app.

import { useCallback, useMemo, useState } from 'react'
import { Board, type BoardActions, type BoardProject } from '@/components/studio/work/board'
import type { Appearance, Thread, ThreadHue, ThreadTag, TreeNode } from '@/lib/studio/node-types'

const USER = 'dev-user'
const PROJECT = 'dev-project'
const NOW = '2026-10-01T09:00:00.000Z'

function piece(id: string, title: string, position: number): TreeNode {
  return {
    id, user_id: USER, project_id: PROJECT, parent_id: null, position,
    title, intent: '', beat: '', stands_whole: false, rules: [], body: '',
    extent: 0, status: 'open', board_x: null, board_y: null,
    writing_ethos: null, emotional_journey: null, core_truth: null,
    substack_goals: null, short_form_goals: null, open_threads: null,
    short_form_script: null, is_locked: false,
    created_at: NOW, updated_at: NOW,
    children: [], depth: 0, threads: [],
  } as TreeNode
}

export default function DevBoardPage() {
  const [pieces, setPieces] = useState<TreeNode[]>(() => [
    piece('p1', 'The kitchen', 0),
    piece('p2', 'His hands', 1),
    piece('p3', 'The last meal', 2),
  ])
  const [threads, setThreads] = useState<Thread[]>([])
  const [tags, setTags] = useState<ThreadTag[]>([])

  const project: BoardProject = useMemo(() => ({
    title: "My father's kitchen",
    intent: 'An essay that is allowed to stay unresolved.',
    rules: [],
    vision_x: null,
    vision_y: null,
  }), [])

  const tagFor = useCallback(
    (nodeId: string, threadId: string) => tags.find((t) => t.node_id === nodeId && t.thread_id === threadId),
    [tags],
  )

  const appearancesFor = useCallback((threadId: string): Appearance[] =>
    tags
      .filter((t) => t.thread_id === threadId)
      .map((t) => {
        const node = pieces.find((p) => p.id === t.node_id)
        return node ? { node, trail: [node.title], rootId: node.id, direct: true } : null
      })
      .filter((a): a is Appearance => a !== null),
  [tags, pieces])

  const actions: BoardActions = useMemo(() => ({
    openPiece: () => {},
    addPiece: () => setPieces((ps) => [...ps, piece(`p${ps.length + 1}`, '', ps.length)]),
    removePiece: (p) => setPieces((ps) => ps.filter((x) => x.id !== p.id)),
    renamePiece: (id, title) => setPieces((ps) => ps.map((p) => (p.id === id ? { ...p, title } : p))),
    reorder: () => {},
    movePiece: (id, at) => setPieces((ps) => ps.map((p) => (p.id === id ? { ...p, board_x: at?.x ?? null, board_y: at?.y ?? null } : p))),
    addThread: async (hue?: ThreadHue) => {
      const made: Thread = {
        id: `t${Math.random().toString(36).slice(2, 8)}`,
        user_id: USER, project_id: PROJECT, position: 0,
        name: '', intent: '', rules: [], hue: hue ?? 'ember',
        board_x: null, board_y: null, created_at: NOW, updated_at: NOW,
      }
      setThreads((ts) => [...ts, made])
      return made
    },
    editThread: (id, patch) => setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t))),
    removeThread: (id) => {
      setThreads((ts) => ts.filter((t) => t.id !== id))
      setTags((xs) => xs.filter((x) => x.thread_id !== id))
    },
    moveThread: (id, at) => setThreads((ts) => ts.map((t) => (t.id === id ? { ...t, board_x: at?.x ?? null, board_y: at?.y ?? null } : t))),
    tag: (nodeId, threadId, note = '') =>
      setTags((xs) => (xs.some((x) => x.node_id === nodeId && x.thread_id === threadId)
        ? xs
        : [...xs, { node_id: nodeId, thread_id: threadId, note }])),
    untag: (nodeId, threadId) => setTags((xs) => xs.filter((x) => !(x.node_id === nodeId && x.thread_id === threadId))),
    makeConstraint: (thread) => setThreads((ts) => ts.filter((t) => t.id !== thread.id)),
    readThread: () => {},
    renameProject: () => {},
    editProjectIntent: () => {},
    editProjectRules: () => {},
    moveVision: () => {},
    tidyBoard: () => {
      setPieces((ps) => ps.map((p) => ({ ...p, board_x: null, board_y: null })))
      setThreads((ts) => ts.map((t) => ({ ...t, board_x: null, board_y: null })))
    },
  }), [])

  if (process.env.NODE_ENV === 'production') return null

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Board
        project={project}
        pieces={pieces}
        threads={threads}
        checks={[]}
        onResolveCheck={() => {}}
        onAmendCheck={() => {}}
        tagFor={tagFor}
        appearancesFor={appearancesFor}
        actions={actions}
      />
    </div>
  )
}
