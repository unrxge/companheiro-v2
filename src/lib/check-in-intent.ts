// What a message said in the check-in is for.
//
// The check-in is two things in one place: somewhere to say how you are, and
// somewhere to leave a thought or a reminder on a project on the go ("note
// for the album: open on the kettle", "remind me to book the ferry crew").
// Every message is read for which one it is before anything is written back.
// Checking in is the usual case and the default whenever it is not plain.
//
// A note is only ever an offer: the page shows what was understood (the
// words, the project, thought or reminder), the person can change any of it,
// and nothing reaches a project until they say so (/api/check-in/note).
//
// Pure, so it is tested on its own; the route is /api/check-in/intent.

import type { NoteKind } from '@/lib/studio/board-items'
import { NOTE_MAX } from '@/lib/studio/board-items'

export type IntentMode = 'check_in' | 'note' | 'both'

export interface ProposedNote {
  /** A project from the list, or null when they did not say which (or none fits). */
  project_id: string | null
  kind: NoteKind
  /** What to keep, in their words, without the instruction around it. */
  text: string
}

export interface MessageIntent {
  mode: IntentMode
  notes: ProposedNote[]
}

export const CHECK_IN_ONLY: MessageIntent = { mode: 'check_in', notes: [] }

/** At most this many notes from one message. */
export const MAX_NOTES = 3

export interface IntentProject { id: string; title: string; intent?: string | null }

export const INTENT_SYSTEM = `You read one message someone has just said or typed into a companion app, and decide what it is for. You answer only by calling the tool.

People do one of two things here.

CHECKING IN (the usual case, by far): saying how they are, how the day went, what is on their mind, how they feel about something, including how they feel about their own work. Talking about a project, even at length, is checking in unless they ask for something to be kept.

LEAVING A NOTE ON A PROJECT: they want something kept on one of their projects for later, a thought, a line, an idea, a decision, or a reminder of something to do. It reads as an instruction or an aside meant for the project: "note for the album: …", "add to Aldermoor …", "for the series, …", "put this on the bakery one", "remind me to …", "don't let me forget …", "idea for episode two: …". Dictation mishears names, so a project may be named loosely.

"both": the message plainly does both, for example a few sentences about their day and then "oh, and remind me to call the printer for the bakery project".

When it is not plain that they want something kept, it is checking in. If the message answers a question the companion just asked, it is checking in.

For each note:
- project_id: the id of the project they named or plainly meant, from the list. "none" when they did not say which, or none fits. Never guess between two.
- kind: "reminder" when it is something to do; "thought" for anything to keep (an idea, a line, a decision, an image, a question).
- text: what they want kept, in their own words, with the instruction around it taken away ("note for the album that", "remind me to", "can you add"). A reminder is written as the thing to do, starting with the verb: "Book the ferry crew before Friday". Keep their wording otherwise. Never add anything they did not say, never summarise, never tidy their voice into yours.
- Only make separate notes when they asked for separate things.`

export const INTENT_TOOL = {
  name: 'read_message',
  description: 'Say what the message is for, and the notes it asks for, if any.',
  input_schema: {
    type: 'object' as const,
    properties: {
      mode: { type: 'string', enum: ['check_in', 'note', 'both'] },
      notes: {
        type: 'array',
        maxItems: MAX_NOTES,
        items: {
          type: 'object',
          properties: {
            project_id: { type: 'string', description: 'An id from the list, or "none".' },
            kind: { type: 'string', enum: ['thought', 'reminder'] },
            text: { type: 'string' },
          },
          required: ['project_id', 'kind', 'text'],
        },
      },
    },
    required: ['mode', 'notes'],
  },
}

export function intentUserMessage(words: string, projects: IntentProject[], lastReply: string | null): string {
  const list = projects.length
    ? projects.map((p) => `- id ${p.id}: "${p.title.trim() || 'Untitled'}"${p.intent ? `, about: ${String(p.intent).replace(/\s+/g, ' ').slice(0, 160)}` : ''}`).join('\n')
    : '(none)'
  return [
    `THEIR PROJECTS:\n${list}`,
    lastReply ? `THE COMPANION'S LAST REPLY (they may be answering it):\n${lastReply.slice(0, 500)}` : null,
    `THE MESSAGE:\n${words}`,
  ].filter(Boolean).join('\n\n')
}

/**
 * The tool's answer, made safe: ids only from the list, notes only when the
 * mode asks for them, and a note mode with nothing in it read as a check-in.
 */
export function parseIntent(raw: unknown, projectIds: string[]): MessageIntent {
  if (!raw || typeof raw !== 'object') return CHECK_IN_ONLY
  const r = raw as { mode?: unknown; notes?: unknown }
  const mode: IntentMode = r.mode === 'note' || r.mode === 'both' ? r.mode : 'check_in'
  if (mode === 'check_in') return CHECK_IN_ONLY

  const notes: ProposedNote[] = []
  for (const n of Array.isArray(r.notes) ? r.notes : []) {
    if (!n || typeof n !== 'object') continue
    const o = n as { project_id?: unknown; kind?: unknown; text?: unknown }
    const text = typeof o.text === 'string' ? o.text.replace(/[ \t]+/g, ' ').trim().slice(0, NOTE_MAX) : ''
    if (!text) continue
    const id = typeof o.project_id === 'string' && projectIds.includes(o.project_id) ? o.project_id : null
    notes.push({ project_id: id, kind: o.kind === 'reminder' ? 'reminder' : 'thought', text })
    if (notes.length >= MAX_NOTES) break
  }
  if (notes.length === 0) return CHECK_IN_ONLY
  return { mode, notes }
}
