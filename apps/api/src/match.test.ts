import { describe, expect, it } from 'vitest'
import {
  applyFund,
  applyScore,
  createMatch,
  expireMatch,
  joinMatch,
  leaveMatch,
  memoBelongsTo,
  rematchFrom,
  sweepMatch,
  WAIT_FOR_JOIN_MS,
} from './match.ts'

const ALICE = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'
const BOB = 'NQ08 0000 0000 0000 0000 0000 0000 0000 0000'
const ESCROW = 'NQ09 0000 0000 0000 0000 0000 0000 0000 0000'

function fundTx(from: string, matchId: string, value = 100_000) {
  return {
    hash: `tx-${from}-${matchId}`,
    from,
    to: ESCROW,
    value,
    recipientData: `vw:${matchId}`,
  }
}

describe('versus match', () => {
  it('accepts hex memos', () => {
    const id = 'deadbeefdeadbeef'
    const hex = Buffer.from(`vw:${id}`, 'utf8').toString('hex')
    expect(memoBelongsTo(hex, id)).toBe(true)
    expect(memoBelongsTo('nope', id)).toBe(false)
  })

  it('does not settle before both verified scores', () => {
    const match = createMatch(ALICE, 1)
    joinMatch(match, BOB)
    applyFund(match, fundTx(ALICE, match.id), ESCROW)
    applyFund(match, fundTx(BOB, match.id), ESCROW)
    applyScore(match, ALICE, ['CAT'], [])
    expect(match.settledAt).toBeUndefined()
    expect(match.payouts).toEqual([])
  })

  it('pays the unique-word winner and zeros shared words', () => {
    const match = createMatch(ALICE, 1)
    joinMatch(match, BOB)
    applyFund(match, fundTx(ALICE, match.id), ESCROW)
    applyFund(match, fundTx(BOB, match.id), ESCROW)
    applyScore(match, ALICE, ['CAT', 'COAT'], [])
    applyScore(match, BOB, ['CAT'], [])
    expect(match.winner).toBe(ALICE)
    expect(match.challenger.uniqueScore).toBe(1)
    expect(match.opponent?.uniqueScore).toBe(0)
    expect(match.payouts).toEqual([{ to: ALICE, luna: 200_000, kind: 'win' }])
  })

  it('refunds both on a unique-score tie', () => {
    const match = createMatch(ALICE, 5)
    joinMatch(match, BOB)
    applyFund(match, fundTx(ALICE, match.id, 500_000), ESCROW)
    applyFund(match, fundTx(BOB, match.id, 500_000), ESCROW)
    applyScore(match, ALICE, ['CAT'], [])
    applyScore(match, BOB, ['DOG'], [])
    expect(match.winner).toBe('tie')
    expect(match.payouts).toHaveLength(2)
    expect(match.payouts.every((p) => p.kind === 'refund' && p.luna === 500_000)).toBe(true)
  })

  it('rejects a second score or an unfunded play', () => {
    const match = createMatch(ALICE, 1)
    expect(() => applyScore(match, ALICE, ['CAT'], [])).toThrow('not-funded')
    applyFund(match, fundTx(ALICE, match.id), ESCROW)
    applyScore(match, ALICE, ['CAT'], [])
    expect(() => applyScore(match, ALICE, ['DOG'], [])).toThrow('already-scored')
  })

  it('refunds a lone funded challenger after expiry', () => {
    const match = createMatch(ALICE, 1, 0)
    applyFund(match, fundTx(ALICE, match.id), ESCROW)
    expect(expireMatch(match, match.expiresAt + 1)).toBe(true)
    expect(match.payouts).toEqual([{ to: ALICE, luna: 100_000, kind: 'refund' }])
  })

  it('awards the pot to the only submitted run after expiry', () => {
    const match = createMatch(ALICE, 1, 0)
    joinMatch(match, BOB)
    applyFund(match, fundTx(ALICE, match.id), ESCROW)
    applyFund(match, fundTx(BOB, match.id), ESCROW)
    applyScore(match, ALICE, ['CAT'], [])
    expireMatch(match, match.expiresAt + 1)
    expect(match.winner).toBe(ALICE)
    expect(match.payouts[0]?.luna).toBe(200_000)
  })

  it('blocks joining your own match and reuse of a fund tx', () => {
    const match = createMatch(ALICE, 1)
    expect(() => joinMatch(match, ALICE)).toThrow('self-join')
    applyFund(match, fundTx(ALICE, match.id), ESCROW)
    expect(() => applyFund(match, fundTx(ALICE, match.id), ESCROW)).not.toThrow()
    expect(() => applyFund(match, { ...fundTx(ALICE, match.id), hash: 'other-tx' }, ESCROW)).toThrow(
      'already-funded',
    )
  })

  it('opens a rematch with a new seed and empty funds', () => {
    const match = createMatch(ALICE, 10)
    joinMatch(match, BOB)
    const next = rematchFrom(match)
    expect(next.id).not.toBe(match.id)
    expect(next.seed).not.toBe(match.seed)
    expect(next.stakeLuna).toBe(1_000_000)
    expect(next.opponent?.address).toBe(BOB)
    expect(next.challenger.funded).toBe(false)
  })

  it('accepts a custom NIM amount and a short room code', () => {
    const match = createMatch(ALICE, { amount: 2.5, asset: 'NIM', scoreMode: 'unique', code: 'K7NP2Q' })
    expect(match.stakeUnits).toBe(250_000)
    expect(match.code).toBe('K7NP2Q')
    expect(match.asset).toBe('NIM')
  })

  it('kills a lobby that nobody joined', () => {
    const match = createMatch(ALICE, 1, 0)
    expect(sweepMatch(match, WAIT_FOR_JOIN_MS - 1)).toBe(false)
    expect(sweepMatch(match, WAIT_FOR_JOIN_MS)).toBe(true)
    expect(match.closeReason).toBe('idle-no-join')
    expect(() => joinMatch(match, BOB)).toThrow('room-closed')
  })

  it('kills the room when everyone leaves before a run', () => {
    const match = createMatch(ALICE, 1)
    joinMatch(match, BOB)
    leaveMatch(match, ALICE)
    leaveMatch(match, BOB)
    expect(sweepMatch(match)).toBe(true)
    expect(match.closeReason).toBe('empty')
  })

  it('does not kill a room while a run is live', () => {
    const match = createMatch(ALICE, 1)
    joinMatch(match, BOB)
    applyFund(match, fundTx(ALICE, match.id), ESCROW)
    match.challenger.runId = 'run-1'
    match.challenger.runStartedAt = Date.now()
    leaveMatch(match, ALICE)
    leaveMatch(match, BOB)
    expect(sweepMatch(match)).toBe(false)
    expect(match.closedAt).toBeUndefined()
  })

  it('awards most-words mode by count, not unique points', () => {
    const match = createMatch(ALICE, { amount: 1, scoreMode: 'count' })
    joinMatch(match, BOB)
    applyFund(match, fundTx(ALICE, match.id), ESCROW)
    applyFund(match, fundTx(BOB, match.id), ESCROW)
    applyScore(match, ALICE, ['CAT'], [])
    applyScore(match, BOB, ['DOG', 'GOD'], [])
    expect(match.winner).toBe(BOB)
    expect(match.challenger.uniqueScore).toBe(1)
    expect(match.opponent?.uniqueScore).toBe(2)
  })
})
