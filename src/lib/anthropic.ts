import Anthropic from '@anthropic-ai/sdk'

// Single shared client — the SDK client is stateless and safe to reuse
// across route invocations.
export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})
