import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages'
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
  buildMeta?: (fullText: string) => Record<string, unknown> | Promise<Record<string, unknown>>,
  // Labels and sizes for the monitoring record (lib/ops/ai-calls.ts) —
  // e.g. { parts: { concept: 1200, history: 8000 } }. Never text.
  extra?: Record<string, unknown>
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = Date.now()
      try {
        let fullText = ''
        const messageStream = anthropic.messages.stream(params)

        for await (const event of messageStream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            fullText += event.delta.text
            controller.enqueue(encoder.encode(event.delta.text))
          }
        }

        // stop_reason === 'max_tokens' means Claude was cut off by the
        // max_tokens cap mid-thought, not that it actually finished — that
        // reads identically to a complete reply unless the client is told,
        // so it's always included regardless of what buildMeta returns.
        const finalMessage = await messageStream.finalMessage()
        logUsageLine(route, finalMessage.model, finalMessage.usage)
        await Promise.all([
          meterUsage(userId, finalMessage.model, finalMessage.usage),
          recordAiCall({
            userId,
            route,
            model: finalMessage.model,
            usage: finalMessage.usage,
            info: {
              requestedModel: params.model,
              durationMs: Date.now() - started,
              stopReason: finalMessage.stop_reason,
              shape: describeRequest(params as Parameters<typeof describeRequest>[0]),
            },
            extra,
          }),
        ])
        const meta: Record<string, unknown> = {
          ...(buildMeta ? await buildMeta(fullText) : {}),
          truncated: finalMessage.stop_reason === 'max_tokens',
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
