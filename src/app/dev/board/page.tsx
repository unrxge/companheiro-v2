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
import type { BoardItem, BoardItemKind, ProjectTask } from '@/lib/studio/board-items'
import type { AssetView } from '@/lib/studio/types'
import { PlanNote } from '@/components/billing/plan-note'

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

const TASKS: ProjectTask[] = [
  { id: 'k1', node_id: 'p1', title: 'Find the first line', type: 'creation', status: 'pending', is_writing_related: true },
  { id: 'k2', node_id: 'p1', title: 'Read it aloud once', type: 'creation', status: 'complete', is_writing_related: true },
  { id: 'k3', node_id: 'p1', title: 'Ask Ana for the photograph', type: 'execution', status: 'pending', is_writing_related: false },
  { id: 'k4', node_id: 'p2', title: 'Write the paragraph about the knife', type: 'creation', status: 'pending', is_writing_related: true },
]

function imageSizeOf(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => resolve({ width: 4, height: 3 })
    img.src = URL.createObjectURL(file)
  })
}

// ?plan=practice shows the canvas as Practice has it: no new threads, images or recordings.
export default function DevBoardPage() {
  const practice = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('plan') === 'practice'
  const [items, setItems] = useState<BoardItem[]>([])
  const [assets, setAssets] = useState<Record<string, AssetView>>({})
  const [tasks, setTasks] = useState<ProjectTask[]>(TASKS)
  const [locked, setLocked] = useState<string | null>(null)
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

  const actions: BoardActions = useMemo(() => {
    const make = (kind: BoardItemKind, pieceId: string, asset?: AssetView): BoardItem => {
      const made: BoardItem = {
        id: `i${Math.random().toString(36).slice(2, 8)}`, user_id: USER, project_id: PROJECT, kind,
        asset_id: asset?.id ?? null, node_ids: [pieceId], board_x: null, board_y: null, w: null, content: {},
        created_at: NOW, updated_at: NOW,
      }
      if (asset) setAssets((prev) => ({ ...prev, [asset.id]: asset }))
      setItems((prev) => [...prev, made])
      return made
    }
    const assetOf = (kind: 'image' | 'audio', file: Blob, extra: Partial<AssetView>): AssetView => ({
      id: `a${Math.random().toString(36).slice(2, 8)}`, project_id: PROJECT, kind, mime: file.type, bytes: file.size,
      width: null, height: null, duration_s: null, envelope: null, own_voice: false, transcript: null, created_at: NOW,
      url: URL.createObjectURL(file), thumb_url: null, ...extra,
    })
    return {
    openPiece: () => {},
    addPiece: (x) => setPieces((ps) => [...ps, { ...piece(`p${ps.length + 1}`, '', ps.length), board_x: x }]),
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
    addTaskList: async (pieceId) => make('tasks', pieceId),
    addPalette: async (pieceId) => make('palette', pieceId),
    addImage: async (pieceId, file) => make('image', pieceId, assetOf('image', file, await imageSizeOf(file))),
    addRecording: async (pieceId, file, opts) =>
      make('recording', pieceId, assetOf('audio', file, { duration_s: opts.seconds ?? 12, own_voice: opts.ownVoice })),
    patchItem: (id, patch) => setItems((xs) => xs.map((x) => (x.id === id
      ? { ...x, ...patch, content: patch.content ? { ...x.content, ...patch.content } : x.content }
      : x))),
    removeItem: (item) => setItems((xs) => xs.filter((x) => x.id !== item.id)),
    toggleTask: (task) => setTasks((ts) => ts.map((x) => (x.id === task.id ? { ...x, status: x.status === 'complete' ? 'pending' : 'complete' } : x))),
    addTask: async (nodeId, title, category) => setTasks((ts) => [...ts, { id: `t-${Date.now()}`, node_id: nodeId, title, type: 'creation', status: 'pending', is_writing_related: category === 'Writing', category }]),
    removeTask: (task) => setTasks((ts) => ts.filter((x) => x.id !== task.id)),
    reorderTasks: (ids) => setTasks((ts) => {
      const place = new Map(ids.map((id, at) => [id, at]))
      const touched = ts.filter((x) => place.has(x.id)).sort((a, b) => place.get(a.id)! - place.get(b.id)!)
      let next = 0
      return ts.map((x) => (place.has(x.id) ? touched[next++] : x))
    }),
    refreshAsset: () => {},
    onLocked: (choice) => setLocked(choice),
    }
  }, [])

  if (process.env.NODE_ENV === 'production') return null

  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Board
        project={project}
        pieces={pieces}
        threads={threads}
        items={items}
        assets={assets}
        tasks={tasks}
        tools={{ threads: !practice, media: !practice, items: true }}
        checks={[]}
        onResolveCheck={() => {}}
        onAmendCheck={() => {}}
        tagFor={tagFor}
        appearancesFor={appearancesFor}
        actions={actions}
      />
      {locked && (
        <PlanNote title="That comes with Direction" onClose={() => setLocked(null)}>
          <p style={{ margin: 0 }}>Asked for: {locked}.</p>
        </PlanNote>
      )}
    </div>
  )
}
