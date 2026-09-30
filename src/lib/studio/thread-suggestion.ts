/** Something that seems to run across several pieces of one project, offered as a thread. */
export interface ThreadSuggestion {
  id: string
  name: string
  intent: string
  piece_ids: string[]
  why: string
}
