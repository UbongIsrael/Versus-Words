import { describe, expect, it } from 'vitest'
import {
  acceptRematch,
  applyFund,
  applyScore,
  canViewerClaim,
  createMatch,
  declineRematch,
  expireMatch,
  joinMatch,
  keepForClaim,
  leaveMatch,
  liveRematchOffer,
  markClaimed,
  markSeatFunded,
  memoBelongsTo,
  publicMatch,
  rematchFrom,
  requestRematch,
  sweepMatch,
  REMATCH_OFFER_MS,
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

function settledDuel() {
  const match = createMatch(ALICE, 1)
  joinMatch(match, BOB)
  applyFund(match, fundTx(ALICE, match.id), ESCROW)
  applyFund(match, fundTx(BOB, match.id), ESCROW)
  applyScore(match, ALICE, ['CAT'], [])
  applyScore(match, BOB, ['DOG'], [])
  return match
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

  it('marks a live run as playing in the public view', () => {
    const match = createMatch(ALICE, 1)
    joinMatch(match, BOB)
    applyFund(match, fundTx(ALICE, match.id), ESCROW)
    applyFund(match, fundTx(BOB, match.id), ESCROW)
    match.challenger.runId = 'run-1'
    match.challenger.runStartedAt = Date.now()
    const view = publicMatch(match, ALICE)
    expect(view.you?.playing).toBe(true)
    expect(view.challenger.playing).toBe(true)
    expect(view.opponent?.playing).toBe(false)
  })

  it('opens a rematch with a new seed, empty funds, and the same room code', () => {
    const match = createMatch(ALICE, 10)
    joinMatch(match, BOB)
    const next = rematchFrom(match)
    expect(next.id).not.toBe(match.id)
    expect(next.seed).not.toBe(match.seed)
    expect(next.code).toBe(match.code)
    expect(next.stakeLuna).toBe(1_000_000)
    expect(next.opponent?.address).toBe(BOB)
    expect(next.challenger.funded).toBe(false)
  })

  it('waits for the other player to accept a rematch', () => {
    const match = settledDuel()
    expect(requestRematch(match, ALICE, 1_000)).toBeNull()
    expect(liveRematchOffer(match, 1_000)?.from).toBe(ALICE)
    expect(() => acceptRematch(match, ALICE, 1_000)).toThrow('self-accept')
    const next = acceptRematch(match, BOB, 2_000)
    expect(next.code).toBe(match.code)
    expect(next.id).not.toBe(match.id)
    expect(match.rematchMatchId).toBe(next.id)
    expect(liveRematchOffer(match, 2_000)).toBeNull()
  })

  it('pairs both rematch clicks into one room', () => {
    const match = settledDuel()
    expect(requestRematch(match, ALICE, 1_000)).toBeNull()
    const next = requestRematch(match, BOB, 2_000)
    expect(next?.code).toBe(match.code)
    expect(match.rematchMatchId).toBe(next?.id)
  })

  it('expires a rematch offer after 5 seconds', () => {
    const match = settledDuel()
    expect(requestRematch(match, ALICE, 1_000)).toBeNull()
    expect(liveRematchOffer(match, 1_000 + REMATCH_OFFER_MS - 1)).toBeTruthy()
    expect(liveRematchOffer(match, 1_000 + REMATCH_OFFER_MS)).toBeNull()
    expect(sweepMatch(match, 1_000 + REMATCH_OFFER_MS)).toBe(true)
    expect(match.rematchOffer).toBeUndefined()
    expect(() => acceptRematch(match, BOB, 1_000 + REMATCH_OFFER_MS)).toThrow('no-offer')
  })

  it('keeps a USDT win claimable after the winner leaves', () => {
    const match = createMatch(ALICE, { amount: 3, asset: 'USDT' })
    joinMatch(match, BOB)
    markSeatFunded(match, ALICE, '0x1111111111111111111111111111111111111111', 'tx-a')
    markSeatFunded(match, BOB, '0x2222222222222222222222222222222222222222', 'tx-b')
    applyScore(match, ALICE, ['CAT', 'DOG'], [])
    applyScore(match, BOB, ['CAT'], [])
    leaveMatch(match, ALICE)
    expect(canViewerClaim(match, ALICE)).toBe(true)
    expect(canViewerClaim(match, BOB)).toBe(false)
    expect(keepForClaim(match)).toBe(true)
    expect(publicMatch(match, ALICE).claimedOnChain).toBe(false)
    markClaimed(match, '0xabc')
    expect(canViewerClaim(match, ALICE)).toBe(false)
    expect(publicMatch(match, ALICE).claimedOnChain).toBe(true)
  })

  it('lets both players claim a USDT tie', () => {
    const match = createMatch(ALICE, { amount: 1, asset: 'USDT' })
    joinMatch(match, BOB)
    markSeatFunded(match, ALICE, '0x1111111111111111111111111111111111111111', 'tx-a')
    markSeatFunded(match, BOB, '0x2222222222222222222222222222222222222222', 'tx-b')
    applyScore(match, ALICE, ['CAT'], [])
    applyScore(match, BOB, ['DOG'], [])
    expect(canViewerClaim(match, ALICE)).toBe(true)
    expect(canViewerClaim(match, BOB)).toBe(true)
  })

  it('lets either player decline a rematch offer', () => {
    const match = settledDuel()
    requestRematch(match, ALICE, 1_000)
    expect(declineRematch(match, BOB, 1_500)).toBe(true)
    expect(liveRematchOffer(match, 1_500)).toBeNull()
  })

  it('plays selected games in order and settles on summed rounds', () => {
    const match = createMatch(ALICE, { amount: 1, games: ['trace', 'anagrams'] })
    joinMatch(match, BOB)
    applyFund(match, fundTx(ALICE, match.id), ESCROW)
    applyFund(match, fundTx(BOB, match.id), ESCROW)
    applyScore(match, ALICE, ['CAT'], [])
    applyScore(match, BOB, ['DOG'], [])
    expect(match.settledAt).toBeUndefined()
    expect(match.round).toBe(1)
    expect(match.games).toEqual(['trace', 'anagrams'])
    expect(match.challenger.words).toBeUndefined()
    applyScore(match, ALICE, ['CAT', 'DOG'], [])
    applyScore(match, BOB, ['CAT'], [])
    expect(match.settledAt).toBeDefined()
    expect(match.winner).toBe(ALICE)
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
