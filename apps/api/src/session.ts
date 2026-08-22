import { createHmac, timingSafeEqual } from 'node:crypto'
import { newId } from './token.ts'

const CHALLENGE_TTL_MS = 5 * 60 * 1000
const SESSION_TTL_SEC = 60 * 60 * 24 * 14

export type Challenge = {
  id: string
  walletAddress: string
  message: string
  expiresAt: number
  used: boolean
}

export function createSessionStore() {
  const challenges = new Map<string, Challenge>()

  return {
    issue(walletAddress: string): Challenge {
      const id = newId()
      const issuedAt = new Date().toISOString()
      const expiresAt = Date.now() + CHALLENGE_TTL_MS
      const message = [
        'Versus Word login',
        `Wallet: ${walletAddress}`,
        `Nonce: ${id}`,
        `Issued: ${issuedAt}`,
        `Expires: ${new Date(expiresAt).toISOString()}`,
      ].join('\n')
      const challenge = { id, walletAddress, message, expiresAt, used: false }
      challenges.set(id, challenge)
      return challenge
    },
    take(id: string): Challenge | null {
      const challenge = challenges.get(id)
      if (!challenge || challenge.used) return null
      if (Date.now() > challenge.expiresAt) return null
      challenge.used = true
      return challenge
    },
  }
}

export type SessionStore = ReturnType<typeof createSessionStore>

export function signSession(secret: string, walletAddress: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SEC
  const payload = Buffer.from(JSON.stringify({ sub: walletAddress, exp })).toString('base64url')
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export function readSession(secret: string, token: string): string | null {
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const body = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      sub?: string
      exp?: number
    }
    if (typeof body.sub !== 'string' || typeof body.exp !== 'number') return null
    if (body.exp * 1000 < Date.now()) return null
    return body.sub
  } catch {
    return null
  }
}
