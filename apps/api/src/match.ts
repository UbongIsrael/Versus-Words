import { versusScores, type InputEvent } from '@versus/sim'
import { normalizeWalletAddress } from './nimiq.ts'
import { newId, newSeedHex } from './token.ts'

export const LUNA_PER_NIM = 100_000
export const USDT_DECIMALS = 1_000_000
export const MATCH_TTL_MS = 24 * 60 * 60 * 1000
/** Empty lobby: nobody sat down. */
export const WAIT_FOR_JOIN_MS = 8 * 60 * 1000
/** Someone joined, but nobody finished a run. */
export const WAIT_FOR_PLAY_MS = 12 * 60 * 1000
/** After the result screen, rematch window then the code dies. */
export const SETTLED_KEEP_MS = 10 * 60 * 1000
/** Keep USDT pots around so a winner who left can still claim. */
export const CLAIM_KEEP_MS = 7 * 24 * 60 * 60 * 1000
/** Poll is 2.5s; if we have not seen you for this long, you left. */
export const PRESENCE_STALE_MS = 45 * 1000
export const LIVE_RUN_MS = 2 * 60 * 1000
export const RUN_MS = 90_000
export const REMATCH_OFFER_MS = 5_000
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export type Asset = 'NIM' | 'USDT'
export type ScoreMode = 'unique' | 'count'
export type GameKind = 'trace' | 'anagrams'
export const GAME_KINDS: GameKind[] = ['trace', 'anagrams']

export type MatchSetup = {
  amount: number
  asset?: Asset
  scoreMode?: ScoreMode
  code?: string
  games?: GameKind[]
}

export type Seat = {
  address: string
  funded: boolean
  fundTx?: string
  runId?: string
  runStartedAt?: number
  words?: string[]
  allWords?: string[]
  inputs?: InputEvent[]
  uniqueScore?: number
  roundScores?: number[]
  present?: boolean
  lastSeenAt?: number
  evmAddress?: string
}

export type Payout = {
  to: string
  luna: number
  kind: 'win' | 'refund'
  tx?: string
  error?: string
}

export type Match = {
  id: string
  code: string
  seed: string
  asset: Asset
  scoreMode: ScoreMode
  games: GameKind[]
  round: number
  stakeAmount: number
  stakeUnits: number
  /** @deprecated same as stakeUnits; kept so older persisted matches still load */
  stakeLuna: number
  memo: string
  createdAt: number
  expiresAt: number
  challenger: Seat
  opponent: Seat | null
  winner?: string | 'tie'
  payouts: Payout[]
  settledAt?: number
  lastActivityAt: number
  closedAt?: number
  closeReason?: 'idle-no-join' | 'idle-no-play' | 'empty' | 'expired' | 'settled'
  rematchOffer?: RematchOffer
  rematchMatchId?: string
  claimedOnChain?: boolean
  claimTx?: string
}

export type RematchOffer = {
  from: string
  expiresAt: number
}

export type ChainTx = {
  hash: string
  from: string
  to: string
  value: number
  recipientData: string
}

export function matchMemo(id: string): string {
  return `vw:${id}`
}

export function decodeMemo(data: string): string {
  const raw = data.trim()
  if (!raw) return ''
  if (/^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) {
    try {
      return new TextDecoder().decode(
        Uint8Array.from(raw.match(/.{2}/g)!.map((b) => Number.parseInt(b, 16))),
      )
    } catch {
      return raw
    }
  }
  return raw
}

export function memoBelongsTo(data: string, id: string): boolean {
  const text = decodeMemo(data).toLowerCase().replace(/\s+/g, '')
  const needle = id.toLowerCase()
  return text === needle || text === `vw:${needle}` || text.includes(`vw:${needle}`)
}

export function randomRoomCode(): string {
  let code = ''
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  return code
}

export function normalizeRoomCode(raw: string): string | null {
  const code = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (code.length < 4 || code.length > 8) return null
  if (![...code].every((ch) => CODE_ALPHABET.includes(ch) || /[0-9A-Z]/.test(ch))) return null
  return code
}

export function parseGames(raw: unknown): GameKind[] {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : []
  const out: GameKind[] = []
  for (const item of list) {
    if ((item === 'trace' || item === 'anagrams') && !out.includes(item)) out.push(item)
  }
  return out.length ? out : ['trace']
}

export function matchGames(match: Match): GameKind[] {
  return match.games?.length ? match.games : ['trace']
}

export function currentGame(match: Match): GameKind {
  const games = matchGames(match)
  return games[match.round ?? 0] ?? games[0] ?? 'trace'
}

