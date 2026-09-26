// src/lib/studio/tree.ts — pure helpers over the node tree.
// No React, no fetch: everything here is testable on its own.

import type { Appearance, Rule, ThreadTag, TreeNode, WorkNode } from '@/lib/studio/node-types'

/** Builds the tree from flat rows. Orphans (parent deleted mid-flight) are
 *  lifted to the top rather than dropped, so nothing ever disappears. */
export function buildTree(nodes: WorkNode[], tags: ThreadTag[] = [], threadOrder: string[] = []): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  const threadsFor = new Map<string, string[]>()

  for (const tag of tags) {
    const list = threadsFor.get(tag.node_id) ?? []
    list.push(tag.thread_id)
    threadsFor.set(tag.node_id, list)
  }
  const rank = new Map(threadOrder.map((id, i) => [id, i]))

  for (const n of nodes) {
    const ids = (threadsFor.get(n.id) ?? []).sort(
      (a, b) => (rank.get(a) ?? 1e9) - (rank.get(b) ?? 1e9),
    )
    byId.set(n.id, { ...n, children: [], depth: 0, threads: ids })
  }

  const roots: TreeNode[] = []
  for (const n of byId.values()) {
    const parent = n.parent_id ? byId.get(n.parent_id) : undefined
    if (parent) parent.children.push(n)
    else roots.push(n)
  }

  const sortRec = (list: TreeNode[], depth: number) => {
    list.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
    for (const n of list) {
      n.depth = depth
      sortRec(n.children, depth + 1)
    }
  }
  sortRec(roots, 0)
  return roots
}

export function findNode(roots: TreeNode[], id: string): TreeNode | null {
  for (const n of roots) {
    if (n.id === id) return n
    const hit = findNode(n.children, id)
    if (hit) return hit
  }
  return null
}

/** Root → node, inclusive. Empty when the node is not in the tree. */
export function pathTo(roots: TreeNode[], id: string): TreeNode[] {
  const walk = (list: TreeNode[], trail: TreeNode[]): TreeNode[] | null => {
    for (const n of list) {
      const next = [...trail, n]
      if (n.id === id) return next
      const hit = walk(n.children, next)
      if (hit) return hit
    }
    return null
  }
  return walk(roots, []) ?? []
}

/** Depth-first, parents before children — the order a work is read in. */
export function flatten(roots: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      out.push(n)
      walk(n.children)
    }
  }
  walk(roots)
  return out
}

/** Leaves under a node, in reading order. A node with no children is its own leaf. */
export function leavesOf(node: TreeNode): TreeNode[] {
  if (node.children.length === 0) return [node]
  return node.children.flatMap(leavesOf)
}

/** Every rule in force for a node: its own, plus every ancestor's, nearest first.
 *  Retired rules are left out. */
export function rulesInForce(
  roots: TreeNode[],
  nodeId: string,
): Array<{ rule: Rule; source: TreeNode; inherited: boolean }> {
  const path = pathTo(roots, nodeId)
  if (path.length === 0) return []
  const out: Array<{ rule: Rule; source: TreeNode; inherited: boolean }> = []
  for (let i = path.length - 1; i >= 0; i--) {
    const source = path[i]
    for (const rule of source.rules ?? []) {
      if (rule.retired_at) continue
      out.push({ rule, source, inherited: i < path.length - 1 })
    }
  }
  return out
}

/** Words in Tiptap HTML. Cheap and good enough for the extent axis. */
export function wordCount(html: string): number {
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
  const words = text.trim().split(/\s+/).filter(Boolean)
  return words.length
}

/** Extent of a node: its own words, or the sum of everything under it. */
export function extentOf(node: TreeNode): number {
  if (node.children.length === 0) return node.extent
  return node.children.reduce((sum, c) => sum + extentOf(c), 0)
}

/** Proportional widths for the storyline, floored so a short part stays legible. */
export function storylineShares(nodes: TreeNode[], minShare = 0.06): number[] {
  const extents = nodes.map((n) => Math.max(extentOf(n), 1))
  const total = extents.reduce((a, b) => a + b, 0)
  if (total <= 0) return nodes.map(() => 1 / Math.max(nodes.length, 1))
  const raw = extents.map((e) => e / total)
  const lifted = raw.map((r) => Math.max(r, minShare))
  const liftedTotal = lifted.reduce((a, b) => a + b, 0)
  return lifted.map((r) => r / liftedTotal)
}

export function newRule(text: string): Rule {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? `r-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    text: text.trim(),
    created_at: new Date().toISOString(),
    retired_at: null,
  }
}


/** Every place a thread shows up, in reading order, with the trail down to it. */
export function appearancesOf(roots: TreeNode[], threadId: string): Appearance[] {
  const out: Appearance[] = []
  const walk = (list: TreeNode[], trail: string[], rootId: string | null) => {
    for (const n of list) {
      const here = [...trail, n.title || 'untitled']
      const root = rootId ?? n.id
      if (n.threads.includes(threadId)) {
        out.push({ node: n, trail: here, rootId: root, direct: true })
      }
      walk(n.children, here, root)
    }
  }
  walk(roots, [], null)
  return out
}

/** Words under a list of nodes — the storyline header's total. */
export function sumExtent(nodes: TreeNode[]): number {
  return nodes.reduce((sum, n) => sum + extentOf(n), 0)
}

/** Tiptap HTML → readable plain text. Block ends become paragraph breaks so a
 *  preview does not run two sentences together. */
export function plainText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|blockquote|pre)>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&(?:quot|#34);/g, '"')
    .replace(/&(?:#39|apos|rsquo);/g, '’')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** What a piece looks like from the board: the words themselves, in reading
 *  order, from however deep they live. Never a summary — the person's own
 *  opening is the only honest preview of what they have. */
export function previewOf(node: TreeNode, max = 1200): string {
  const text = leavesOf(node).map((n) => plainText(n.body)).filter(Boolean).join('\n\n')
  return text.length > max ? `${text.slice(0, max)}…` : text
}
