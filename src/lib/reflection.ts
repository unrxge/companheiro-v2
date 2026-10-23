// Looking back on a finished piece: the last stage of it, a short spoken
// conversation that ends in a record (the reflection log) kept with the piece.
//
// The conversation comes to four things, in order: how they feel about it now
// that it is finished, what making it opened up in them, what it left
// unresolved, and where it could go next. It is meant to feel like being
// listened to, not like a form, so:
//   - every reply says back, tentatively, what was heard, then asks the next
//     thing (the same shape as the check-in);
//   - which things are answered is not read out of prose. Each turn the model
//     fills in a forced tool call (what it has heard, per theme, in their own
//     words), and code decides the rest: which theme comes next, and that an
//     answer with nothing to write down is pressed once and then let go;
//   - anything can be skipped, and nothing about sharing or posting is asked.
// When nothing is left, a second pass writes what they said up as the log;
// they can correct it by speaking again, and keeping it is what finishes the
// piece, once.
//
// Pure on purpose (no server or browser imports): the routes build prompts
// from it, the page uses its constants, and all of it is tested.

export type ThemeKey = 'feeling' | 'opened' | 'unresolved' | 'next'

export interface Theme {
  n: 1 | 2 | 3 | 4
  key: ThemeKey
  /** How the kept log labels it. */
  label: string
  /** A plain way to ask it, used when the model's own wording can't be trusted to be about this theme. */
  ask: string
  /** What it is after, for the model. */
  about: string
}

export const THEMES: readonly Theme[] = [
  {
    n: 1, key: 'feeling', label: 'How it felt to finish',
    ask: 'How are you feeling about it now?',
    about: 'HOW THEY FEEL. How they feel about the piece now that it is finished: relieved, flat, proud, unsure, anything. A feeling named in a word or two is a full answer. On screen this was asked first, as the opening.',
  },
  {
    n: 2, key: 'opened', label: 'What it opened',
    ask: 'What did making it open up in you?',
    about: 'WHAT IT OPENED. What making it opened up in them: something they noticed, a question that appeared, a feeling they had not met, a change in how they see something.',
  },
  {
    n: 3, key: 'unresolved', label: 'Left unresolved',
    ask: 'Did it leave anything unresolved, something you did not get to, or still do not know?',
    about: 'WHAT IS UNRESOLVED. Anything the piece left unresolved or unsaid: a part that is not settled, something they still do not know. "Nothing" is a complete answer.',
  },
  {
    n: 4, key: 'next', label: 'Where it could go',
    ask: 'Where could it go from here? Another piece, a different form, a thread to pick up, or nowhere at all.',
    about: 'WHERE IT COULD GO NEXT. Where it could go from here: another piece, a different form, a thread to pick up, a question to take further. "Nowhere, it is finished" is a complete answer.',
  },
]

export const THEME_COUNT = THEMES.length
/** `asking` when there is nothing left to ask. */
export const DONE = 5

export type Heard = Record<ThemeKey, string>

export const emptyHeard = (): Heard => ({ feeling: '', opened: '', unresolved: '', next: '' })

export const MAX_TEXT = 4000
const MAX_HEARD = 700

export const cleanText = (raw: unknown, max = MAX_TEXT): string => (typeof raw === 'string' ? raw.trim().slice(0, max) : '')

/** Reads whatever the model or the page hands back as a Heard, with nothing else in it. */
export function cleanHeard(raw: unknown): Heard {
  const out = emptyHeard()
  if (!raw || typeof raw !== 'object') return out
  const src = raw as Record<string, unknown>
  for (const t of THEMES) out[t.key] = cleanText(src[t.key], MAX_HEARD)
  return out
}

export const isAnswered = (heard: Heard, n: number): boolean => {
  const theme = THEMES[n - 1]
  return !!theme && heard[theme.key].trim().length > 0
}

/** The opening line. Static, so the page opens with no wait. */
export function reflectOpening(title: string): string {
  const name = title.trim() && title.trim().toLowerCase() !== 'untitled' ? `“${title.trim()}”` : 'it'
  return `${name === 'it' ? 'It is' : `${name} is`} finished. ${THEMES[0].ask}`
}

/** After "Not quite": the page asks for the correction, in the person's own voice, by speaking. */
export const REFLECT_CORRECTION_ASK = 'What would you change, or add?'

export interface Progress {
  /** The theme the last question asked: 1 to 4, or 0 when nothing was asked (the first turn after a correction). */
  phase: number
  followedUp: readonly number[]
  skipped: readonly number[]
}