export function unitsFor(amount: number, asset: Asset): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('bad-stake')
  if (asset === 'NIM') {
    if (amount < 0.1 || amount > 100_000) throw new Error('bad-stake')
    return Math.round(amount * LUNA_PER_NIM)
  }
  if (amount < 0.1 || amount > 100_000) throw new Error('bad-stake')
  return Math.round(amount * USDT_DECIMALS)
}

export function createMatch(
  challengerAddress: string,
  setup: number | MatchSetup,
  now = Date.now(),
): Match {
  const wallet = normalizeWalletAddress(challengerAddress)
  if (!wallet) throw new Error('bad-address')
  const options: MatchSetup = typeof setup === 'number' ? { amount: setup } : setup
  const asset: Asset = options.asset === 'USDT' ? 'USDT' : 'NIM'
  const scoreMode: ScoreMode = options.scoreMode === 'count' ? 'count' : 'unique'
  const games = parseGames(options.games)
  const stakeUnits = unitsFor(options.amount, asset)
  const id = newId().slice(0, 16)
  const code = normalizeRoomCode(options.code ?? '') ?? randomRoomCode()
  return {
    id,
    code,
    seed: newSeedHex(),
    asset,
    scoreMode,
    games,
    round: 0,
    stakeAmount: options.amount,
    stakeUnits,
    stakeLuna: stakeUnits,
    memo: matchMemo(id),
    createdAt: now,
    expiresAt: now + MATCH_TTL_MS,
    lastActivityAt: now,
    challenger: { address: wallet, funded: false, present: true, lastSeenAt: now },
    opponent: null,
    payouts: [],
  }
}

export function rematchFrom(previous: Match, now = Date.now()): Match {
  if (!previous.opponent) throw new Error('no-opponent')
  const next = createMatch(
    previous.challenger.address,
    {
      amount: previous.stakeAmount ?? previous.stakeLuna / LUNA_PER_NIM,
      asset: previous.asset ?? 'NIM',
      scoreMode: previous.scoreMode ?? 'unique',
      code: previous.code,
      games: previous.games,
    },
    now,
  )
  next.challenger.present = true
  next.challenger.lastSeenAt = now
  next.opponent = { address: previous.opponent.address, funded: false, present: true, lastSeenAt: now }
  return next
}

export function liveRematchOffer(match: Match, now = Date.now()): RematchOffer | null {
  if (!match.rematchOffer) return null
  if (now >= match.rematchOffer.expiresAt) return null
  return match.rematchOffer
}

export function requestRematch(match: Match, address: string, now = Date.now()): Match | null {
  if (!isSettled(match) || isClosed(match)) throw new Error('not-settled')
  if (match.rematchMatchId) throw new Error('already-rematched')
  const seat = seatOf(match, address)
  if (!seat) throw new Error('not-seated')
  const live = liveRematchOffer(match, now)
  if (live && live.from !== seat.address) return sealRematch(match, now)
  if (live && live.from === seat.address) return null
  match.rematchOffer = { from: seat.address, expiresAt: now + REMATCH_OFFER_MS }
  match.lastActivityAt = now
  return null
}

export function acceptRematch(match: Match, address: string, now = Date.now()): Match {
  if (!isSettled(match) || isClosed(match)) throw new Error('not-settled')
  if (match.rematchMatchId) throw new Error('already-rematched')
  const seat = seatOf(match, address)
  if (!seat) throw new Error('not-seated')
  const live = liveRematchOffer(match, now)
  if (!live) throw new Error('no-offer')
  if (live.from === seat.address) throw new Error('self-accept')
  return sealRematch(match, now)
}

export function declineRematch(match: Match, address: string, now = Date.now()): boolean {
  const seat = seatOf(match, address)
  if (!seat) throw new Error('not-seated')
  if (!match.rematchOffer) return false
  match.rematchOffer = undefined
  match.lastActivityAt = now
  return true
}

function sealRematch(match: Match, now: number): Match {
  const next = rematchFrom(match, now)
  match.rematchMatchId = next.id
  match.rematchOffer = undefined
  match.lastActivityAt = now
  return next
}

export function joinMatch(match: Match, address: string): Seat {
  if (isClosed(match) || isSettled(match)) throw new Error('room-closed')
  const wallet = normalizeWalletAddress(address)
  if (!wallet) throw new Error('bad-address')
  if (wallet === match.challenger.address) throw new Error('self-join')
  if (match.opponent && match.opponent.address !== wallet) throw new Error('seat-taken')
  if (!match.opponent) match.opponent = { address: wallet, funded: false, present: true, lastSeenAt: Date.now() }
  match.lastActivityAt = Date.now()
  return match.opponent
}

