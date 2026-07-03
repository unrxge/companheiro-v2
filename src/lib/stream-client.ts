// Client-side reader for streamClaudeText responses.
export const META_DELIMITER = ''

interface StreamResult<M> {
  text: string
  meta: M | null
}

// Reads a streamed text response incrementally. onText receives the visible
// text so far on every chunk — already cut at the meta delimiter and at any
// hideFrom marker (e.g. '<signals>') so structured tails never flash on screen.
export async function readTextStream<M = Record<string, unknown>>(
  response: Response,
  onText: (visibleText: string) => void,
  hideFrom: string[] = []
): Promise<StreamResult<M>> {
  if (!response.body) {
    throw new Error('No response body to stream')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let accumulated = ''

  const visible = () => {
    let cut = accumulated
    const metaIdx = cut.indexOf(META_DELIMITER)
    if (metaIdx !== -1) cut = cut.slice(0, metaIdx)
    for (const marker of hideFrom) {
      const idx = cut.indexOf(marker)
      if (idx !== -1) cut = cut.slice(0, idx)
    }
    return cut.trimEnd()
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    accumulated += decoder.decode(value, { stream: true })
    onText(visible())
  }
  accumulated += decoder.decode()

  let meta: M | null = null
  const metaIdx = accumulated.indexOf(META_DELIMITER)
  if (metaIdx !== -1) {
    try {
      meta = JSON.parse(accumulated.slice(metaIdx + META_DELIMITER.length))
    } catch {
      meta = null
    }
  }

  const finalText = visible()
  onText(finalText)
  return { text: finalText, meta }
}
