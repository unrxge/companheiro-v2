// src/lib/studio/work-api.ts — typed fetch wrappers for the node tree.

import { ApiError } from '@/lib/studio/api-client'
import type {
  CheckOutcome, CreateNodeRequest, CreateThreadRequest, PatchNodeRequest, PatchThreadRequest,
  RuleCheck, Thread, ThreadTag, TreePayload, WorkNode,
} from '@/lib/studio/node-types'
import type { PatchProjectRequest, Project } from '@/lib/studio/types'

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/studio${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  if (!res.ok) {
    let message = res.statusText || `http ${res.status}`
    try {
      const parsed = (await res.json()) as { error?: unknown }
      if (typeof parsed?.error === 'string') message = parsed.error
    } catch {
      /* keep the status text */
    }
    throw new ApiError(res.status, message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const work = {
  tree: (projectId: string) => call<{ project: Project; tree: TreePayload }>('GET', `/projects/${projectId}/tree`),
  patchProject: (projectId: string, body: PatchProjectRequest) =>
    call<{ project: Project }>('PATCH', `/projects/${projectId}`, body),

  createNode: (projectId: string, body: CreateNodeRequest) =>
    call<{ node: WorkNode }>('POST', `/projects/${projectId}/nodes`, body),
  patchNode: (nodeId: string, body: PatchNodeRequest) =>
    call<{ node: WorkNode }>('PATCH', `/nodes/${nodeId}`, body),
  deleteNode: (nodeId: string) => call<void>('DELETE', `/nodes/${nodeId}`),
  reorder: (parentId: string, ids: string[]) =>
    call<{ nodes: WorkNode[] }>('POST', `/nodes/${parentId}/reorder`, { ids }),
  reorderRoots: (projectId: string, ids: string[]) =>
    call<{ nodes: WorkNode[] }>('POST', `/projects/${projectId}/nodes/reorder`, { ids }),

  createThread: (projectId: string, body: CreateThreadRequest) =>
    call<{ thread: Thread }>('POST', `/projects/${projectId}/threads`, body),
  patchThread: (threadId: string, body: PatchThreadRequest) =>
    call<{ thread: Thread }>('PATCH', `/threads/${threadId}`, body),
  deleteThread: (threadId: string) => call<void>('DELETE', `/threads/${threadId}`),

  tag: (nodeId: string, threadId: string, note = '') =>
    call<{ tag: ThreadTag }>('PUT', `/nodes/${nodeId}/threads/${threadId}`, { note }),
  untag: (nodeId: string, threadId: string) =>
    call<void>('DELETE', `/nodes/${nodeId}/threads/${threadId}`),

  check: (nodeId: string) =>
    call<{ checks: RuleCheck[]; reason?: string }>('POST', `/nodes/${nodeId}/check`),
  resolveCheck: (checkId: string, outcome: CheckOutcome, note?: string) =>
    call<{ check: RuleCheck }>('PATCH', `/checks/${checkId}`, { outcome, note }),
}