export function seatOf(match: Match, address: string): Seat | null {
  const wallet = normalizeWalletAddress(address)
  if (!wallet) return null
  if (match.challenger.address === wallet) return match.challenger
  if (match.opponent?.address === wallet) return match.opponent
  return null
}

export function bothFunded(match: Match): boolean {
  return match.challenger.funded && Boolean(match.opponent?.funded)
}

export function bothScored(match: Match): boolean {
  return Boolean(match.challenger.words && match.opponent?.words)
}

export function isSettled(match: Match): boolean {
  return Boolean(match.settledAt)
}

export function isClosed(match: Match): boolean {
  return Boolean(match.closedAt)
}

export function payoutFor(match: Match, address: string): Payout | null {
  const wallet = normalizeWalletAddress(address)
  if (!wallet) return null
  return match.payouts.find((p) => p.to === wallet) ?? null
}

export function keepForClaim(match: Match, _now = Date.now()): boolean {
  if ((match.asset ?? 'NIM') !== 'USDT' || match.claimedOnChain) return false
  return Boolean(match.challenger.funded || match.opponent?.funded)
}

export function canViewerClaim(match: Match, address: string, now = Date.now()): boolean {
  if (!keepForClaim(match, now)) return false
  const payout = payoutFor(match, address)
  return Boolean(payout && (payout.kind === 'win' || payout.kind === 'refund'))
}

export function markClaimed(match: Match, txHash?: string) {
  match.claimedOnChain = true
  if (txHash) match.claimTx = txHash
}

export function touchPresence(match: Match, address: string, now = Date.now()): Seat | null {
  const seat = seatOf(match, address)
  if (!seat) return null
  seat.present = true
  seat.lastSeenAt = now
  match.lastActivityAt = now
  return seat
}

export function leaveMatch(match: Match, address: string, now = Date.now()): boolean {
  const seat = seatOf(match, address)
  if (!seat) return false
  seat.present = false
  seat.lastSeenAt = now
  return true
}

export function hasLiveRun(match: Match, now = Date.now()): boolean {
  return [match.challenger, match.opponent].some(
    (seat) => Boolean(seat?.runId) && !seat?.words && now - (seat?.runStartedAt ?? 0) < LIVE_RUN_MS,
  )
}

export function closeRoom(
  match: Match,
  reason: NonNullable<Match['closeReason']>,
  now = Date.now(),
): boolean {
  if (isClosed(match)) return false
  if (!isSettled(match) && (match.challenger.funded || match.opponent?.funded)) {
    expireMatch(match, now)
  }
  match.closedAt = now
  match.closeReason = reason
  return true
}

export function sweepMatch(match: Match, now = Date.now()): boolean {
  let changed = false
  if (match.rematchOffer && now >= match.rematchOffer.expiresAt) {
    match.rematchOffer = undefined
    changed = true
  }
  if (isClosed(match)) return changed
  if (hasLiveRun(match, now)) return changed

  if (isSettled(match)) {
    if (now - (match.settledAt ?? now) >= SETTLED_KEEP_MS) return closeRoom(match, 'settled', now)
    return changed
  }

  if (now >= match.expiresAt) {
    expireMatch(match, now)
    return closeRoom(match, 'expired', now)
  }

  if (!match.opponent && now - match.createdAt >= WAIT_FOR_JOIN_MS) {
    return closeRoom(match, 'idle-no-join', now)
  }

  const started = Boolean(match.challenger.words || match.opponent?.words || match.challenger.runId)
  if (match.opponent && !started && now - (match.lastActivityAt ?? match.createdAt) >= WAIT_FOR_PLAY_MS) {
    return closeRoom(match, 'idle-no-play', now)
  }

  const seated = [match.challenger, match.opponent].filter((seat): seat is Seat => Boolean(seat))
  const allLeft = seated.length > 0 && seated.every((seat) => seat.present === false)
  if (allLeft && !started) {
    return closeRoom(match, 'empty', now)
  }

  return false
}

export function applyFund(match: Match, tx: ChainTx, escrowAddress: string): Seat {
  if (isClosed(match) || isSettled(match)) throw new Error('settled')
  const from = normalizeWalletAddress(tx.from)
  const to = normalizeWalletAddress(tx.to)
  const escrow = normalizeWalletAddress(escrowAddress)
  if (!from || !to || !escrow) throw new Error('bad-tx')
  if (to !== escrow) throw new Error('wrong-recipient')
  if (tx.value < stakeOf(match)) throw new Error('low-value')
  if (!memoBelongsTo(tx.recipientData, match.id)) throw new Error('bad-memo')
  const seat = seatOf(match, from)
  if (!seat) throw new Error('not-seated')
  if (seat.funded) {
    if (seat.fundTx === tx.hash) return seat
    throw new Error('already-funded')
  }
  if (fundTxUsed(match, tx.hash)) throw new Error('tx-reused')
  seat.funded = true
  seat.fundTx = tx.hash
  return seat
}

