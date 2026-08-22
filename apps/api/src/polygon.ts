import { keccak_256 } from '@noble/hashes/sha3.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import {
  encodePotsQuery,
  matchBytes32,
  parsePot,
  settleDigest,
  toHex,
} from './abi.ts'

export const POLYGON_CHAIN_ID = Number(process.env.POLYGON_CHAIN_ID ?? 137)
export const USDT_TOKEN = (process.env.USDT_TOKEN ?? '0xc2132d05d31c914a87c6611c10748aeb04b58e8f').toLowerCase()
export const USDT_ESCROW = (process.env.USDT_ESCROW ?? '').toLowerCase()
export const POLYGON_RPC = process.env.POLYGON_RPC ?? 'https://polygon-bor-rpc.publicnode.com'
const ORACLE_KEY = (process.env.POLYGON_ORACLE_KEY ?? '').replace(/^0x/, '')

export function usdtEscrowConfigured(): boolean {
  return /^0x[0-9a-f]{40}$/.test(USDT_ESCROW)
}

export function oracleAddress(): string | null {
  if (!/^[0-9a-f]{64}$/.test(ORACLE_KEY)) return null
  const pub = secp256k1.getPublicKey(ORACLE_KEY, false)
  const hash = keccak_256(pub.slice(1))
  return `0x${toHex(hash.slice(12))}`
}

export async function readPot(id: string) {
  if (!usdtEscrowConfigured()) return null
  const data = await ethCall(USDT_ESCROW, encodePotsQuery(id))
  if (!data || data === '0x') return null
  return parsePot(data)
}

export function playerDeposited(pot: ReturnType<typeof parsePot>, evm: string): boolean {
  if (!pot) return false
  const addr = evm.toLowerCase()
  if (pot.playerA === addr) return (pot.deposits & 1) !== 0
  if (pot.playerB === addr) return (pot.deposits & 2) !== 0
  return false
}

export function signSettle(id: string, winner: 0 | 1 | 2): { signature: string; oracle: string } {
  const oracle = oracleAddress()
  if (!oracle || !usdtEscrowConfigured()) throw new Error('oracle-unconfigured')
  const digest = settleDigest(USDT_ESCROW, id, winner)
  const prefixed = keccak_256(
    concat(new TextEncoder().encode('\x19Ethereum Signed Message:\n32'), digest),
  )
  const sig = secp256k1.sign(prefixed, ORACLE_KEY)
  const r = sig.r.toString(16).padStart(64, '0')
  const s = sig.s.toString(16).padStart(64, '0')
  const v = (sig.recovery + 27).toString(16).padStart(2, '0')
  return { signature: `0x${r}${s}${v}`, oracle }
}

export function winnerCode(
  pot: NonNullable<ReturnType<typeof parsePot>>,
  winnerEvm: string | 'tie' | null,
): 0 | 1 | 2 {
  if (!winnerEvm || winnerEvm === 'tie') return 0
  const addr = winnerEvm.toLowerCase()
  if (addr === pot.playerA) return 1
  if (addr === pot.playerB) return 2
  return 0
}

export { matchBytes32 }

async function ethCall(to: string, data: string): Promise<string> {
  const res = await fetch(POLYGON_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  })
  const body = (await res.json()) as { result?: string; error?: { message: string } }
  if (body.error) throw new Error(body.error.message)
  return body.result ?? '0x'
}

function concat(a: Uint8Array, b: Uint8Array) {
  const out = new Uint8Array(a.length + b.length)
  out.set(a)
  out.set(b, a.length)
  return out
}
