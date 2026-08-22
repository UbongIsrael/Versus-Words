/** Mulberry32 from a 32-byte seed. Deterministic across client and server. */
export function rngFromSeed(seed: Uint8Array): () => number {
  if (seed.length < 4) throw new Error('seed too short')
  let a = 1779033703
  for (const byte of seed) {
    a = Math.imul(a ^ byte, 3432918353)
    a = (a << 13) | (a >>> 19)
  }
  a = a >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffleInPlace<T>(items: T[], next: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    const tmp = items[i]!
    items[i] = items[j]!
    items[j] = tmp
  }
  return items
}

export function parseSeedHex(hex: string): Uint8Array {
  const clean = hex.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(clean)) throw new Error('seed must be 32 bytes hex')
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function seedToHex(seed: Uint8Array): string {
  return Array.from(seed, (b) => b.toString(16).padStart(2, '0')).join('')
}
