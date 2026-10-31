// `temperament` arrives with migration 040, applied by hand. Until it is, a
// select naming it fails outright, so readers ask with it and, on that one
// failure, ask again without it.
type Result<T> = { data: T | null; error: { code?: string; message?: string } | null }

export function missingTemperament(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === '42703' || error.code === 'PGRST204' || /temperament/.test(error.message ?? ''))
}

export async function withTemperament<T>(cols: string, run: (cols: string) => PromiseLike<Result<T>>): Promise<Result<T>> {
  const first = await run(`${cols}, temperament`)
  if (!missingTemperament(first.error)) return first
  return run(cols)
}
