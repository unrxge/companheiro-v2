import type { Message, MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages'
import { anthropic } from './anthropic'
import { logUsageLine } from './usage-log'
import { meterUsage } from './billing/fair-use'
import { describeAiError, describeRequest, recordAiCall, recordOpsEvent } from './ops/ai-calls'

// Text chunks stream raw; if buildMeta is provided, its JSON is appended
// after this delimiter as the final frame. U+001E (record separator) never
// appears in model text.
export const META_DELIMITER = ''

// Streams a Claude response as text/plain. The client reads incrementally
// via readTextStream() in lib/stream-client.ts.
export function streamClaudeText(
  userId: string,
  route: string,
  params: MessageCreateParamsNonStreaming,
  // The finished message comes second, for a caller that needs more than the
  // words: the sources a web search cited, or why it stopped.
  buildMeta?: (fullText: string, finalMessage: Message) => Record<string, unknown> | Promise<Record<string, unknown>>,
  // Labels and sizes for the monitoring record (lib/ops/ai-calls.ts) —
  // e.g. { parts: { concept: 1200, history: 8000 } }. Never text.
  extra?: Record<string, unknown>,
  // fallbackModel: asked once, with the same request, when the first model
  // declines before saying anything (stop_reason 'refusal'). The newest
  // models run classifiers the older ones do not, and a conversation about a
  // film on, say, an epidemic should not end in silence.
  options?: { fallbackModel?: string }
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = Date.now()
      try {
        let fullText = ''
        // Text only: thinking, searches and their results stream past unseen.
        const run = async (request: MessageCreateParamsNonStreaming): Promise<Message> => {
          const messageStream = anthropic.messages.stream(request)
          for await (const event of messageStream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              fullText += event.delta.text
              controller.enqueue(encoder.encode(event.delta.text))
            }
          }
          const done = await messageStream.finalMessage()
          logUsageLine(route, done.model, done.usage)
          await Promise.all([
            meterUsage(userId, done.model, done.usage),
            recordAiCall({
              userId,
              route,
              model: done.model,
              usage: done.usage,
              info: {
                requestedModel: request.model,
                durationMs: Date.now() - started,
                stopReason: done.stop_reason,
                shape: describeRequest(request as Parameters<typeof describeRequest>[0]),
              },
              extra,
            }),
          ])
          return done
        }

        // stop_reason === 'max_tokens' means Claude was cut off by the
        // max_tokens cap mid-thought, not that it actually finished — that
        // reads identically to a complete reply unless the client is told,
        // so it's always included regardless of what buildMeta returns.
        let finalMessage = await run(params)
        const fallback = options?.fallbackModel
        if (finalMessage.stop_reason === 'refusal' && !fullText && fallback && fallback !== params.model) {
          console.warn(`[${route}] ${params.model} declined; asking ${fallback}`)
          finalMessage = await run({ ...params, model: fallback })
        }
        const meta: Record<string, unknown> = {
          ...(buildMeta ? await buildMeta(fullText, finalMessage) : {}),
          truncated: finalMessage.stop_reason === 'max_tokens',
          refused: finalMessage.stop_reason === 'refusal',
        }
        controller.enqueue(encoder.encode(META_DELIMITER + JSON.stringify(meta)))
        controller.close()
      } catch (error) {
        console.error('streamClaudeText error:', error)
        const { message, status } = describeAiError(error)
        await recordOpsEvent('ai_error', route, message, { status, model: params.model })
        controller.error(error)
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  })
}
