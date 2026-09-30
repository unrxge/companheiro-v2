// "Bring several things" hands its items to the conceptualise page through
// sessionStorage, and the opening message it builds is recognised by the API
// on every later turn (including after a resume) by its first line.

export interface BroughtItem { kind: string; text: string }

export const BROUGHT_SEVERAL_KEY = 'brought_several'
export const SEVERAL_HEADER = "I've brought a few separate things."

export function severalOpening(items: BroughtItem[]): string {
  const body = items
    .map((x, i) => `${i + 1}. ${x.kind ? `${x.kind}: ` : ''}${x.text}`)
    .join('\n\n')
  return `${SEVERAL_HEADER}\n\n${body}`
}

export function isSeveralOpening(text: string | undefined | null): boolean {
  return !!text && text.startsWith(SEVERAL_HEADER)
}
