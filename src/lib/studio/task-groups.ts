// How a piece's tasks are grouped (migration 029). Pure, shared by the server
// routes, the writing page, the review screen and the canvas's task list.

export const WRITING = 'Writing'
/** Where tasks from before categories land when they aren't the writing itself. */
export const OTHER = 'Other'
export const MAX_CATEGORY = 60

export interface Categorised {
  type?: 'creation' | 'execution' | string
  is_writing_related?: boolean | null
  category?: string | null
}

/** The same test the writing page's Tasks tool always applied. */
export const isWritingTask = (task: Categorised) => task.type === 'creation' && task.is_writing_related !== false

export function categoryOf(task: Categorised): string {
  const own = task.category?.trim()
  if (own) return own
  return isWritingTask(task) ? WRITING : OTHER
}

export const cleanCategory = (raw: unknown): string =>
  typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, MAX_CATEGORY) : ''

/** Writing first, then the person's own categories in the order they first appear, "Other" last. `extra` are categories named but still empty. */
export function groupTasks<T extends Categorised>(tasks: T[], extra: string[] = []): Array<{ name: string; tasks: T[] }> {
  const map = new Map<string, T[]>()
  for (const task of tasks) {
    const name = categoryOf(task)
    map.set(name, [...(map.get(name) ?? []), task])
  }
  for (const name of extra) if (!map.has(name)) map.set(name, [])
  const names = [...map.keys()]
  const rank = (n: string) => (n === WRITING ? 0 : n === OTHER ? 2 : 1)
  names.sort((a, b) => rank(a) - rank(b))
  return names.map((name) => ({ name, tasks: map.get(name)! }))
}
