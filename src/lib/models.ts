// Central model registry. Every API route imports from here so a model
// upgrade is a one-line change instead of a hunt through ~10 files.
export const MODELS = {
  // Fast + cheap: signals extraction, punctuation, unpacking, one-shot prompts
  fast: 'claude-haiku-4-5',
  // Deeper multi-turn reasoning: conceptualise, zoom-out, writing companion.
  // Reverted from Sonnet 5 back to 4.6 (2026-09-08) — 5's lower per-token
  // price didn't hold up once its longer replies were counted: it wrote
  // enough more per response that the same conversation cost more overall,
  // not less, and hit output caps 4.6 never came close to on equally dense
  // prompts.
  deep: 'claude-sonnet-4-6',
  // The room where a whole project's vision is talked through (Direction).
  // The one place the strongest Opus is worth its price: few, long-lived
  // conversations that the plan is sold on. Thinking is always on with this
  // model and counts toward max_tokens, so its callers leave room for it.
  vision: 'claude-opus-5-5',
} as const