/** Whether a theme may still be asked, given what has been heard. */
export function isOpen(n: number, heard: Heard, { followedUp, skipped }: Pick<Progress, 'followedUp' | 'skipped'>): boolean {
  return !isAnswered(heard, n) && !skipped.includes(n) && !followedUp.includes(n)
}

/**
 * What to ask next. A theme the last question asked, and that still has
 * nothing to write down, is pressed once more and then let go; otherwise the
 * first theme still open, in order; otherwise nothing: it is time to write it
 * up. Decided here, never by the model.
 */
export function nextTheme(heard: Heard, progress: Progress): { theme: number | null; followUp: boolean } {
  const { phase, followedUp, skipped } = progress
  if (phase >= 1 && phase <= THEME_COUNT && !isAnswered(heard, phase) && !skipped.includes(phase) && !followedUp.includes(phase)) {
    return { theme: phase, followUp: true }
  }
  for (const t of THEMES) {
    if (isOpen(t.n, heard, progress)) return { theme: t.n, followUp: false }
  }
  return { theme: null, followUp: false }
}

/** The themes the model may be offered before it answers: the ones nothing has closed yet, and the one it may press. */
export function allowedThemes(heard: Heard, progress: Progress): number[] {
  const out: number[] = []
  for (const t of THEMES) {
    const pressing = t.n === progress.phase && !isAnswered(heard, t.n) && !progress.skipped.includes(t.n) && !progress.followedUp.includes(t.n)
    if (pressing || isOpen(t.n, heard, progress)) out.push(t.n)
  }
  return out
}

// ── the model's call ────────────────────────────────────────────────────────

export const REFLECT_TOOL_NAME = 'reflect_turn'

export function reflectTool(allowed: number[]) {
  const heardProps: Record<string, unknown> = {}
  for (const t of THEMES) {
    heardProps[t.key] = {
      type: 'string',
      description: `What they have said so far that answers "${t.label}", in their own words and as short as it can be kept (a phrase or a sentence), from anywhere in the conversation. Empty if they have not answered it, or if all they gave was too vague to write down ("I don't know", "it's fine", a different subject). A plain "nothing" or "nowhere" to ${t.n >= 3 ? 'this one' : 'a question like this'} IS an answer: write it ("Nothing left unresolved."). Never write what only you said.`,
    }
  }
  return {
    name: REFLECT_TOOL_NAME,
    description: 'Make your next turn: record what they have said so far under each of the four things, say what you heard, and ask the next thing.',
    input_schema: {
      type: 'object' as const,
      properties: {
        heard: {
          type: 'object',
          properties: heardProps,
          required: THEMES.map((t) => t.key),
          description: 'Fill this in first, and think it through: for each of the four things, what their words so far have answered. Cumulative: keep what was recorded earlier unless they have corrected it.',
        },
        asking: {
          type: 'integer',
          enum: [...allowed, DONE],
          description: `The thing you ask now: the first of the allowed ones that heard leaves empty (or the one you may press once more, gently, if their last answer gave nothing to write down), or ${DONE} when none is left and you are closing.`,
        },
        reflection: {
          type: 'string',
          description: 'What you heard in what they just said, said back as your reading of it: one or two plain sentences, tentative enough that they could say "not quite". In their own words where you can. No praise, no verdict on the piece, no advice, no question.',
        },
        question: {
          type: 'string',
          description: 'The one question for the thing you are asking, in a line of plain words, following on from what they just said and not a template. Empty only when asking is 5.',
        },
      },
      required: ['heard', 'asking', 'reflection', 'question'],
    } as { type: 'object'; properties: Record<string, unknown>; required: string[] },
  }
}

export interface ReflectTurn {
  say: string
  heard: Heard
  /** The theme the line asks, or 0 when nothing is left and the log is written next. */
  theme: number
  followUp: boolean
  done: boolean
}

/**
 * Reads the model's call. Everything but the wording is decided here: what is
 * answered is the model's `heard`; what comes next is nextTheme(). If the
 * model's own question is for some other theme than the one that is due, the
 * plain question for the due one is used, so what is on screen always matches
 * where the page is.
 */
export function parseReflectTurn(input: unknown, progress: Progress): ReflectTurn | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const heard = cleanHeard(raw.heard)
  const reflection = cleanText(raw.reflection, 600)
  const question = cleanText(raw.question, 400)
  const claimed = typeof raw.asking === 'number' && Number.isFinite(raw.asking) ? Math.round(raw.asking) : -1

  const { theme, followUp } = nextTheme(heard, progress)
  if (theme === null) {
    return { say: reflection || 'That is everything I wanted to ask.', heard, theme: 0, followUp: false, done: true }
  }
  const ask = claimed === theme && question ? question : THEMES[theme - 1].ask
  return { say: [reflection, ask].filter(Boolean).join('\n\n'), heard, theme, followUp, done: false }
}

