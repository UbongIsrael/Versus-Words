import { describe, expect, it } from 'vitest'
import { encodeLock, encodePotsQuery, matchBytes32, parsePot, settleDigest, toHex } from './abi.ts'

describe('polygon abi', () => {
  it('pads a match id to bytes32', () => {
    expect(matchBytes32('9cc5fd42284bd918')).toBe(
      '0x0000000000000000000000000000000000000000000000009cc5fd42284bd918',
    )
  })

  it('encodes lock and pots queries', () => {
    const lock = encodeLock('aa', 1_500_000n)
    expect(lock.startsWith('0x')).toBe(true)
    expect(lock.length).toBe(2 + 8 + 64 + 64)
    expect(encodePotsQuery('aa').length).toBe(2 + 8 + 64)
  })

  it('parses a public pot tuple', () => {
    const word = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0')
    const data =
      '0x' +
      [
        word('0000000000000000000000001111111111111111111111111111111111111111'),
        word('0000000000000000000000002222222222222222222222222222222222222222'),
        word((1_000_000).toString(16)),
        word((1_700_000_000).toString(16)),
        word('03'),
        word('00'),
      ].join('')
    const pot = parsePot(data)
    expect(pot.playerA).toBe('0x1111111111111111111111111111111111111111')
    expect(pot.deposits).toBe(3)
    expect(pot.settled).toBe(false)
    expect(pot.amount).toBe(1_000_000n)
  })

  it('hashes a settle digest to 32 bytes', () => {
    const digest = settleDigest('0xc2132d05d31c914a87c6611c10748aeb04b58e8f', 'aa', 1)
    expect(toHex(digest)).toHaveLength(64)
  })
})
