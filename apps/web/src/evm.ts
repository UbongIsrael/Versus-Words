import { encodeApprove, encodeLock, encodeSettle, encodeTimeoutRefund } from '../../api/src/abi.ts'

type Ethereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

function provider(): Ethereum {
  const eth = (window as Window & { ethereum?: Ethereum }).ethereum
  if (!eth) throw new Error('no-ethereum')
  return eth
}

const EVM_KEY = 'versus-evm-address'

function lockKey(matchId: string) {
  return `versus-lock:${matchId}`
}

export function rememberLock(matchId: string, evm: string, txHash: string) {
  localStorage.setItem(lockKey(matchId), JSON.stringify({ evm: evm.toLowerCase(), txHash }))
  localStorage.setItem(EVM_KEY, evm.toLowerCase())
}

export function recallLock(matchId: string): { evm: string; txHash: string } | null {
  try {
    const raw = localStorage.getItem(lockKey(matchId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as { evm?: string; txHash?: string }
    if (!parsed.evm || !parsed.txHash) return null
    return { evm: parsed.evm.toLowerCase(), txHash: parsed.txHash }
  } catch {
    return null
  }
}

async function waitForEthereum(ms = 2500): Promise<Ethereum | null> {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const eth = (window as Window & { ethereum?: Ethereum }).ethereum
    if (eth) return eth
    await new Promise((r) => setTimeout(r, 100))
  }
  return (window as Window & { ethereum?: Ethereum }).ethereum ?? null
}

/** No popup. Empty if the wallet is locked or not connected. */
export async function peekEvmAddress(): Promise<string | null> {
  const cached = localStorage.getItem(EVM_KEY)?.toLowerCase()
  if (cached && /^0x[0-9a-f]{40}$/.test(cached)) return cached
  try {
    const eth = await waitForEthereum()
    if (!eth) return null
    const accounts = (await eth.request({ method: 'eth_accounts' })) as string[]
    const address = accounts[0]
    if (!address) return null
    const evm = address.toLowerCase()
    localStorage.setItem(EVM_KEY, evm)
    return evm
  } catch {
    return null
  }
}

/** Prefer cache / silent accounts; prompt only if we still have nothing. Does not fail if chain switch is unsupported (Nimiq Pay). */
export async function resolveEvmAddress(chainId?: number): Promise<string | null> {
  const peeked = await peekEvmAddress()
  if (peeked) return peeked
  try {
    const eth = await waitForEthereum()
    if (!eth) return null
    if (chainId) {
      try {
        await ensureChain(eth, chainId)
      } catch {
        /* Pay may not switch networks; still request accounts. */
      }
    }
    const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
    const address = accounts[0]
    if (!address) return null
    const evm = address.toLowerCase()
    localStorage.setItem(EVM_KEY, evm)
    return evm
  } catch {
    return null
  }
}

export async function evmAccount(chainId: number): Promise<string> {
  const eth = provider()
  await ensureChain(eth, chainId)
  const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
  const address = accounts[0]
  if (!address) throw new Error('no-evm-account')
  return address.toLowerCase()
}

export async function lockUsdt(opts: {
  token: string
  escrow: string
  chainId: number
  matchId: string
  amount: bigint
}): Promise<{ evmAddress: string; txHash: string }> {
  const eth = provider()
  const from = await evmAccount(opts.chainId)
  await send(eth, {
    from,
    to: opts.token,
    data: encodeApprove(opts.escrow, opts.amount),
  })
  const txHash = await send(eth, {
    from,
    to: opts.escrow,
    data: encodeLock(opts.matchId, opts.amount),
  })
  rememberLock(opts.matchId, from, txHash)
  return { evmAddress: from, txHash }
}

export async function submitSettle(opts: {
  escrow: string
  chainId: number
  matchId: string
  winner: 0 | 1 | 2
  signature: string
}): Promise<string> {
  const eth = provider()
  const from = await evmAccount(opts.chainId)
  return send(eth, {
    from,
    to: opts.escrow,
    data: encodeSettle(opts.matchId, opts.winner, opts.signature),
  })
}

export async function submitTimeoutRefund(opts: {
  escrow: string
  chainId: number
  matchId: string
}): Promise<string> {
  const eth = provider()
  const from = await evmAccount(opts.chainId)
  return send(eth, {
    from,
    to: opts.escrow,
    data: encodeTimeoutRefund(opts.matchId),
  })
}

async function ensureChain(eth: Ethereum, chainId: number) {
  const hex = `0x${chainId.toString(16)}`
  const current = (await eth.request({ method: 'eth_chainId' })) as string
  if (current.toLowerCase() === hex) return
  try {
    await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] })
  } catch {
    throw new Error('switch-polygon')
  }
}

async function send(eth: Ethereum, tx: { from: string; to: string; data: string }): Promise<string> {
  const hash = await eth.request({
    method: 'eth_sendTransaction',
    params: [{ from: tx.from, to: tx.to, data: tx.data }],
  })
  if (typeof hash !== 'string') throw new Error('bad-tx')
  return hash
}
