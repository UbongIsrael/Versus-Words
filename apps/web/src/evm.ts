import { encodeApprove, encodeLock, encodeSettle, encodeTimeoutRefund } from '../../api/src/abi.ts'

type Ethereum = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

function provider(): Ethereum {
  const eth = (window as Window & { ethereum?: Ethereum }).ethereum
  if (!eth) throw new Error('no-ethereum')
  return eth
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
