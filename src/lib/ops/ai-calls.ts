// Per-call record of every Claude request, for the owner's /admin page:
// which task ran, on what model, what it cost, and the SHAPE of what was
// sent (how big each system block was, how many turns of history, how long
// the newest message) — never the text itself. When one call costs ten times
// its route's usual, the shape is what says why: a 40-turn history, an
// uncached 30k-character system block, a reply cut off at max_tokens.
//
// Everything here is fire-and-forget: monitoring must never fail a request.
import { adminClient } from '@/lib/supabase/admin'
import { costMicros } from '@/lib/billing/fair-use'
import type { UsageLike } from '@/lib/usage-log'

type Block = { type?: string; text?: string; content?: unknown; cache_control?: unknown }
type Msg = { role?: string; content?: string | Block[] }
type ParamsLike = {
  model?: string
  max_tokens?: number
  system?: string | Block[]
  messages?: Msg[]
  tools?: unknown[]
}

export interface CallShape {
  /** characters in each system block, in order */
  sys: number[]
  /** characters in system blocks marked for prompt caching */
  sysCached: number
  /** prior messages sent as history (everything but the newest) */
  turns: number
  /** characters across those prior messages */
  history: number
  /** characters in the newest message */
  last: number
  /** whether any message carried a cache breakpoint */
  histCached: boolean
  /** non-text blocks (images, documents, tool results) */
  media: number
  tools: number
  max: number
}

function blockChars(content: unknown, onMedia: () => void, onCache: () => void): number {
  if (typeof content === 'string') return content.length
  if (!Array.isArray(content)) return 0
  let n = 0
  for (const b of content as Block[]) {
    if (!b || typeof b !== 'object') continue
    if (b.cache_control) onCache()
    if (typeof b.text === 'string') n += b.text.length
    else if (b.content !== undefined) n += blockChars(b.content, onMedia, onCache)
    else onMedia()
  }
  return n
}

export function describeRequest(params: ParamsLike): CallShape {
  let media = 0
  let histCached = false
  const sysBlocks: Block[] =
    typeof params.system === 'string' ? [{ text: params.system }] : Array.isArray(params.system) ? params.system : []
  const sys = sysBlocks.map((b) => (typeof b.text === 'string' ? b.text.length : 0))
  const sysCached = sysBlocks.reduce((n, b, i) => (b.cache_control ? n + sys[i] : n), 0)
  const messages = params.messages ?? []
  const sizes = messages.map((m) =>
    blockChars(m.content, () => media++, () => { histCached = true })
  )
  return {
    sys,
    sysCached,
    turns: Math.max(0, messages.length - 1),
    history: sizes.slice(0, -1).reduce((a, b) => a + b, 0),
    last: sizes.at(-1) ?? 0,
    histCached,
    media,
    tools: params.tools?.length ?? 0,
    max: params.max_tokens ?? 0,
  }
}

export interface CallInfo {
  requestedModel?: string
  durationMs?: number
  stopReason?: string | null
  shape?: CallShape
}

// Filled by the wrapped client (lib/anthropic.ts) when a non-streaming call
// resolves, keyed by the response's own usage object — the one thing every
// call site already passes to logUsage — so no call site has to change.
export const callInfo = new WeakMap<object, CallInfo>()

export function currentEnv(): string {
  return process.env.VERCEL_ENV?.trim() || 'development'
}

// Only small, non-textual values from call sites: ids, counts, phase names.
// Anything longer than a label is dropped rather than risk storing content.
function sanitise(extra: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!extra) return out
  for (const [k, v] of Object.entries(extra)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'boolean') out[k] = v
    else if (typeof v === 'string' && v.length <= 40) out[k] = v
    else if (k === 'parts' && v && typeof v === 'object') {
      const parts: Record<string, number> = {}
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        if (typeof pv === 'number' && Number.isFinite(pv)) parts[pk.slice(0, 40)] = pv
      }
      out.parts = parts
    }
  }
  return out
}

export async function recordAiCall(input: {
  userId: string | null
  route: string
  model: string
  usage: UsageLike
  info?: CallInfo
  extra?: Record<string, unknown>
}): Promise<void> {
  try {
    const db = adminClient()
    if (!db) return
    const { usage, info } = input
    const { error } = await db.from('ai_calls').insert({
      user_id: input.userId,
      env: currentEnv(),
      route: input.route.slice(0, 120),
      model: input.model,
      requested_model: info?.requestedModel ?? null,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_tokens: usage.cache_read_input_tokens ?? 0,
      cost_micros: costMicros(input.model, usage),
      duration_ms: info?.durationMs ?? null,
      stop_reason: info?.stopReason ?? null,
      context: { ...(info?.shape ?? {}), ...sanitise(input.extra) },
    })
    if (error) console.error('recordAiCall failed:', error.message)
  } catch (e) {
    console.error('recordAiCall failed:', e)
  }
}

export async function recordOpsEvent(
  kind: 'webhook_error' | 'ai_error' | 'signup_blocked' | 'alert_sent',
  route: string | null,
  message: string,
  detail: Record<string, unknown> = {}
): Promise<void> {
  try {
    const db = adminClient()
    if (!db) return
    const { error } = await db.from('ops_events').insert({
      kind,
      route,
      message: message.slice(0, 300),
      detail: { env: currentEnv(), ...detail },
    })
    if (error) console.error('recordOpsEvent failed:', error.message)
  } catch (e) {
    console.error('recordOpsEvent failed:', e)
  }
}

// An Anthropic SDK error, reduced to what's safe to keep: status and type.
export function describeAiError(err: unknown): { message: string; status?: number } {
  const e = err as { status?: number; name?: string; error?: { error?: { type?: string; message?: string } }; message?: string }
  const type = e?.error?.error?.type ?? e?.name ?? 'Error'
  const msg = e?.error?.error?.message ?? e?.message ?? ''
  return { status: e?.status, message: `${e?.status ?? ''} ${type}: ${msg}`.trim().slice(0, 200) }
}
