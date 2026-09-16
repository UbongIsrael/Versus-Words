import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export function newId(): string {
  return randomBytes(16).toString('hex')
}

export function newSeedHex(): string {
  return randomBytes(32).toString('hex')
}

export function dailySeedHex(secret: string, date: string, game = 'trace'): string {
  return createHmac('sha256', secret).update(`daily:${game}:${date}`).digest('hex')
}

export function roundSeedHex(seed: string, round: number): string {
  if (!round) return seed
  const bytes = Buffer.from(seed, 'hex')
  if (bytes.length < 32) return seed
  bytes[31] = (bytes[31]! ^ (round & 0xff)) & 0xff
  return bytes.toString('hex')
}

export function signRun(
  secret: string,
  payload: { runId: string; seed: string; mode: string; startTs: number; playerId: string; game?: string },
): string {
  const body = `${payload.runId}.${payload.seed}.${payload.mode}.${payload.startTs}.${payload.playerId}.${payload.game ?? 'trace'}`
  return createHmac('sha256', secret).update(body).digest('hex')
}

export function checkRunToken(
  secret: string,
  payload: { runId: string; seed: string; mode: string; startTs: number; playerId: string; game?: string },
  token: string,
): boolean {
  const expected = signRun(secret, payload)
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(token, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function maskPlayer(playerId: string): string {
  const compact = playerId.replace(/\s+/g, '')
  if (compact.startsWith('NQ') && compact.length >= 12) {
    return `${compact.slice(0, 6)}…${compact.slice(-4)}`
  }
  if (playerId.length < 8) return 'player'
  return `${playerId.slice(0, 4)}…${playerId.slice(-4)}`
}