/** The Messages API wants a person to speak first; the conversation opens with the assistant's own line. */
export function personFirst<T extends { role: 'user' | 'assistant'; content: string }>(messages: T[]): Array<T | { role: 'user'; content: string }> {
  const standIn = { role: 'user' as const, content: '(They have just finished the piece.)' }
  if (messages.length === 0) return [standIn]
  if (messages[0].role === 'user') return messages
  return [standIn, ...messages]
}

// ── the prompts ─────────────────────────────────────────────────────────────

export interface PieceFacts {
  title?: string | null
  core_truth?: string | null
  intent?: string | null
}

function pieceBlock(piece: PieceFacts | null | undefined): string {
  if (!piece) return ''
  const title = (piece.title ?? '').trim()
  const lines = [
    title && title.toLowerCase() !== 'untitled' ? `Title: ${title}` : '',
    (piece.core_truth ?? '').trim() ? `What they set out to say (its core truth): ${(piece.core_truth ?? '').trim().slice(0, 600)}` : '',
    (piece.intent ?? '').trim() ? `What it is for (its conviction): ${(piece.intent ?? '').trim().slice(0, 600)}` : '',
  ].filter(Boolean)
  if (!lines.length) return ''
  return `\n\nTHE PIECE, so you know what they are talking about (never to measure it against; you do not judge it, and you do not bring these words up unless they do):\n${lines.join('\n')}`
}

export function reflectStableBlock(tone: string): string {
  return `You are Companheiro, sitting with someone who has just finished a piece of work. This is the last stage of it: looking back. They speak to you out loud and it arrives as dictation, so expect run-ons, filler and now and then a mis-heard word; read for what they mean.

${tone}

WHAT THIS IS
A short, easy conversation that ends in a record of how it was for them, kept with the piece. It should feel like being listened to by someone who is interested, never like a form being filled in. They are not here to report, to justify or to evaluate. Whether the piece is good is theirs to decide and never yours to say.

THE FOUR THINGS YOU COME TO, IN ORDER
Each turn lists which you may still ask. They may answer one while talking about another; that counts, and you do not ask it again.
${THEMES.map((t) => `${t.n}. ${t.about}`).join('\n')}

EVERY TURN
1. Say back what you heard. One or two plain sentences: your reading of what they just said, offered so they could say "not quite", in their own words where you can. Carry it forward; do not repeat it. Not praise, not reassurance, not an assessment of the piece, not advice. Do not open two replies the same way, and do not lean on "It sounds like".
2. Then ask the next thing: one question, a line of plain words, following on from what they just said and not a template. Never two questions. Ask about their experience (what it was like, what stayed, what is still open), never about the work's quality.

TAKING AN ANSWER
- An answer is an answer when there is something to write down, however short: "Relieved, mostly." "Nothing, I think it is done." "Probably a shorter version of it." A plain "nothing" or "nowhere" to what is unresolved or where it could go is a complete answer; record it.
- If what they gave has nothing to write down ("I don't know", "it's fine", a different subject), leave that thing empty in heard. The turn will tell you if you may ask it once more: then ask in another way, for something concrete (a moment, a part, an example) rather than the abstraction, and gently. It is never asked a third time, and nobody is told they have not answered.
- If they push back on how you read them, take the correction at face value and let it stand. Do not defend the earlier reading and do not reinterpret the disagreement.
- Never ask about posting, sharing, publishing, readers, an audience or how it was received. Not everyone shows what they make, and that is not what this is.
- Write in the language they speak.

Every turn, answer by calling ${REFLECT_TOOL_NAME}: fill in heard first, then asking, so that what you ask follows from what is already answered.`
}

