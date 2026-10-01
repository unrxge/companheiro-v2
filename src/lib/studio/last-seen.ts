// What the project list last looked like, kept in memory for the life of the
// tab. Coming back to the Project Board or Home paints from this at once while
// the fresh copy loads, instead of starting from a loading state every time.
// It is only ever a first paint: whoever reads it still fetches, and replaces it.

import type { ShelfProject } from '@/lib/studio/types'

let projects: ShelfProject[] | null = null

export const lastSeenProjects = {
  get: (): ShelfProject[] | null => projects,
  set: (next: ShelfProject[]) => {
    projects = next
  },
  /** On sign-out, and whenever the sign-in page is shown: the next person in
   *  this tab must never be shown the last one's list. */
  clear: () => {
    projects = null
  },
}
