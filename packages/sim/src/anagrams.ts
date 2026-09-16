import { parseSeedHex, rngFromSeed, shuffleInPlace } from './rng.ts'
import { pointsForAnagramLength, scoreAnagramWords } from './score.ts'
import { hasWord, type Dictionary } from './dictionary.ts'
import { RUN_DURATION_MS, type InputEvent, type RejectedInput, type VerifyErr, type VerifyOk } from './verify.ts'

export const ANAGRAM_LENGTH = 7

const sevenCache = new WeakMap<Dictionary, string[]>()

export function sevenLetterWords(dict: Dictionary): string[] {
  let list = sevenCache.get(dict)
  if (!list) {
    list = [...dict].filter((word) => word.length === ANAGRAM_LENGTH).sort()
    sevenCache.set(dict, list)
  }
  return list
}

export function pickAnagramSource(seedHex: string, dict: Dictionary): { source: string; rack: string[] } {
  const words = sevenLetterWords(dict)
  if (!words.length) throw new Error('no-seven-letter-words')
  const next = rngFromSeed(parseSeedHex(seedHex))
  const source = words[Math.floor(next() * words.length)]!
  const rack = shuffleInPlace(source.split(''), next)
  return { source, rack }
}

export function wordFromRack(rack: string[], cells: number[]): { ok: true; word: string } | { ok: false } {
  const used = new Set<number>()
  let word = ''
  for (const index of cells) {
    if (!Number.isInteger(index) || index < 0 || index >= rack.length || used.has(index)) return { ok: false }
    used.add(index)
    word += rack[index]
  }
  if (word.length < 3) return { ok: false }
  return { ok: true, word }
}

export function fitsRack(word: string, rack: string[]): boolean {
  const counts = new Map<string, number>()
  for (const ch of rack) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  for (const ch of word.toUpperCase()) {
    const n = counts.get(ch) ?? 0
    if (n < 1) return false
    counts.set(ch, n - 1)
  }
  return true
}

export function verifyAnagrams(
  seedHex: string,
  inputs: InputEvent[],
  dict: Dictionary,
  durationMs = RUN_DURATION_MS,
): VerifyOk | VerifyErr {
  if (!Array.isArray(inputs)) return { ok: false, error: 'bad-input-shape' }
  const { rack } = pickAnagramSource(seedHex, dict)
  let lastT = -1
  const found = new Map<string, number>()
  const rejected: RejectedInput[] = []

  for (let i = 0; i < inputs.length; i++) {
    const event = inputs[i]
    if (!event || typeof event.t !== 'number') return { ok: false, error: 'bad-input-shape' }
    if (!Number.isFinite(event.t) || event.t < 0) {
      rejected.push({ index: i, reason: 'bad-time' })
      continue
    }
    if (event.t < lastT) return { ok: false, error: 'non-monotonic' }
    lastT = event.t
    if (event.t > durationMs) {
      rejected.push({ index: i, reason: 'too-late' })
      continue
    }

    let word = ''
    if (Array.isArray(event.cells) && event.cells.length) {
      const parsed = wordFromRack(rack, event.cells)
      if (!parsed.ok) {
        rejected.push({ index: i, reason: 'bad-path' })
        continue
      }
      word = parsed.word
    } else if (typeof event.word === 'string') {
      word = event.word.trim().toUpperCase()
      if (word.length < 3 || !fitsRack(word, rack)) {
        rejected.push({ index: i, reason: 'bad-path' })
        continue
      }
    } else {
      return { ok: false, error: 'bad-input-shape' }
    }

    if (!hasWord(dict, word)) {
      rejected.push({ index: i, reason: 'not-a-word' })
      continue
    }
    if (!found.has(word)) found.set(word, pointsForAnagramLength(word.length))
  }

  const words = [...found.keys()].sort()
  return { ok: true, score: scoreAnagramWords(words), words, rejected }
}
