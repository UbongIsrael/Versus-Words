import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  areAdjacent,
  extendPath,
  generateGrid,
  generateGridFromHex,
  parseDictionary,
  parseSeedHex,
  pickAnagramSource,
  pointsForAnagramLength,
  pointsForLength,
  RUN_DURATION_MS,
  seedToHex,
  sevenLetterWords,
  versusScores,
  verifyAnagrams,
  verifyRun,
  wordFromPath,
} from '../src/index.ts'

const seedA = parseSeedHex('11'.repeat(32))
const seedB = parseSeedHex('22'.repeat(32))

const tinyDict = parseDictionary('CAT\nDOG\nCOAT\nTACO\nFOO\nQUIZ\n')

describe('grid', () => {
  it('is deterministic for a seed', () => {
    expect(generateGrid(seedA)).toEqual(generateGrid(seedA))
    expect(generateGridFromHex(seedToHex(seedA))).toEqual(generateGrid(seedA))
  })

  it('changes when the seed changes', () => {
    expect(generateGrid(seedA)).not.toEqual(generateGrid(seedB))
  })

  it('is 16 cells and only legal faces', () => {
    const grid = generateGrid(seedA)
    expect(grid).toHaveLength(16)
    for (const cell of grid) {
      expect(cell === 'Qu' || /^[A-Z]$/.test(cell)).toBe(true)
    }
  })

  it('treats diagonals as adjacent', () => {
    expect(areAdjacent(0, 5)).toBe(true)
    expect(areAdjacent(0, 2)).toBe(false)
    expect(areAdjacent(5, 5)).toBe(false)
  })
})

