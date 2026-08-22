import { blake2b } from '@noble/hashes/blake2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { verifyAsync } from '@noble/ed25519'

const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVXY'
const ADDRESS_RE = /^NQ[0-9]{2}(?:\s?[A-Z0-9]{4}){8}$/
const PREFIX = '\x16Nimiq Signed Message:\n'

export function normalizeWalletAddress(value: string): string | null {
  const compact = value.trim().replace(/\s+/g, '').toUpperCase()
  if (!/^NQ[0-9]{2}[A-Z0-9]{32}$/.test(compact)) return null
  const spaced = compact.match(/.{1,4}/g)!.join(' ')
  return ADDRESS_RE.test(spaced) ? spaced : null
}

export function compactAddress(value: string): string {
  return value.replace(/\s+/g, '')
}

export function maskWallet(value: string): string {
  const compact = compactAddress(value)
  if (compact.length < 12) return 'wallet'
  return `${compact.slice(0, 6)}…${compact.slice(-4)}`
}

export function encodeSignedMessage(message: string): Uint8Array {
  const encoder = new TextEncoder()
  const messageBytes = encoder.encode(message)
  const prefixBytes = encoder.encode(`${PREFIX}${messageBytes.byteLength}`)
  const payload = new Uint8Array(prefixBytes.byteLength + messageBytes.byteLength)
  payload.set(prefixBytes)
  payload.set(messageBytes, prefixBytes.byteLength)
  return payload
}

export function publicKeyToAddress(publicKeyHex: string): string {
  const publicKey = fromHex(publicKeyHex, 32)
  const addressBytes = blake2b(publicKey, { dkLen: 32 }).slice(0, 20)
  const base32 = encodeBase32(addressBytes)
  const checksum = 98 - ibanChecksum(`NQ00${base32}`)
  const compact = `NQ${String(checksum).padStart(2, '0')}${base32}`
  return compact.match(/.{1,4}/g)!.join(' ')
}

export async function verifyWalletProof(input: {
  message: string
  walletAddress: string
  publicKey: string
  signature: string
}): Promise<{ ok: true; walletAddress: string } | { ok: false; error: string }> {
  const wallet = normalizeWalletAddress(input.walletAddress)
  if (!wallet) return { ok: false, error: 'bad-address' }
  if (!isHex(input.publicKey, 64) || !isHex(input.signature, 128)) {
    return { ok: false, error: 'bad-proof-format' }
  }
  try {
    const derived = publicKeyToAddress(input.publicKey)
    if (derived !== wallet) return { ok: false, error: 'key-mismatch' }
    const ok = await verifyAsync(
      fromHex(input.signature, 64),
      sha256(encodeSignedMessage(input.message)),
      fromHex(input.publicKey, 32),
    )
    if (!ok) return { ok: false, error: 'bad-signature' }
    return { ok: true, walletAddress: wallet }
  } catch {
    return { ok: false, error: 'verify-failed' }
  }
}

export function isGuestId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{8,80}$/.test(value) && !value.startsWith('NQ')
}

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      bits -= 5
      output += ALPHABET[(value >>> bits) & 31]
      value &= (1 << bits) - 1
    }
  }
  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31]!
  return output
}

function ibanChecksum(iban: string): number {
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`
  let checksum = 0
  for (const character of rearranged) {
    const numeric = /[0-9]/.test(character) ? character : String(character.charCodeAt(0) - 55)
    for (const digit of numeric) checksum = (checksum * 10 + Number(digit)) % 97
  }
  return checksum
}

function fromHex(value: string, bytes: number): Uint8Array {
  const clean = value.toLowerCase()
  if (!isHex(clean, bytes * 2)) throw new Error('hex')
  const out = new Uint8Array(bytes)
  for (let i = 0; i < bytes; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function isHex(value: string, length: number): boolean {
  return typeof value === 'string' && value.length === length && /^[a-fA-F0-9]+$/.test(value)
}
