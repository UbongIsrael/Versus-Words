export type Dictionary = Set<string>

export function parseDictionary(text: string): Dictionary {
  const set = new Set<string>()
  for (const raw of text.split(/\r?\n/)) {
    const word = raw.trim().toUpperCase()
    if (word.length >= 3 && /^[A-Z]+$/.test(word)) set.add(word)
  }
  return set
}

export function hasWord(dict: Dictionary, word: string): boolean {
  return dict.has(word.toUpperCase())
}
