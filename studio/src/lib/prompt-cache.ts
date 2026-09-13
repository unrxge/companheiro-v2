import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'

// Marks the last message in a growing conversation history as an explicit
// prompt-cache breakpoint. Call this with the PRIOR turns only — the message
// being appended fresh this request should NOT be included, since it's the
// one part of the request that's genuinely new every time.
//
// The 1-hour TTL (rather than the 5-minute default) is deliberate: these are
// conversational surfaces where a person reads, thinks, and writes between
// turns, so the gap between requests is often well over 5 minutes. A miss
// means the whole prefix — system prompt plus everything said so far — gets
// rebilled in full and rewritten to cache; the 1h write costs 2x instead of
// 1.25x, which pays for itself on the very next prevented miss.
export function cacheLastMessage(messages: MessageParam[]): MessageParam[] {
  if (messages.length === 0) return messages
  const last = messages[messages.length - 1]
  const cache_control = { type: 'ephemeral' as const, ttl: '1h' as const }
  const content =
    typeof last.content === 'string'
      ? [{ type: 'text' as const, text: last.content, cache_control }]
      : last.content.map((block, i, arr) => (i === arr.length - 1 ? { ...block, cache_control } : block))
  return [...messages.slice(0, -1), { ...last, content }]
}