describe('path', () => {
  const grid = ['C', 'A', 'T', 'X', 'O', 'A', 'T', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X']

  it('builds CAT from a straight path', () => {
    expect(wordFromPath(grid, [0, 1, 2])).toEqual({ ok: true, word: 'CAT' })
  })

  it('rejects a jump', () => {
    expect(wordFromPath(grid, [0, 2])).toEqual({ ok: false, error: 'not-adjacent' })
  })

  it('rejects a reused cell', () => {
    expect(wordFromPath(grid, [0, 1, 0])).toEqual({ ok: false, error: 'duplicate-cell' })
  })

  it('rejects short words', () => {
    expect(wordFromPath(grid, [0, 1])).toEqual({ ok: false, error: 'too-short' })
  })

  it('treats Qu as two letters', () => {
    const qGrid = ['Qu', 'I', 'Z', 'X', ...Array(12).fill('A')]
    expect(wordFromPath(qGrid, [0, 1, 2])).toEqual({ ok: true, word: 'QUIZ' })
  })

  it('backtracks when you return to the previous cell', () => {
    expect(extendPath([0, 1, 2], 1)).toEqual([0, 1])
    expect(extendPath([0], 1)).toEqual([0, 1])
    expect(extendPath([0, 1], 3)).toEqual([0, 1])
  })
})

describe('score', () => {
  it('uses the spec table', () => {
    expect(pointsForLength(3)).toBe(1)
    expect(pointsForLength(4)).toBe(1)
    expect(pointsForLength(5)).toBe(2)
    expect(pointsForLength(6)).toBe(3)
    expect(pointsForLength(7)).toBe(5)
    expect(pointsForLength(8)).toBe(11)
  })

  it('scores anagrams by length: 3=1, 4=2, 5=3', () => {
    expect(pointsForAnagramLength(3)).toBe(1)
    expect(pointsForAnagramLength(4)).toBe(2)
    expect(pointsForAnagramLength(5)).toBe(3)
    expect(pointsForAnagramLength(6)).toBe(4)
    expect(pointsForAnagramLength(7)).toBe(5)
    const vs = versusScores(['SET', 'REST', 'STEEL'], ['SET', 'LET'], pointsForAnagramLength)
    expect(vs.scoreA).toBe(2 + 3)
    expect(vs.scoreB).toBe(1)
  })

  it('zeros shared words in VS', () => {
    const result = versusScores(['CAT', 'COAT', 'ZZZ'], ['CAT', 'DOG'])
    expect(result.shared).toEqual(['CAT'])
    expect(result.uniqueA).toEqual(['COAT', 'ZZZ'])
    expect(result.uniqueB).toEqual(['DOG'])
    expect(result.scoreA).toBe(2)
    expect(result.scoreB).toBe(1)
  })
})

describe('verifyRun', () => {
  // C A T X
  // O A T X
  const grid = ['C', 'A', 'T', 'X', 'O', 'A', 'T', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X', 'X']

  it('scores unique valid words once', () => {
    const result = verifyRun(
      grid,
      [
        { t: 1000, cells: [0, 1, 2] },
        { t: 2000, cells: [0, 1, 2] },
        { t: 3000, cells: [0, 4, 1, 2] },
      ],
      tinyDict,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.words).toEqual(['CAT', 'COAT'])
    expect(result.score).toBe(2)
  })

  it('drops inputs after 90s', () => {
    const result = verifyRun(
      grid,
      [
        { t: 1000, cells: [0, 1, 2] },
        { t: RUN_DURATION_MS + 1, cells: [0, 4, 1, 2] },
      ],
      tinyDict,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.words).toEqual(['CAT'])
    expect(result.rejected.some((r) => r.reason === 'too-late')).toBe(true)
  })

  it('rejects a non-monotonic log as tampered', () => {
    const result = verifyRun(
      grid,
      [
        { t: 2000, cells: [0, 1, 2] },
        { t: 1000, cells: [0, 1, 2, 3] },
      ],
      tinyDict,
    )
    expect(result).toEqual({ ok: false, error: 'non-monotonic' })
  })

  it('does not score a jumped path or a non-word', () => {
    const result = verifyRun(
      grid,
      [
        { t: 10, cells: [0, 2] },
        { t: 20, cells: [0, 1, 2] },
        { t: 30, cells: [3, 2, 1] },
      ],
      tinyDict,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.words).toEqual(['CAT'])
    expect(result.rejected.map((r) => r.reason)).toEqual(['bad-path', 'not-a-word'])
  })
})

describe('anagrams', () => {
  const dict = parseDictionary('LETTERS\nLETTER\nSET\nREST\nLET\nTEST\nSTEEL\nTREE\nSEE\n')

  it('picks a seven-letter source and a shuffled rack from the seed', () => {
    const a = pickAnagramSource(seedToHex(seedA), dict)
    const b = pickAnagramSource(seedToHex(seedA), dict)
    expect(a.source).toBe(b.source)
    expect(a.source).toHaveLength(7)
    expect(a.rack.sort().join('')).toBe(a.source.split('').sort().join(''))
    expect(sevenLetterWords(dict)).toEqual(['LETTERS'])
  })

  it('accepts words that fit the rack and rejects extras', () => {
    const { rack } = pickAnagramSource(seedToHex(seedA), dict)
    const cells = rack.map((_, i) => i)
    const result = verifyAnagrams(
      seedToHex(seedA),
      [
        { t: 100, word: 'SET' },
        { t: 200, word: 'SET' },
        { t: 300, word: 'DOG' },
        { t: 400, cells: cells.slice(0, 3) },
      ],
      dict,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.words.includes('SET')).toBe(true)
    expect(result.rejected.some((r) => r.reason === 'bad-path' || r.reason === 'not-a-word')).toBe(true)
    expect(result.score).toBeGreaterThan(0)
  })
})

describe('dictionary file', () => {
  it('loads the vendored ENABLE list', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const text = readFileSync(resolve(here, '../../../data/enable.txt'), 'utf8')
    const dict = parseDictionary(text)
    expect(dict.size).toBeGreaterThan(100_000)
    expect(dict.has('CAT')).toBe(true)
    expect(dict.has('XYZZY')).toBe(false)
    expect(sevenLetterWords(dict).length).toBeGreaterThan(1000)
  })
})
