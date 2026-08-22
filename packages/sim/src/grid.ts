import { parseSeedHex, rngFromSeed, shuffleInPlace } from './rng.ts'

export const GRID_SIZE = 4
export const CELL_COUNT = GRID_SIZE * GRID_SIZE

/** Classic 1976 Boggle dice. "Qu" is one face. */
export const BOGGLE_DICE = [
  'AACIOT',
  'ABILTY',
  'ABJMOQ',
  'ACDEMP',
  'ACELRS',
  'ADENVZ',
  'AHMORS',
  'BIFORX',
  'DENOSW',
  'DKNOTU',
  'EEFHIY',
  'EGKLUY',
  'EGINTV',
  'EHINPS',
  'ELPSTU',
  'GILRUW',
] as const

export type Cell = string

export function generateGrid(seed: Uint8Array): Cell[] {
  const next = rngFromSeed(seed)
  const dice = shuffleInPlace([...BOGGLE_DICE], next)
  return dice.map((die) => {
    const face = die[Math.floor(next() * die.length)]!
    return face === 'Q' ? 'Qu' : face
  })
}

export function generateGridFromHex(seedHex: string): Cell[] {
  return generateGrid(parseSeedHex(seedHex))
}

export function cellIndex(row: number, col: number): number {
  return row * GRID_SIZE + col
}

export function cellRow(index: number): number {
  return Math.floor(index / GRID_SIZE)
}

export function cellCol(index: number): number {
  return index % GRID_SIZE
}

export function areAdjacent(a: number, b: number): boolean {
  if (a === b) return false
  if (a < 0 || b < 0 || a >= CELL_COUNT || b >= CELL_COUNT) return false
  const dr = Math.abs(cellRow(a) - cellRow(b))
  const dc = Math.abs(cellCol(a) - cellCol(b))
  return dr <= 1 && dc <= 1
}

export function lettersOf(cell: Cell): string {
  return cell.toUpperCase()
}