export function reflectVolatileBlock({ heard, progress, piece }: { heard: Heard; progress: Progress; piece?: PieceFacts | null }): string {
  const allowed = allowedThemes(heard, progress)
  const lines: string[] = []
  const recorded = THEMES.filter((t) => isAnswered(heard, t.n)).map((t) => `${t.n}. ${t.label}: ${heard[t.key]}`)
  if (recorded.length) lines.push(`WHAT YOU HAVE ALREADY RECORDED (cumulative; keep it unless they correct it):\n${recorded.join('\n')}`)
  const { phase } = progress
  if (phase >= 1 && allowed.includes(phase)) {
    lines.push(`You have just asked thing ${phase}. If their last answer gave something to write down, record it and move on. If it gave nothing to write down, you may ask thing ${phase} once more, with asking ${phase}, in another way and gently. This is the only time it can be asked again.`)
  } else if (phase >= 1) {
    lines.push(`You have just asked thing ${phase}. Take whatever they said as it stands and do not ask it again.`)
  } else {
    lines.push('They are adding to or correcting what you heard. Take it in, update heard, and ask only what is still open (or close, if nothing is).')
  }
  if (allowed.length) {
    lines.push(`THE THINGS YOU MAY ASK FROM HERE, IN ORDER (all others are closed for good):\n${allowed.map((n) => `${n}. ${THEMES[n - 1].about}`).join('\n')}\nAsk the first one that heard still leaves empty after what they just said.`)
  } else {
    lines.push(`Nothing is left to ask. Call ${REFLECT_TOOL_NAME} with asking ${DONE}: a short closing reflection of what you heard, and no question.`)
  }
  return `${lines.join('\n\n')}${pieceBlock(piece)}`
}

// ── writing it up ───────────────────────────────────────────────────────────

export const LOG_TOOL_NAME = 'reflection_log'

export const LOG_TOOL = {
  name: LOG_TOOL_NAME,
  description: 'Write up what they said about the piece they have just finished, so it can be kept with it.',
  input_schema: {
    type: 'object' as const,
    properties: {
      feeling: { type: 'string', description: 'How they said they feel about the piece now that it is finished, in one or two sentences. Empty if they did not say.' },
      opened: { type: 'string', description: 'What they said making it opened up in them. Empty if they did not say.' },
      unresolved: { type: 'string', description: 'What they said it left unresolved. If they said there was nothing, write that ("Nothing left unresolved."). Empty only if it was not discussed or skipped.' },
      next: {
        type: 'array',
        items: { type: 'string' },
        description: 'Where they said it could go next, one idea to an item, each short. If they said nowhere, a single item saying so. Empty only if it was not discussed or skipped.',
      },
    },
    required: ['feeling', 'opened', 'unresolved', 'next'],
  },
}

export const LOG_SYSTEM = `You are writing down what someone said about a piece of work they have just finished, so it can be kept with the piece. It will be shown to them as theirs.

- Only what they said. Add nothing: no interpretation, no advice, no praise, no conclusion they did not reach, and nothing the companion said unless they agreed to it.
- Use their own words and their phrasing where you can; condense the run-ons and filler of dictation, never swap in grander words. First person ("I felt…", "It made me notice…"), because it is theirs.
- Keep the honest small answers as they are: "Nothing left unresolved." is a real entry.
- Anything not discussed, or skipped, is left empty. Never fill a gap.
- Write in the language they spoke.`

export interface ReflectionLog {
  feeling: string
  opened: string
  unresolved: string
  next: string[]
}

export const emptyLog = (): ReflectionLog => ({ feeling: '', opened: '', unresolved: '', next: [] })

export function parseLog(input: unknown): ReflectionLog | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const next = Array.isArray(raw.next) ? raw.next.map((x) => cleanText(x, 300)).filter(Boolean).slice(0, 8) : []
  return { feeling: cleanText(raw.feeling, 800), opened: cleanText(raw.opened, 1200), unresolved: cleanText(raw.unresolved, 1200), next }
}

/** A log built straight from what was heard, for when writing it up fails. */
export function logFromHeard(heard: Heard): ReflectionLog {
  return { feeling: heard.feeling, opened: heard.opened, unresolved: heard.unresolved, next: continuationLines(heard.next) }
}

export const hasAnyLog = (l: ReflectionLog) => !!(l.feeling || l.opened || l.unresolved || l.next.length)

/** One idea to a line, bullets and numbers stripped. */
export function continuationLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*[-•*\d.)]+\s+/, '').trim())
    .filter((line) => line.length > 0)
}

/** The conversation as text, for the model that writes it up. */
export function transcriptOf(messages: Array<{ role: 'user' | 'assistant'; content: string }>): string {
  return messages.map((m) => `${m.role === 'user' ? 'PERSON' : 'COMPANION'}: ${m.content}`).join('\n\n')
}

/** What the log route is sent, in the shape the table has always had. */
export function toLogBody(log: ReflectionLog) {
  return {
    feeling: log.feeling.trim(),
    what_it_opened: log.opened.trim(),
    unresolved: log.unresolved.trim(),
    natural_continuations: log.next.join('\n'),
  }
}

/** "Nothing left unresolved", "Nowhere, it is finished": honest answers that are not something to develop. */
export const isNothing = (text: string): boolean => /^\s*(nothing|nowhere|none|no[ ,.]|nope)/i.test(text)
