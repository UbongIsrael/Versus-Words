import { describe, expect, it } from 'vitest'
import { encodeSignedMessage, normalizeWalletAddress, publicKeyToAddress } from './nimiq.ts'

describe('nimiq address', () => {
  it('normalizes spaced and compact forms', () => {
    const spaced = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'
    expect(normalizeWalletAddress(spaced)).toBe(spaced)
    expect(normalizeWalletAddress(spaced.replaceAll(' ', ''))).toBe(spaced)
    expect(normalizeWalletAddress('0xabc')).toBeNull()
  })

  it('derives a checksummed NQ address from a public key', () => {
    const address = publicKeyToAddress('11'.repeat(32))
    expect(normalizeWalletAddress(address)).toBe(address)
    expect(address.startsWith('NQ')).toBe(true)
    expect(address.split(' ')).toHaveLength(9)
  })

  it('prefixes signed messages the Nimiq way', () => {
    const bytes = encodeSignedMessage('hello')
    expect(new TextDecoder().decode(bytes).startsWith('\x16Nimiq Signed Message:\n')).toBe(true)
  })
})
