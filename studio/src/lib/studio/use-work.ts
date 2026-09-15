'use client'

// studio/src/lib/studio/use-work.ts — the whole work in one hook: loads the
// tree once, then applies every edit locally first so nothing on screen waits
// for a round trip. A failed write reloads rather than guessing.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { work } from '@/lib/studio/work-api'
import type {
  CheckOutcome, Rule, RuleCheck, Thread, ThreadHue, ThreadTag, TreePayload, WorkNode,
} from '@/lib/studio/node-types'
import type { Project } from '@/lib/studio/types'
import { buildTree, wordCount } from '@/lib/studio/tree'

export type WorkState =
  | { status: 'loading' }
  | { status: 'error'; message: string; code: number }
  | { status: 'ready' }

const EMPTY: TreePayload = { nodes: [], threads: [], tags: [], open_checks: [] }

export function useWork(projectId: string) {
  const [state, setState] = useState<WorkState>({ status: 'loading' })
  const [project, setProject] = useState<Project | null>(null)
  const [tree, setTree] = useState<TreePayload>(EMPTY)
  const [saving, setSaving] = useState(0)
  const alive = useRef(true)

  // Set on the way in as well as the way out: React remounts this in dev, and
  // a ref that is only ever turned off stays off, which silently swallows
  // every load that follows and leaves the page saying "opening…" forever.
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])

  const load = useCallback(async () => {
    setState({ status: 'loading' })
    try {
      const res = await work.tree(projectId)
      if (!alive.current) return
      setProject(res.project)
      setTree(res.tree)
      setState({ status: 'ready' })
    } catch (e) {
      if (!alive.current) return
      const code = typeof (e as { status?: number }).status === 'number' ? (e as { status: number }).status : 0
      setState({
        status: 'error',
        code,
        message:
          code === 401 ? 'sign in again to open this'
          : code === 404 ? 'nothing here — it may have been deleted'
          : 'it did not open',
      })
    }
  }, [projectId])

  useEffect(() => { void load() }, [load])

  /** Runs a write, keeping a saving count so the shell can say so. Rolls the
   *  whole tree back by reloading if the server refuses. */
  const guard = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setSaving((n) => n + 1)
    try {
      return await fn()
    } catch {
      await load()
      return null
    } finally {
      if (alive.current) setSaving((n) => Math.max(0, n - 1))
    }
  }, [load])

  const roots = useMemo(
    () => buildTree(tree.nodes, tree.tags, tree.threads.map((t) => t.id)),
    [tree],
  )

  const patchLocal = useCallback((id: string, patch: Partial<WorkNode>) => {
    setTree((prev) => ({ ...prev, nodes: prev.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }))
  }, [])

  const api = useMemo(() => ({
    reload: load,

    addNode: async (parentId: string | null, afterId?: string | null) => {
      const res = await guard(() => work.createNode(projectId, { parent_id: parentId, after_id: afterId ?? null }))
      if (!res) return null
      setTree((prev) => ({ ...prev, nodes: [...prev.nodes, res.node] }))
      return res.node
    },

    editNode: async (id: string, patch: Partial<WorkNode>) => {
      const next = { ...patch }
      if (typeof next.body === 'string') next.extent = wordCount(next.body)
      patchLocal(id, next)
      await guard(() => work.patchNode(id, {
        title: patch.title, intent: patch.intent, beat: patch.beat,
        stands_whole: patch.stands_whole, body: patch.body, status: patch.status,
        rules: patch.rules,
      }))
    },

    removeNode: async (id: string) => {
      const doomed = new Set<string>([id])
      let grew = true
      while (grew) {
        grew = false
        for (const n of tree.nodes) {
          if (n.parent_id && doomed.has(n.parent_id) && !doomed.has(n.id)) {
            doomed.add(n.id)
            grew = true
          }
        }
      }
      setTree((prev) => ({
        ...prev,
        nodes: prev.nodes.filter((n) => !doomed.has(n.id)),
        tags: prev.tags.filter((t) => !doomed.has(t.node_id)),
      }))
      await guard(() => work.deleteNode(id))
    },

    reorder: async (parentId: string, ids: string[]) => {
      setTree((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => {
          const at = ids.indexOf(n.id)
          return at === -1 ? n : { ...n, position: at }
        }),
      }))
      await guard(() => work.reorder(parentId, ids))
    },

    reorderRoots: async (ids: string[]) => {
      setTree((prev) => ({
        ...prev,
        nodes: prev.nodes.map((n) => {
          const at = ids.indexOf(n.id)
          return at === -1 || n.parent_id !== null ? n : { ...n, position: at }
        }),
      }))
      await guard(() => work.reorderRoots(projectId, ids))
    },

    addThread: async () => {
      const res = await guard(() => work.createThread(projectId, {}))
      if (!res) return null
      setTree((prev) => ({ ...prev, threads: [...prev.threads, res.thread] }))
      return res.thread
    },

    editThread: async (id: string, patch: Partial<Thread>) => {
      setTree((prev) => ({ ...prev, threads: prev.threads.map((t) => (t.id === id ? { ...t, ...patch } : t)) }))
      await guard(() => work.patchThread(id, {
        name: patch.name, intent: patch.intent, hue: patch.hue as ThreadHue, rules: patch.rules as Rule[],
      }))
    },

    removeThread: async (id: string) => {
      setTree((prev) => ({
        ...prev,
        threads: prev.threads.filter((t) => t.id !== id),
        tags: prev.tags.filter((t) => t.thread_id !== id),
      }))
      await guard(() => work.deleteThread(id))
    },

    tag: async (nodeId: string, threadId: string, note = '') => {
      setTree((prev) => {
        const rest = prev.tags.filter((t) => !(t.node_id === nodeId && t.thread_id === threadId))
        return { ...prev, tags: [...rest, { node_id: nodeId, thread_id: threadId, note }] }
      })
      await guard(() => work.tag(nodeId, threadId, note))
    },

    untag: async (nodeId: string, threadId: string) => {
      setTree((prev) => ({
        ...prev,
        tags: prev.tags.filter((t) => !(t.node_id === nodeId && t.thread_id === threadId)),
      }))
      await guard(() => work.untag(nodeId, threadId))
    },

    runCheck: async (nodeId: string) => {
      const res = await guard(() => work.check(nodeId))
      if (!res) return { checks: [] as RuleCheck[], reason: 'the check did not run' }
      if (res.checks.length) {
        setTree((prev) => ({ ...prev, open_checks: [...res.checks, ...prev.open_checks] }))
      }
      return res
    },

    resolveCheck: async (checkId: string, outcome: CheckOutcome, note?: string) => {
      setTree((prev) => ({ ...prev, open_checks: prev.open_checks.filter((c) => c.id !== checkId) }))
      await guard(() => work.resolveCheck(checkId, outcome, note))
    },
  }), [guard, load, patchLocal, projectId, tree.nodes])

  const tagFor = useCallback(
    (nodeId: string, threadId: string): ThreadTag | undefined =>
      tree.tags.find((t) => t.node_id === nodeId && t.thread_id === threadId),
    [tree.tags],
  )

  return { state, project, tree, roots, api, saving: saving > 0, tagFor }
}
