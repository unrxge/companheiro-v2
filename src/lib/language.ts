// Appended to every system prompt so Claude mirrors the user's language and dialect.
// Covers British/American English, Portuguese (European vs Brazilian), French, etc.
// For routes with no incoming user text the instruction is a safe no-op.
export const LANGUAGE_INSTRUCTION = `

LANGUAGE: Detect the language and regional dialect of the user's writing — British English, American English, European Portuguese, Brazilian Portuguese, French, Spanish, etc. — and respond in that exact same language and register, including spelling conventions and phrasing idiosyncrasies. Never switch languages unprompted. If no user text is present yet, default to English.`

export function withLanguage(systemPrompt: string): string {
  return systemPrompt + LANGUAGE_INSTRUCTION
}
