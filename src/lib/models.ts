// Central model registry. Every API route imports from here so a model
// upgrade is a one-line change instead of a hunt through ~10 files.
export const MODELS = {
  // Fast + cheap: signals extraction, punctuation, unpacking, one-shot prompts
  fast: 'claude-haiku-4-5-20251001',
  // Deeper multi-turn reasoning: conceptualise, zoom-out, writing companion
  deep: 'claude-sonnet-4-6',
} as const
