import { writeFileSync } from 'node:fs'
import type { ChainTx } from './match.ts'
import { normalizeWalletAddress } from './nimiq.ts'

const RPC = process.env.NIMIQ_RPC ?? 'https://rpc.nimiqwatch.com'
const FAKE = process.env.FAKE_CHAIN === '1'
export const ESCROW_ADDRESS = process.env.ESCROW_ADDRESS ?? ''

type RpcTx = {
  hash: string
  from: string
  to: string
  value: number
  recipientData?: string
  senderData?: string
}

export function escrowConfigured(): boolean {
  return Boolean(normalizeWalletAddress(ESCROW_ADDRESS))
}

export function fakeChain(): boolean {
  return FAKE
}

export async function fetchTx(hash: string): Promise<ChainTx | null> {
  const data = await rpc<RpcTx>('getTransactionByHash', [hash])
  return data ? toChainTx(data) : null
}

export async function fetchIncoming(address: string, max = 50): Promise<ChainTx[]> {
  const data = await rpc<RpcTx[]>('getTransactionsByAddress', [address, max, null])
  return (data ?? []).map(toChainTx)
}

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!res.ok) throw new Error(`rpc-http-${res.status}`)
  const body = (await res.json()) as { result?: { data?: T }; error?: unknown }
  if (!body.result) return null
  return (body.result.data ?? null) as T | null
}

function toChainTx(tx: RpcTx): ChainTx {
  return {
    hash: tx.hash,
    from: tx.from,
    to: tx.to,
    value: tx.value,
    recipientData: tx.recipientData ?? tx.senderData ?? '',
  }
}

export function writeEnvExample(path: string) {
  writeFileSync(
    path,
    [
      'RUN_SECRET=',
      'ESCROW_ADDRESS=',
      'NIMIQ_RPC=https://rpc.nimiqwatch.com',
      'FAKE_CHAIN=0',
      '',
    ].join('\n'),
  )
}
