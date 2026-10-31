// The walks' examples arrive the way real words do: typed a letter at a time
// (or a word at a time, for something that answers), never already written.
// One timer chain, cancelled by what it returns.

export const TYPE_OUT = { leadMs: 500, charMs: 26, wordMs: 80 }

/** How long `text` takes to type out, from the start. */
export function typeOutMs(text: string, opts: { leadMs?: number; charMs?: number } = {}): number {
  return (opts.leadMs ?? TYPE_OUT.leadMs) + text.length * (opts.charMs ?? TYPE_OUT.charMs)
}

/** Calls `onText` with the text so far, a letter at a time (`by: 'word'`, a word at a time). */
export function typeOut(text: string, onText: (sofar: string) => void, opts: { leadMs?: number; charMs?: number; wordMs?: number; by?: 'char' | 'word' } = {}): () => void {
  const lead = opts.leadMs ?? TYPE_OUT.leadMs
  const timers: number[] = []
  if (opts.by === 'word') {
    const words = text.split(' ')
    words.forEach((_, i) => timers.push(window.setTimeout(() => onText(words.slice(0, i + 1).join(' ')), lead + i * (opts.wordMs ?? TYPE_OUT.wordMs))))
  } else {
    for (let i = 1; i <= text.length; i++) timers.push(window.setTimeout(() => onText(text.slice(0, i)), lead + i * (opts.charMs ?? TYPE_OUT.charMs)))
  }
  return () => timers.forEach((t) => window.clearTimeout(t))
}