export function markSeatFunded(match: Match, nimiqAddress: string, evmAddress: string, txHash: string): Seat {
  if (isClosed(match) || isSettled(match)) throw new Error('settled')
  const seat = seatOf(match, nimiqAddress)
  if (!seat) throw new Error('not-seated')
  if (seat.funded) {
    if (seat.fundTx === txHash) return seat
    throw new Error('already-funded')
  }
  seat.funded = true
  seat.fundTx = txHash
  seat.evmAddress = evmAddress.toLowerCase()
  match.lastActivityAt = Date.now()
  return seat
}

export function applyScore(match: Match, address: string, words: string[], inputs: InputEvent[]): Seat {
  if (isClosed(match) || isSettled(match)) throw new Error('settled')
  const seat = seatOf(match, address)
  if (!seat) throw new Error('not-seated')
  if (!seat.funded) throw new Error('not-funded')
  if (seat.words) throw new Error('already-scored')
  seat.words = words
  seat.allWords = [...(seat.allWords ?? []), ...words]
  seat.inputs = inputs
  match.lastActivityAt = Date.now()
  if (bothScored(match)) finishRound(match)
  return seat
}

function roundPoints(match: Match): { scoreA: number; scoreB: number } {
  if (!match.opponent || !match.challenger.words || !match.opponent.words) {
    throw new Error('not-ready')
  }
  if ((match.scoreMode ?? 'unique') === 'count') {
    return { scoreA: match.challenger.words.length, scoreB: match.opponent.words.length }
  }
  const result = versusScores(match.challenger.words, match.opponent.words)
  return { scoreA: result.scoreA, scoreB: result.scoreB }
}

function finishRound(match: Match): Match {
  const { scoreA, scoreB } = roundPoints(match)
  match.challenger.roundScores = [...(match.challenger.roundScores ?? []), scoreA]
  match.opponent!.roundScores = [...(match.opponent!.roundScores ?? []), scoreB]
  const games = matchGames(match)
  const round = match.round ?? 0
  if (round + 1 < games.length) {
    match.round = round + 1
    for (const seat of [match.challenger, match.opponent]) {
      if (!seat) continue
      delete seat.words
      delete seat.inputs
      delete seat.runId
      delete seat.runStartedAt
      delete seat.uniqueScore
    }
    match.lastActivityAt = Date.now()
    return match
  }
  return settleFromScores(match)
}

export function settleFromScores(match: Match): Match {
  if (!match.opponent || !match.challenger.words || !match.opponent.words) {
    throw new Error('not-ready')
  }
  const units = stakeOf(match)
  let scoreA: number
  let scoreB: number
  if (match.challenger.roundScores?.length && match.opponent.roundScores?.length) {
    scoreA = match.challenger.roundScores.reduce((sum, n) => sum + n, 0)
    scoreB = match.opponent.roundScores.reduce((sum, n) => sum + n, 0)
  } else if ((match.scoreMode ?? 'unique') === 'count') {
    scoreA = match.challenger.words.length
    scoreB = match.opponent.words.length
  } else {
    const result = versusScores(match.challenger.words, match.opponent.words)
    scoreA = result.scoreA
    scoreB = result.scoreB
  }
  match.challenger.uniqueScore = scoreA
  match.opponent.uniqueScore = scoreB
  if (scoreA === scoreB) {
    match.winner = 'tie'
    match.payouts = [
      { to: match.challenger.address, luna: units, kind: 'refund' },
      { to: match.opponent.address, luna: units, kind: 'refund' },
    ]
  } else if (scoreA > scoreB) {
    match.winner = match.challenger.address
    match.payouts = [{ to: match.challenger.address, luna: units * 2, kind: 'win' }]
  } else {
    match.winner = match.opponent.address
    match.payouts = [{ to: match.opponent.address, luna: units * 2, kind: 'win' }]
  }
  match.settledAt = Date.now()
  return match
}

