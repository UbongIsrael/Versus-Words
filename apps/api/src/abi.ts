import { keccak_256 } from '@noble/hashes/sha3.js'

export function matchBytes32(id: string): `0x${string}` {
  const hex = id.replace(/^0x/, '').toLowerCase()
  if (!/^[0-9a-f]+$/.test(hex)) throw new Error('bad-id')
  return `0x${hex.padStart(64, '0')}`
}

export function selector(signature: string): string {
  const hash = keccak_256(new TextEncoder().encode(signature))
  return toHex(hash.slice(0, 4))
}

export function pad32(hex: string): string {
  return hex.replace(/^0x/, '').toLowerCase().padStart(64, '0')
}

export function encodeLock(id: string, amount: bigint): `0x${string}` {
  return `0x${selector('lock(bytes32,uint96)')}${pad32(matchBytes32(id))}${pad32(amount.toString(16))}`
}

export function encodeSettle(id: string, winner: 0 | 1 | 2, sigHex: string): `0x${string}` {
  const sig = sigHex.replace(/^0x/, '')
  const head = `${selector('settle(bytes32,uint8,bytes)')}${pad32(matchBytes32(id))}${pad32(winner.toString(16))}${pad32((32 * 3).toString(16))}`
  const tail = `${pad32((sig.length / 2).toString(16))}${sig}${sig.length / 2 % 32 === 0 ? '' : '0'.repeat(64 - (sig.length % 64))}`
  return `0x${head}${tail}`
}

export function encodeTimeoutRefund(id: string): `0x${string}` {
  return `0x${selector('timeoutRefund(bytes32)')}${pad32(matchBytes32(id))}`
}

export function encodePotsQuery(id: string): `0x${string}` {
  return `0x${selector('pots(bytes32)')}${pad32(matchBytes32(id))}`
}

export function lockedEventTopic(): `0x${string}` {
  return `0x${toHex(keccak_256(new TextEncoder().encode('Locked(bytes32,address,uint96)')))}`
}

export function addressTopic(addr: string): `0x${string}` {
  return `0x${pad32(addr)}`
}

export function idFromIndexedTopic(topic: string): string {
  return topic.replace(/^0x/, '').replace(/^0+/, '') || '0'
}

export function encodeApprove(spender: string, amount: bigint): `0x${string}` {
  return `0x${selector('approve(address,uint256)')}${pad32(spender)}${pad32(amount.toString(16))}`
}

export function settleDigest(escrow: string, id: string, winner: 0 | 1 | 2): Uint8Array {
  return keccak_256(abiEncodeAddressBytes32Uint8(escrow, matchBytes32(id), winner))
}

export function parsePot(data: string): {
  playerA: string
  playerB: string
  amount: bigint
  expiresAt: number
  deposits: number
  settled: boolean
} {
  const hex = data.replace(/^0x/, '')
  if (hex.length < 64 * 6) throw new Error('short-pot')
  const word = (i: number) => hex.slice(i * 64, (i + 1) * 64)
  return {
    playerA: addressFromWord(word(0)),
    playerB: addressFromWord(word(1)),
    amount: BigInt(`0x${word(2)}`),
    expiresAt: Number(BigInt(`0x${word(3)}`)),
    deposits: Number(BigInt(`0x${word(4)}`)),
    settled: BigInt(`0x${word(5)}`) !== 0n,
  }
}

function addressFromWord(word: string): string {
  return `0x${word.slice(24)}`
}

function abiEncodeAddressBytes32Uint8(addr: string, id: `0x${string}`, winner: number): Uint8Array {
  const out = new Uint8Array(32 * 3)
  writeHex(out, 12, pad32(addr).slice(24))
  writeHex(out, 32, pad32(id))
  writeHex(out, 64 + 31, winner.toString(16).padStart(2, '0'))
  return out
}

function writeHex(out: Uint8Array, offset: number, hex: string) {
  const clean = hex.replace(/^0x/, '')
  for (let i = 0; i < clean.length; i += 2) {
    out[offset + i / 2] = Number.parseInt(clean.slice(i, i + 2), 16)
  }
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
