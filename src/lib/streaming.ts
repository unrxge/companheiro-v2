import type { MessageCreateParamsNonStreaming } from '@anthropic-ai/sdk/resources/messages'
import { anthropic } from './anthropic'

// Text chunks stream raw; if buildMeta is provided, its JSON is appended
// after this delimiter as the final frame. U+001E (record separator) never
// appears in model text.
export const META_DELIMITER = ''

// Streams a Claude response as text/plain. The client reads incrementally
// via readTextStream() in lib/stream-client.ts.
export function streamClaudeText(
  params: MessageCreateParamsNonStreaming,
  buildMeta?: (fullText: string) => Record<string, unknown>
): Response {
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
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

        if (buildMeta) {
          controller.enqueue(
            encoder.encode(META_DELIMITER + JSON.stringify(buildMeta(fullText)))
          )
        }
        controller.close()
      } catch (error) {
        console.error('streamClaudeText error:', error)
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
