// src/lib/studio/api-client.ts — typed fetch wrappers for every route
// in section 4, including routes other lanes build. Streaming routes return the
// Response so the caller can readTextStream() it. Non-2xx → ApiError.

import type {
  AnyBlock, ArrivalActionRequest, Asset, AssetView, BlocksBatchRequest, BlocksBatchResponse,
  Catch, CatchMarkRequest, CommitAssetRequest, CompassDecideRequest, CompassEntry, ConceptRevision,
  CreateLinkRequest, CreateProjectRequest, Draft, DraftChatRequest, DraftConceptRequest,
  DraftConceptResponse, DraftKind, DraftSection, DraftSummary, Link, PatchProjectRequest, Posture,
  Project, ProjectBundle, ShelfProject, SignUploadRequest, SignUploadResponse, SincePayload,
  StrikeRequest, TalkEntry, TalkKind, TalkRequest,
} from '@/lib/studio/types'

export const API_BASE = '/api/studio'

export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export interface RequestOptions {
  /** `fetch(..., { keepalive: true })` for pagehide / hidden flushes (D-030). */
  keepalive?: boolean
  signal?: AbortSignal
  /** Alternative fetch (tests, autosave). */
  fetchImpl?: typeof fetch
}

async function errorFrom(res: Response): Promise<ApiError> {
  let message = res.statusText || `http ${res.status}`
  try {
    const text = await res.text()
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: unknown }
        if (parsed && typeof parsed.error === 'string') message = parsed.error
      } catch {
        message = text.slice(0, 200)
      }
    }
  } catch {
    // keep the status text
  }
  return new ApiError(res.status, message)
}

