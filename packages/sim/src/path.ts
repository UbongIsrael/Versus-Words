import { areAdjacent, type Cell, lettersOf } from './grid.ts'

export const MIN_WORD_LENGTH = 3

export type PathError =
  | 'empty'
  | 'oob'
  | 'duplicate-cell'
  | 'not-adjacent'
  | 'too-short'

export type PathResult =
  | { ok: true; word: string }
  | { ok: false; error: PathError }

export function wordFromPath(grid: Cell[], cells: number[]): PathResult {
  if (cells.length === 0) return { ok: false, error: 'empty' }
  const seen = new Set<number>()
  let word = ''
  for (let i = 0; i < cells.length; i++) {
    const idx = cells[i]!
    if (!Number.isInteger(idx) || idx < 0 || idx >= grid.length) {
      return { ok: false, error: 'oob' }
    }
    if (seen.has(idx)) return { ok: false, error: 'duplicate-cell' }
    if (i > 0 && !areAdjacent(cells[i - 1]!, idx)) {
      return { ok: false, error: 'not-adjacent' }
    }
    seen.add(idx)
    word += lettersOf(grid[idx]!)
  }
  if (word.length < MIN_WORD_LENGTH) return { ok: false, error: 'too-short' }
  return { ok: true, word }
}

/** Backtrack if the player returns to the previous cell. */
export function extendPath(path: number[], next: number): number[] {
  if (path.length === 0) return [next]
  if (path[path.length - 1] === next) return path
  if (path.length >= 2 && path[path.length - 2] === next) {
    return path.slice(0, -1)
  }
  if (path.includes(next)) return path
  if (!areAdjacent(path[path.length - 1]!, next)) return path
  return [...path, next]
}
