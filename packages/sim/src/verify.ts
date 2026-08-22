import type { Cell } from './grid.ts'
import { wordFromPath } from './path.ts'
import { pointsForLength, scoreWords } from './score.ts'
import { hasWord, type Dictionary } from './dictionary.ts'

export const RUN_DURATION_MS = 90_000

export type InputEvent = {
  t: number
  cells: number[]
}

export type RejectedInput = {
  index: number
  reason: 'too-late' | 'bad-time' | 'bad-path' | 'not-a-word'
}

export type VerifyReject =
  | 'non-monotonic'
  | 'bad-input-shape'

export type VerifyOk = {
  ok: true
  score: number
  words: string[]
  rejected: RejectedInput[]
}

export type VerifyErr = {
  ok: false
  error: VerifyReject
}

export function verifyRun(
  grid: Cell[],
  inputs: InputEvent[],
  dict: Dictionary,
  durationMs = RUN_DURATION_MS,
): VerifyOk | VerifyErr {
  if (!Array.isArray(inputs)) return { ok: false, error: 'bad-input-shape' }

  let lastT = -1
  const found = new Map<string, number>()
  const rejected: RejectedInput[] = []

  for (let i = 0; i < inputs.length; i++) {
    const event = inputs[i]
    if (!event || typeof event.t !== 'number' || !Array.isArray(event.cells)) {
      return { ok: false, error: 'bad-input-shape' }
    }
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
    if (!event.cells.every((c) => Number.isInteger(c))) {
      return { ok: false, error: 'bad-input-shape' }
    }

    const path = wordFromPath(grid, event.cells)
    if (!path.ok) {
      rejected.push({ index: i, reason: 'bad-path' })
      continue
    }
    if (!hasWord(dict, path.word)) {
      rejected.push({ index: i, reason: 'not-a-word' })
      continue
    }
    if (!found.has(path.word)) found.set(path.word, pointsForLength(path.word.length))
  }

  const words = [...found.keys()].sort()
  return {
    ok: true,
    score: scoreWords(words),
    words,
    rejected,
  }
}
