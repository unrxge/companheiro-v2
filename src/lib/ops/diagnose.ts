// Reads one expensive Claude call against its task's usual and says, in
// plain words, what made it expensive — so /admin can tell a real prompt
// problem (history never trimmed, cache never hit, reply cut off) from a
// person simply having a long, legitimate session.

export interface CallRow {
  id: number
  at: string
  route?: string
  model: string
  requested_model: string | null
  input: number
  output: number
  cache_write: number
  cache_read: number
  cost: number
  median?: number
  ratio?: number
  ms: number | null
  stop: string | null
  context: Record<string, unknown>
  user: string | null
}

export interface RouteNorms {
  avg_input: number
  avg_output: number
  cache_read_share: number
}

export interface Finding {
  level: 'serious' | 'warning' | 'good'
  text: string
  /** What to look at if this keeps happening. */
  tweak?: string
}

const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const k = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : String(Math.round(v)))

export function diagnose(call: CallRow, norms?: RouteNorms): Finding[] {
  const out: Finding[] = []
  const c = call.context ?? {}
  const totalIn = call.input + call.cache_write + call.cache_read

  if (call.stop === 'max_tokens') {
    out.push({
      level: 'serious',
      text: `The reply was cut off at its ${k(n(c.max))}-token cap: the person saw an unfinished answer and was billed for all of it.`,
      tweak: 'Raise max_tokens for this task, or ask for shorter replies in the prompt.',
    })
  }
  if (call.requested_model && call.requested_model !== call.model) {
    out.push({ level: 'good', text: `Ran on ${call.model} instead of ${call.requested_model}: this person is past the soft fair-use threshold.` })
  }
  if (norms && norms.avg_input > 0 && totalIn > 2.5 * norms.avg_input) {
    out.push({
      level: 'warning',
      text: `Sent ${k(totalIn)} input tokens, ${(totalIn / norms.avg_input).toFixed(1)}× this task's average (${k(norms.avg_input)}).`,
    })
  }
  if (norms && norms.avg_output > 0 && call.output > 2.5 * norms.avg_output) {
    out.push({
      level: 'warning',
      text: `Wrote ${k(call.output)} output tokens, ${(call.output / norms.avg_output).toFixed(1)}× the usual reply.`,
      tweak: 'If long replies are not what this task is for, tighten the length guidance or max_tokens.',
    })
  }
  const turns = n(c.turns)
  if (turns >= 16) {
    out.push({
      level: 'warning',
      text: `Carried ${turns} earlier messages (${k(n(c.history))} characters) as history.`,
      tweak: 'Check this task trims history (the writing assistant keeps a 10–17 exchange window).',
    })
  }
  const sysCachedChars = n(c.sysCached)
  const cacheable = sysCachedChars > 0 || c.histCached === true
  if (cacheable && call.cache_read === 0 && call.cache_write > 0.4 * totalIn) {
    out.push({
      level: 'warning',
      text: `Wrote ${k(call.cache_write)} tokens to the cache and read none: a cache miss, billed at twice the input price.`,
      tweak: 'Normal on the first turn or after an hour away. If it keeps happening mid-conversation, something in the cached block changes every turn.',
    })
  } else if (!cacheable && totalIn > 15000) {
    out.push({
      level: 'warning',
      text: `${k(totalIn)} input tokens with no prompt caching on this task.`,
      tweak: 'A stable system block this size is worth caching (lib/prompt-cache.ts).',
    })
  }
  if (norms && norms.cache_read_share > 0.3 && totalIn > 0 && call.cache_read / totalIn < norms.cache_read_share / 3) {
    out.push({
      level: 'warning',
      text: `Only ${Math.round((call.cache_read / totalIn) * 100)}% of input came from the cache, against ${Math.round(norms.cache_read_share * 100)}% usually.`,
    })
  }
  const parts = (c.parts ?? {}) as Record<string, number>
  const partTotal = Object.values(parts).reduce((a, b) => a + n(b), 0)
  if (partTotal > 0) {
    const [bigName, bigSize] = Object.entries(parts).sort((a, b) => n(b[1]) - n(a[1]))[0]
    if (bigSize / partTotal > 0.5 && bigSize > 8000) {
      out.push({
        level: 'warning',
        text: `The biggest part of the prompt was ${bigName.replace(/_/g, ' ')} (${k(bigSize)} characters, ${Math.round((bigSize / partTotal) * 100)}% of the labelled context).`,
        tweak: `Consider capping or summarising ${bigName.replace(/_/g, ' ')} for this task.`,
      })
    }
  }
  if (n(c.last) > 6000) {
    out.push({ level: 'good', text: `The person's own message was long (${k(n(c.last))} characters). That's legitimate use, not a prompt problem.` })
  }
  if (out.length === 0) {
    out.push({ level: 'good', text: 'Nothing structural stands out. Probably a long but ordinary exchange.' })
  }
  return out
}

/** The task variant a call belongs to, from what its call site labelled. */
export function variantOf(context: Record<string, unknown>): string {
  for (const key of ['task', 'phase', 'mode', 'kind', 'source']) {
    const v = context?.[key]
    if (v !== undefined && v !== null && v !== '') return `${key}: ${v}`
  }
  return 'all'
}
