export async function isPayAvailable(): Promise<boolean> {
  try {
    return Boolean(await initPay())
  } catch {
    return false
  }
}

export async function listPayAddress(): Promise<string> {
  const nimiq = await initPay()
  if (!nimiq) throw new Error('not-in-pay')
  const accounts = await nimiq.listAccounts()
  if (isPayError(accounts)) throw new Error(accounts.error.type)
  const address = accounts[0]
  if (!address) throw new Error('no-account')
  return address
}

export async function sendStake(opts: {
  recipient: string
  valueLuna: number
  memo: string
}): Promise<string> {
  const nimiq = await initPay()
  if (!nimiq) throw new Error('not-in-pay')
  const hash = await nimiq.sendBasicTransactionWithData({
    recipient: opts.recipient,
    value: opts.valueLuna,
    data: opts.memo,
  })
  if (isPayError(hash)) throw new Error(hash.error.type)
  return hash
}

export async function signPayMessage(message: string): Promise<{ publicKey: string; signature: string }> {
  const nimiq = await initPay()
  if (!nimiq) throw new Error('not-in-pay')
  const signed = await nimiq.sign(message)
  if (isPayError(signed)) throw new Error(signed.error.type)
  return signed
}

function isPayError(value: unknown): value is { error: { type: string; message: string } } {
  return Boolean(value && typeof value === 'object' && 'error' in value)
}

async function initPay() {
  const { init } = await import('@nimiq/mini-app-sdk')
  try {
    return await init({ timeout: 1600 })
  } catch {
    return null
  }
}