/** Sends JSON (as text/plain when keepalive, so the body survives page teardown) and returns the raw Response. `path` is relative to /api/studio unless it starts with /api/. */
export async function send(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<Response> {
  const f = opts.fetchImpl ?? fetch
  const init: RequestInit = {
    method,
    headers: body === undefined ? {} : { 'Content-Type': opts.keepalive ? 'text/plain;charset=UTF-8' : 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    keepalive: opts.keepalive ?? false,
    signal: opts.signal,
    credentials: 'same-origin',
  }
  const res = await f(path.startsWith('/api/') ? path : `${API_BASE}${path}`, init)
  if (!res.ok) throw await errorFrom(res)
  return res
}

async function json<T>(method: string, path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  const res = await send(method, path, body, opts)
  if (res.status === 204) return undefined as unknown as T
  return (await res.json()) as T
}

const q = (params: Record<string, string | number | null | undefined>): string => {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') usp.set(k, String(v))
  const s = usp.toString()
  return s ? `?${s}` : ''
}

export const api = {
  projects: {
    list: () => json<{ projects: ShelfProject[] }>('GET', '/projects'),
    create: (req: CreateProjectRequest) => json<{ bundle: ProjectBundle }>('POST', '/projects', req),
    get: (id: string) => json<{ bundle: ProjectBundle }>('GET', `/projects/${id}`),
    patch: (id: string, req: PatchProjectRequest, opts?: RequestOptions) => json<{ project: Project }>('PATCH', `/projects/${id}`, req, opts),
    delete: (id: string) => json<void>('DELETE', `/projects/${id}`),
    open: (id: string) => json<{ since: SincePayload }>('POST', `/projects/${id}/open`),
    since: (id: string, opts?: RequestOptions) => json<{ since: SincePayload }>('GET', `/projects/${id}/since`, undefined, opts),
    draftConcept: (req: DraftConceptRequest) => json<DraftConceptResponse>('POST', '/projects/draft-concept', req),
  },

  concept: {
    save: (projectId: string, body: string, constraints: string[]) =>
      json<{ revision: ConceptRevision }>('POST', `/projects/${projectId}/concept`, { body, constraints }),
    revisions: (projectId: string) => json<{ revisions: ConceptRevision[] }>('GET', `/projects/${projectId}/concept/revisions`),
  },

  blocks: {
    batch: (projectId: string, req: BlocksBatchRequest, opts?: RequestOptions) =>
      json<BlocksBatchResponse>('PATCH', `/projects/${projectId}/blocks`, req, opts),
    create: (projectId: string, block: AnyBlock) => json<{ block: AnyBlock }>('POST', `/projects/${projectId}/blocks`, { block }),
    strike: (projectId: string, blockId: string, req: StrikeRequest) =>
      json<{ block: AnyBlock }>('POST', `/projects/${projectId}/blocks/${blockId}/strike`, req),
    unstrike: (projectId: string, blockId: string) => json<{ block: AnyBlock }>('DELETE', `/projects/${projectId}/blocks/${blockId}/strike`),
    arrival: (projectId: string, blockId: string, req: ArrivalActionRequest) =>
      json<{ block: AnyBlock; compass_entry?: CompassEntry }>('POST', `/projects/${projectId}/blocks/${blockId}/arrival`, req),
  },

  links: {
    create: (projectId: string, req: CreateLinkRequest) => json<{ link: Link }>('POST', `/projects/${projectId}/links`, req),
    delete: (projectId: string, linkId: string) => json<void>('DELETE', `/projects/${projectId}/links/${linkId}`),
    word: (projectId: string, linkId: string, word: string | null) =>
      json<{ link: Link }>('PATCH', `/projects/${projectId}/links/${linkId}`, { word }),
  },

  compass: {
    list: (projectId: string) => json<{ entries: CompassEntry[]; catches: Catch[] }>('GET', `/projects/${projectId}/compass`),
    decide: (entryId: string, req: CompassDecideRequest) => json<{ entry: CompassEntry }>('POST', `/compass/${entryId}`, req),
  },

  talk: {
    /** Streams text/plain; read it with readTextStream<TalkMeta>(). */
    send: (projectId: string, req: TalkRequest, opts?: RequestOptions) => send('POST', `/projects/${projectId}/talk`, req, opts),
    history: (projectId: string, params: { kind: TalkKind; before?: string; limit?: number } = { kind: 'talk' }) =>
      json<{ entries: TalkEntry[] }>('GET', `/projects/${projectId}/talk${q({ kind: params.kind, before: params.before, limit: params.limit })}`),
  },

  catches: {
    mark: (catchId: string, req: CatchMarkRequest) => json<{ catch: Catch }>('POST', `/catches/${catchId}`, req),
  },

  drafts: {
    create: (projectId: string, req: { title?: string; kind?: DraftKind; x?: number; y?: number } = {}) =>
      json<{ draft: DraftSummary; block: AnyBlock }>('POST', `/projects/${projectId}/drafts`, req),
    get: (draftId: string) => json<{ draft: Draft; sections: DraftSection[]; anchors: string[] }>('GET', `/drafts/${draftId}`),
    patch: (draftId: string, req: { title?: string; posture?: Posture; kind?: DraftKind }) =>
      json<{ draft: Draft }>('PATCH', `/drafts/${draftId}`, req),
    delete: (draftId: string) => json<void>('DELETE', `/drafts/${draftId}`),
    putSections: (draftId: string, sections: Array<Pick<DraftSection, 'id' | 'position' | 'label' | 'content' | 'is_locked'>>, opts?: RequestOptions) =>
      json<{ sections: DraftSection[] }>('PUT', `/drafts/${draftId}/sections`, { sections }, opts),
    /** Streams text/plain; meta `{ proposed_edit: string | null, truncated }`. */
    chat: (draftId: string, req: DraftChatRequest, opts?: RequestOptions) => send('POST', `/drafts/${draftId}/chat`, req, opts),
  },

  assets: {
    sign: (req: SignUploadRequest) => json<SignUploadResponse>('POST', '/assets/sign', req),
    commit: (req: CommitAssetRequest) => json<{ asset: AssetView }>('POST', '/assets/commit', req),
    patch: (assetId: string, req: { own_voice?: boolean; transcript?: string | null }) =>
      json<{ asset: AssetView | Asset }>('PATCH', `/assets/${assetId}`, req),
    url: (assetId: string) => json<{ url: string; thumb_url: string | null }>('GET', `/assets/${assetId}/url`),
  },

  punctuate: (text: string, context?: string) => json<{ text: string }>('POST', '/api/punctuate', { text, context }),
} as const

export type Api = typeof api
