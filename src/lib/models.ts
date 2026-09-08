// Central model registry. Every API route imports from here so a model
// upgrade is a one-line change instead of a hunt through ~10 files.
export const MODELS = {
  // Fast + cheap: signals extraction, punctuation, unpacking, one-shot prompts
  fast: 'claude-haiku-4-5',
  // Deeper multi-turn reasoning: conceptualise, zoom-out, writing companion.
  // Sonnet 5 replaced Sonnet 4.6 here (2026-09-08) — newer and cheaper:
  // $2/$10 per MTok against 4.6's $3/$15, so every `deep` route got better
  // and less expensive in the same change.
  deep: 'claude-sonnet-5',
} as const
