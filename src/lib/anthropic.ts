import Anthropic from '@anthropic-ai/sdk'
import { callInfo, describeAiError, describeRequest, recordOpsEvent } from './ops/ai-calls'

// Single shared client — the SDK client is stateless and safe to reuse
// across route invocations.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Every non-streaming call goes through here, so this is where each one's
// shape and timing is noted for the monitoring record (lib/ops/ai-calls.ts)
// without touching any call site: logUsage() later finds it by the usage
// object the call site hands over. The caller still gets the SDK's own
// promise back, untouched. Failures are recorded too (status and type only).
const create = anthropic.messages.create.bind(anthropic.messages)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(anthropic.messages as any).create = (params: any, options?: any) => {
  const started = Date.now()
  const promise = create(params, options)
  promise.then(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (msg: any) => {
      if (msg?.usage && typeof msg.usage === 'object') {
        callInfo.set(msg.usage, {
          requestedModel: params?.model,
          durationMs: Date.now() - started,
          stopReason: msg.stop_reason ?? null,
          shape: describeRequest(params ?? {}),
        })
      }
    },
    (err: unknown) => {
      const { message, status } = describeAiError(err)
      void recordOpsEvent('ai_error', null, message, { status, model: params?.model })
    }
  )
  return promise
}
