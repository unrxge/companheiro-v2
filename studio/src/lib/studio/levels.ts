// studio/src/lib/studio/levels.ts — the three altitudes, named once.
//
// Everything in the studio happens at one of three levels. Naming them here
// means the code, the comments and the interface all say the same words.
//
//   3  the shelf    every project, lying on the desk
//   2  the board    one project: its pieces, and the threads under them
//   1  the writing  one piece: its parts, and the words
//
// Only the writing is a page. The other two are canvases with edges.

export const LEVELS = {
  writing: { n: 1, key: 'writing', name: 'the writing' },
  board: { n: 2, key: 'board', name: 'the board' },
  shelf: { n: 3, key: 'shelf', name: 'the shelf' },
} as const

export type LevelKey = keyof typeof LEVELS
export const levelName = (key: LevelKey): string => LEVELS[key].name
