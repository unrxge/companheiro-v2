// Zero-dependency spend visibility. Nothing in the app records token usage
// today, so nobody can say which surface actually costs what — this puts one
// structured line per Claude call into the Vercel log stream, which doubles
// as a usage report until there's Admin API access to pull real numbers
// from. Never throws: a logging line must never be the reason a request
// fails.
export interface UsageLike {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export function logUsage(
  route: string,
  model: string,
  usage: UsageLike | null | undefined,
  extra?: Record<string, unknown>
): void {
  try {
    if (!usage) return
    console.log(
      '[usage]',
      JSON.stringify({
        route,
        model,
        input: usage.input_tokens ?? 0,
        output: usage.output_tokens ?? 0,
        cacheWrite: usage.cache_creation_input_tokens ?? 0,
        cacheRead: usage.cache_read_input_tokens ?? 0,
        ...extra,
      })
    )
  } catch {
    // logging must never break a request
  }
}
