export function pointsForLength(length: number): number {
  if (length < 3) return 0
  if (length === 3 || length === 4) return 1
  if (length === 5) return 2
  if (length === 6) return 3
  if (length === 7) return 5
  return 11
}

export function scoreWords(words: Iterable<string>): number {
  let total = 0
  for (const word of words) total += pointsForLength(word.length)
  return total
}

/** VS: words both found are worth 0. */
export function versusScores(
  wordsA: Iterable<string>,
  wordsB: Iterable<string>,
): { scoreA: number; scoreB: number; uniqueA: string[]; uniqueB: string[]; shared: string[] } {
  const a = new Set(wordsA)
  const b = new Set(wordsB)
  const uniqueA: string[] = []
  const uniqueB: string[] = []
  const shared: string[] = []
  for (const word of a) {
    if (b.has(word)) shared.push(word)
    else uniqueA.push(word)
  }
  for (const word of b) {
    if (!a.has(word)) uniqueB.push(word)
  }
  uniqueA.sort()
  uniqueB.sort()
  shared.sort()
  return {
    scoreA: scoreWords(uniqueA),
    scoreB: scoreWords(uniqueB),
    uniqueA,
    uniqueB,
    shared,
  }
}