export function expireMatch(match: Match, now = Date.now()): boolean {
  if (isSettled(match) || now < match.expiresAt) return false
  const a = match.challenger
  const b = match.opponent
  const units = stakeOf(match)
  if (a.funded && b?.funded) {
    if (a.words && !b.words) {
      match.winner = a.address
      match.payouts = [{ to: a.address, luna: units * 2, kind: 'win' }]
    } else if (b.words && !a.words) {
      match.winner = b.address
      match.payouts = [{ to: b.address, luna: units * 2, kind: 'win' }]
    } else {
      match.winner = 'tie'
      match.payouts = [
        { to: a.address, luna: units, kind: 'refund' },
        { to: b.address, luna: units, kind: 'refund' },
      ]
    }
  } else if (a.funded && !b?.funded) {
    match.payouts = [{ to: a.address, luna: units, kind: 'refund' }]
  } else if (b?.funded && !a.funded) {
    match.payouts = [{ to: b.address, luna: units, kind: 'refund' }]
  } else {
    match.payouts = []
  }
  match.settledAt = now
  return true
}

export function publicMatch(match: Match, viewer?: string | null) {
  const you = viewer ? seatOf(match, viewer) : null
  const revealWords = bothScored(match) || isSettled(match)
  return {
    id: match.id,
    code: match.code,
    seed: bothFunded(match) || you?.funded ? match.seed : null,
    asset: match.asset ?? 'NIM',
    scoreMode: match.scoreMode ?? 'unique',
    games: matchGames(match),
    round: match.round ?? 0,
    game: currentGame(match),
    stakeAmount: match.stakeAmount ?? stakeOf(match) / (match.asset === 'USDT' ? USDT_DECIMALS : LUNA_PER_NIM),
    stakeUnits: stakeOf(match),
    stakeLuna: stakeOf(match),
    stakeNim: match.asset === 'USDT' ? match.stakeAmount : stakeOf(match) / LUNA_PER_NIM,
    memo: match.memo,
    createdAt: match.createdAt,
    expiresAt: match.expiresAt,
    settled: isSettled(match),
    closed: isClosed(match),
    closeReason: match.closeReason ?? null,
    winner: match.winner ?? null,
    payouts: match.payouts,
    bothFunded: bothFunded(match),
    bothScored: bothScored(match),
    you: you
      ? {
          address: you.address,
          funded: you.funded,
          scored: Boolean(you.words),
          playing: seatPlaying(you),
          words: you.allWords ?? you.words ?? null,
          uniqueScore: you.uniqueScore ?? null,
          evmAddress: you.evmAddress ?? null,
        }
      : null,
    challenger: publicSeat(match.challenger, revealWords),
    opponent: match.opponent ? publicSeat(match.opponent, revealWords) : null,
    overlay: overlayView(match),
    rematch: rematchView(match, you?.address ?? null),
    claimedOnChain: Boolean(match.claimedOnChain),
    claimTx: match.claimTx ?? null,
  }
}

function overlayView(match: Match) {
  if (!match.opponent || (!bothScored(match) && !isSettled(match))) return null
  const raw = versusScores(match.challenger.words ?? [], match.opponent.words ?? [])
  return {
    ...raw,
    scoreA: match.challenger.uniqueScore ?? raw.scoreA,
    scoreB: match.opponent.uniqueScore ?? raw.scoreB,
  }
}

function rematchView(match: Match, viewer: string | null) {
  if (!isSettled(match)) return null
  const offer = liveRematchOffer(match)
  return {
    nextId: match.rematchMatchId ?? null,
    from: offer?.from ?? null,
    expiresAt: offer?.expiresAt ?? null,
    remainingMs: offer ? Math.max(0, offer.expiresAt - Date.now()) : 0,
    youOffered: Boolean(offer && viewer && offer.from === viewer),
    incoming: Boolean(offer && viewer && offer.from !== viewer),
  }
}

function publicSeat(seat: Seat, reveal = false) {
  const words = seat.allWords ?? seat.words ?? []
  return {
    address: seat.address,
    funded: seat.funded,
    scored: Boolean(seat.words),
    playing: seatPlaying(seat),
    wordCount: words.length,
    words: reveal ? words : null,
    uniqueScore: seat.uniqueScore ?? null,
    evmAddress: seat.evmAddress ?? null,
  }
}

export function seatPlaying(seat: Seat, now = Date.now()): boolean {
  return Boolean(seat.runId && !seat.words && seat.runStartedAt && now - seat.runStartedAt < RUN_MS)
}

function stakeOf(match: Match): number {
  return match.stakeUnits ?? match.stakeLuna
}

function fundTxUsed(match: Match, hash: string): boolean {
  return match.challenger.fundTx === hash || match.opponent?.fundTx === hash
}
