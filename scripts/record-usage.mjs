// Maintenance scripts call Claude straight from this machine, so their spend
// never passes through the app's meter (lib/ops/ai-calls.ts). This files each
// call in the same ai_calls table under env 'script', so /admin adds up to
// what Anthropic's console shows. Never throws; prices mirror
// lib/billing/fair-use.ts — keep them in step.
const PRICES = [
  { match: 'haiku', input: 1, output: 5 },
  { match: 'sonnet', input: 3, output: 15 },
  { match: 'opus', input: 5, output: 25 },
]

export async function recordScriptCall(url, key, script, response) {
  try {
    const u = response?.usage
    if (!url || !key || !u) return
    const p = PRICES.find((x) => response.model.includes(x.match)) ?? PRICES[1]
    const cw = u.cache_creation_input_tokens ?? 0
    const cr = u.cache_read_input_tokens ?? 0
    await fetch(`${url}/rest/v1/ai_calls`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        env: 'script',
        route: `script/${script}`,
        model: response.model,
        input_tokens: u.input_tokens ?? 0,
        output_tokens: u.output_tokens ?? 0,
        cache_write_tokens: cw,
        cache_read_tokens: cr,
        cost_micros: Math.round(p.input * ((u.input_tokens ?? 0) + cw * 2 + cr * 0.1) + p.output * (u.output_tokens ?? 0)),
        stop_reason: response.stop_reason ?? null,
      }),
    })
  } catch { /* bookkeeping must never stop a script */ }
}
