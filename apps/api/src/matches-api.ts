import type { Hono } from 'hono'
import type { InputEvent } from '@versus/sim'
import { ESCROW_ADDRESS, escrowConfigured, fakeChain, fetchIncoming, fetchTx } from './chain.ts'
import {
  acceptRematch,
  applyFund,
  applyScore,
  createMatch,
  declineRematch,
  keepForClaim,
  markClaimed,
  markSeatFunded,
  isClosed,
  isSettled,
  joinMatch,
  leaveMatch,
  publicMatch,
  payoutFor,
  requestRematch,
  seatOf,
  sweepMatch,
  touchPresence,
  normalizeRoomCode,
  RUN_MS,
  type Match,
} from './match.ts'
import { isGuestId, normalizeWalletAddress } from './nimiq.ts'
import { createMatchStore } from './persist.ts'
import type { Store } from './store.ts'
import { oracleAddress, playerDeposited, readPot, listOpenPotsForPlayer, signSettle, winnerCode, USDT_ESCROW, USDT_TOKEN, POLYGON_CHAIN_ID, usdtEscrowConfigured } from './polygon.ts'
import { newId, signRun } from './token.ts'

type PlayerFn = (c: { req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined } }) =>
  | string
  | null

export async function attachMatchRoutes(
  app: Hono,
  playerIdFrom: PlayerFn,
  opts: { secret: string; store: Store; dict: Set<string>; dataDir: string },
) {
  const matchStore = createMatchStore({ dataDir: opts.dataDir })
  const matches = new Map<string, Match>()
  for (const match of await matchStore.load()) matches.set(match.id, match)
  for (const match of matches.values()) sweepMatch(match)
  console.log(`matches: loaded ${matches.size} from ${matchStore.kind}`)

  let persistTimer: ReturnType<typeof setTimeout> | null = null
  let writing = Promise.resolve()

  function persist() {
    if (persistTimer) return
    persistTimer = setTimeout(() => {
      persistTimer = null
      writing = writing
        .then(() => matchStore.save([...matches.values()]))
        .catch((err) => console.warn('match persist failed', err))
    }, 400)
  }

  async function persistNow() {
    if (persistTimer) {
      clearTimeout(persistTimer)
      persistTimer = null
    }
    await writing
    await matchStore.save([...matches.values()])
  }

  function walletOf(c: Parameters<PlayerFn>[0]) {
    const id = playerIdFrom(c)
    if (!id || isGuestId(id)) return null
    return normalizeWalletAddress(id)
  }

  async function syncFunds(match: Match) {
    if (!escrowConfigured() || fakeChain()) return
    try {
      const incoming = await fetchIncoming(ESCROW_ADDRESS)
      for (const tx of incoming) {
        try {
          applyFund(match, tx, ESCROW_ADDRESS)
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      console.warn('chain sync failed', err)
    }
  }

  async function syncUsdtFunds(match: Match, nimiqWallet: string | null, evm?: string) {
    if ((match.asset ?? 'NIM') !== 'USDT' || fakeChain() || !usdtEscrowConfigured()) return
    if (isClosed(match) || isSettled(match)) return
    try {
      const pot = await readPot(match.id)
      if (!pot) return
      const mark = (seat: typeof match.challenger | null, addr: string) => {
        if (!seat || seat.funded) {
          if (seat && !seat.evmAddress) seat.evmAddress = addr
          return
        }
        markSeatFunded(match, seat.address, addr, `usdt-sync-${addr}`)
      }
      if (match.challenger.evmAddress && playerDeposited(pot, match.challenger.evmAddress)) {
        mark(match.challenger, match.challenger.evmAddress)
      }
      if (match.opponent?.evmAddress && playerDeposited(pot, match.opponent.evmAddress)) {
        mark(match.opponent, match.opponent.evmAddress)
      }
      if (evm && playerDeposited(pot, evm) && nimiqWallet) {
        const seat = seatOf(match, nimiqWallet)
        if (seat) mark(seat, evm)
      }
      const depositors: string[] = []
      if (pot.deposits & 1 && pot.playerA) depositors.push(pot.playerA)
      if (pot.deposits & 2 && pot.playerB) depositors.push(pot.playerB)
      const unfunded = [match.challenger, match.opponent].filter((s) => s && !s.funded)
      if (depositors.length === 1 && unfunded.length === 1 && unfunded[0] && nimiqWallet === unfunded[0].address) {
        mark(unfunded[0], depositors[0]!)
      }
    } catch (err) {
      console.warn('usdt sync failed', err)
    }
  }

  setInterval(() => {
    const now = Date.now()
    let dirty = false
    for (const [id, match] of matches) {
      if (sweepMatch(match, now)) dirty = true
      if (match.closedAt && now - match.closedAt > 60 * 60 * 1000 && !keepForClaim(match, now)) {
        matches.delete(id)
        dirty = true
      }
    }
    if (dirty) persist()
  }, 15_000)

  app.get('/api/config', (c) =>
    c.json({
      escrowAddress: escrowConfigured() ? ESCROW_ADDRESS : null,
      assets: ['NIM', 'USDT'],
      scoreModes: ['unique', 'count'],
      lunaPerNim: 100_000,
      fakeChain: fakeChain(),
      usdt: {
        token: USDT_TOKEN,
        escrow: usdtEscrowConfigured() ? USDT_ESCROW : null,
        chainId: POLYGON_CHAIN_ID,
        oracle: oracleAddress(),
      },
    }),
  )

  app.get('/api/claims', async (c) => {
    const evm = (c.req.query('evm') ?? '').trim().toLowerCase()
    if (!/^0x[0-9a-f]{40}$/.test(evm)) return c.json({ error: 'evm-required' }, 400)
    const extraIds = [...matches.values()]
      .filter((m) => (m.asset ?? 'NIM') === 'USDT' && (m.challenger.evmAddress === evm || m.opponent?.evmAddress === evm))
      .map((m) => m.id)
    const open = fakeChain()
      ? extraIds.flatMap((id) => {
          const match = matches.get(id)
          if (!match || match.claimedOnChain) return []
          return [{ id, pot: { amount: BigInt(match.stakeUnits), expiresAt: 0, playerA: evm, playerB: '', deposits: 3, settled: false } }]
        })
      : await listOpenPotsForPlayer(evm, extraIds)
    const nowSec = Math.floor(Date.now() / 1000)
    const claims = open.flatMap(({ id, pot }) => {
      const match = matches.get(id) ?? [...matches.values()].find((m) => m.id === id)
      const gameOver = Boolean(match && isSettled(match))
      const expired = pot.expiresAt > 0 && nowSec >= pot.expiresAt
      if (!gameOver && !expired) return []
      const wallet = walletOf(c)
      const payout = match && wallet ? payoutFor(match, wallet) : null
      const units = Number(pot.amount)
      const amount = (units / 1_000_000) * (payout?.kind === 'win' ? 2 : 1)
      return [
        {
          matchId: match?.id ?? id,
          amount,
          action: gameOver ? 'settle' : 'timeout',
        },
      ]
    })
    return c.json({ claims })
  })

  app.post('/api/matches/:id/claimed', async (c) => {
    const wallet = walletOf(c)
    if (!wallet) return c.json({ error: 'wallet-required' }, 401)
    const match = matches.get(c.req.param('id'))
    if (!match) return c.json({ error: 'unknown-match' }, 404)
    if (!seatOf(match, wallet)) return c.json({ error: 'not-seated' }, 403)
    const body = await c.req.json().catch(() => ({}))
    markClaimed(match, typeof body.txHash === 'string' ? body.txHash : undefined)
    persist()
    return c.json(publicMatch(match, wallet))
  })

  app.get('/api/transparency', (c) =>
    c.json({
      escrowAddress: escrowConfigured() ? ESCROW_ADDRESS : null,
      payouts: [...matches.values()]
        .flatMap((m) => m.payouts.map((p) => ({ matchId: m.id, settledAt: m.settledAt, ...p })))
        .slice(-50)
        .reverse(),
    }),
  )

  app.post('/api/matches', async (c) => {
    const wallet = walletOf(c)
    if (!wallet) return c.json({ error: 'wallet-required' }, 401)
    const body = await c.req.json().catch(() => ({}))
    try {
      const taken = (code: string) => [...matches.values()].some((m) => m.code === code && !m.settledAt)
      let code = typeof body.code === 'string' ? normalizeRoomCode(body.code) : null
      if (code && taken(code)) throw new Error('code-taken')
      let match = createMatch(wallet, {
        amount: Number(body.stakeAmount ?? body.stakeNim),
        asset: body.asset === 'USDT' ? 'USDT' : 'NIM',
        scoreMode: body.scoreMode === 'count' ? 'count' : 'unique',
        code: code ?? undefined,
      })
      for (let i = 0; i < 8 && taken(match.code); i++) {
        match = createMatch(wallet, {
          amount: Number(body.stakeAmount ?? body.stakeNim),
          asset: body.asset === 'USDT' ? 'USDT' : 'NIM',
          scoreMode: body.scoreMode === 'count' ? 'count' : 'unique',
        })
      }
      if (taken(match.code)) throw new Error('code-taken')
      matches.set(match.id, match)
      persist()
      return c.json(publicMatch(match, wallet), 201)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'bad-match' }, 400)
    }
  })

  app.get('/api/matches/code/:code', async (c) => {
    const code = normalizeRoomCode(c.req.param('code'))
    if (!code) return c.json({ error: 'bad-code' }, 400)
    const match = [...matches.values()].find((m) => m.code === code && !isClosed(m) && !m.settledAt)
    if (!match) return c.json({ error: 'unknown-match' }, 404)
    const wallet = walletOf(c)
    const evm = c.req.query('evm')?.trim().toLowerCase()
    if (wallet) await syncUsdtFunds(match, wallet, evm)
    persist()
    return c.json(publicMatch(match, wallet))
  })

  app.get('/api/matches/:id', async (c) => {
    const match = matches.get(c.req.param('id'))
    if (!match) return c.json({ error: 'unknown-match' }, 404)
    const wallet = walletOf(c)
    const evm = c.req.query('evm')?.trim().toLowerCase()
    if (wallet) {
      await syncFunds(match)
      await syncUsdtFunds(match, wallet, evm)
      touchPresence(match, wallet)
    }
    sweepMatch(match)
    persist()
    return c.json(publicMatch(match, wallet))
  })

  app.post('/api/matches/:id/leave', async (c) => {
    const wallet = walletOf(c)
    if (!wallet) return c.json({ error: 'wallet-required' }, 401)
    const match = matches.get(c.req.param('id'))
    if (!match) return c.json({ error: 'unknown-match' }, 404)
    leaveMatch(match, wallet)
    sweepMatch(match)
    persist()
    return c.json(publicMatch(match, wallet))
  })

  app.post('/api/matches/:id/join', async (c) => {
    const wallet = walletOf(c)
    if (!wallet) return c.json({ error: 'wallet-required' }, 401)
    const match = matches.get(c.req.param('id'))
    if (!match) return c.json({ error: 'unknown-match' }, 404)
    try {
      joinMatch(match, wallet)
      persist()
      return c.json(publicMatch(match, wallet))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'join-failed' }, 400)
    }
  })

  app.post('/api/matches/:id/fund', async (c) => {
    const wallet = walletOf(c)
    if (!wallet) return c.json({ error: 'wallet-required' }, 401)
    const match = matches.get(c.req.param('id'))
    if (!match) return c.json({ error: 'unknown-match' }, 404)
    if (isClosed(match) || isSettled(match)) return c.json({ error: 'settled' }, 409)
    joinMatchSafe(match, wallet)

    const body = await c.req.json().catch(() => ({}))
    try {
      if (fakeChain()) {
        if ((match.asset ?? 'NIM') === 'USDT') {
          markSeatFunded(match, wallet, String(body.evmAddress ?? '0x0000000000000000000000000000000000000001'), `fake-${wallet}-${match.id}`)
        } else {
          applyFund(
            match,
            {
              hash: `fake-${wallet}-${match.id}`,
              from: wallet,
              to: ESCROW_ADDRESS || wallet,
              value: match.stakeLuna,
              recipientData: match.memo,
            },
            ESCROW_ADDRESS || wallet,
          )
        }
        persist()
        return c.json(publicMatch(match, wallet))
      }
      if ((match.asset ?? 'NIM') === 'USDT') {
        if (!usdtEscrowConfigured()) return c.json({ error: 'usdt-escrow-unconfigured' }, 503)
        const evm = typeof body.evmAddress === 'string' ? body.evmAddress.toLowerCase() : ''
        if (!/^0x[0-9a-f]{40}$/.test(evm)) return c.json({ error: 'evm-required' }, 400)
        await syncUsdtFunds(match, wallet, evm)
        if (seatOf(match, wallet)?.funded) {
          persist()
          return c.json(publicMatch(match, wallet))
        }
        const pot = await readPot(match.id)
        if (!playerDeposited(pot, evm)) return c.json({ error: 'not-seen-on-chain' }, 409)
        markSeatFunded(match, wallet, evm, typeof body.txHash === 'string' ? body.txHash : `usdt-${evm}`)
        persist()
        return c.json(publicMatch(match, wallet))
      }
      if (!escrowConfigured()) return c.json({ error: 'escrow-unconfigured' }, 503)
      if (typeof body.txHash === 'string' && body.txHash) {
        const tx = await fetchTx(body.txHash)
        if (!tx) return c.json({ error: 'tx-not-found' }, 404)
        applyFund(match, tx, ESCROW_ADDRESS)
      } else {
        await syncFunds(match)
        if (!seatOf(match, wallet)?.funded) return c.json({ error: 'not-seen-on-chain' }, 409)
      }
      persist()
      return c.json(publicMatch(match, wallet))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'fund-failed' }, 400)
    }
  })

  app.post('/api/matches/:id/run', async (c) => {
    const wallet = walletOf(c)
    if (!wallet) return c.json({ error: 'wallet-required' }, 401)
    const match = matches.get(c.req.param('id'))
    if (!match) return c.json({ error: 'unknown-match' }, 404)
    if (isClosed(match) || isSettled(match)) return c.json({ error: 'settled' }, 409)
    const seat = seatOf(match, wallet)
    if (!seat?.funded) return c.json({ error: 'not-funded' }, 403)
    if (seat.words) return c.json({ error: 'already-scored' }, 409)
    if (seat.runId) {
      const existing = opts.store.getRun(seat.runId)
      const remaining = existing ? RUN_MS - (Date.now() - existing.startTs) : 0
      if (existing && !existing.consumed && remaining > 0) {
        return c.json({
          runId: existing.runId,
          seed: existing.seed,
          mode: existing.mode,
          startTs: existing.startTs,
          durationMs: RUN_MS,
          token: signRun(opts.secret, existing),
          matchId: match.id,
        })
      }
    }
    const runId = newId()
    const startTs = Date.now()
    const run = {
      runId,
      playerId: wallet,
      mode: 'versus' as const,
      seed: match.seed,
      startTs,
      consumed: false,
      matchId: match.id,
    }
    opts.store.putRun(run)
    seat.runId = runId
    seat.runStartedAt = startTs
    persist()
    return c.json({
      runId,
      seed: run.seed,
      mode: run.mode,
      startTs,
      durationMs: RUN_MS,
      token: signRun(opts.secret, run),
      matchId: match.id,
    })
  })

  app.get('/api/matches/:id/settle-sig', async (c) => {
    const match = matches.get(c.req.param('id'))
    if (!match) return c.json({ error: 'unknown-match' }, 404)
    if (!isSettled(match)) return c.json({ error: 'not-settled' }, 409)
    if ((match.asset ?? 'NIM') !== 'USDT') return c.json({ error: 'not-usdt' }, 400)
    const pot = await readPot(match.id)
    if (!pot) return c.json({ error: 'pot-missing' }, 404)
    const winnerEvm =
      match.winner === 'tie' || !match.winner
        ? 'tie'
        : seatOf(match, match.winner)?.evmAddress ?? null
    const code = winnerCode(pot, winnerEvm)
    try {
      const signed = signSettle(match.id, code)
      return c.json({ ...signed, winner: code, matchId: match.id })
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'sign-failed' }, 503)
    }
  })

  app.post('/api/matches/:id/rematch', async (c) => {
    const wallet = walletOf(c)
    if (!wallet) return c.json({ error: 'wallet-required' }, 401)
    const match = matches.get(c.req.param('id'))
    if (!match) return c.json({ error: 'unknown-match' }, 404)
    if (!seatOf(match, wallet)) return c.json({ error: 'not-seated' }, 403)
    try {
      const existingId = match.rematchMatchId
      if (existingId) {
        const existing = matches.get(existingId)
        if (existing) return c.json(publicMatch(existing, wallet))
      }
      const next = requestRematch(match, wallet)
      if (next) {
        matches.set(next.id, next)
        persist()
        return c.json(publicMatch(next, wallet), 201)
      }
      persist()
      return c.json(publicMatch(match, wallet))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'rematch-failed' }, 400)
    }
  })

  app.post('/api/matches/:id/rematch/accept', async (c) => {
    const wallet = walletOf(c)
    if (!wallet) return c.json({ error: 'wallet-required' }, 401)
    const match = matches.get(c.req.param('id'))
    if (!match) return c.json({ error: 'unknown-match' }, 404)
    try {
      if (match.rematchMatchId) {
        const existing = matches.get(match.rematchMatchId)
        if (existing) return c.json(publicMatch(existing, wallet))
      }
      const next = acceptRematch(match, wallet)
      matches.set(next.id, next)
      persist()
      return c.json(publicMatch(next, wallet), 201)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'accept-failed' }, 400)
    }
  })

  app.post('/api/matches/:id/rematch/decline', async (c) => {
    const wallet = walletOf(c)
    if (!wallet) return c.json({ error: 'wallet-required' }, 401)
    const match = matches.get(c.req.param('id'))
    if (!match) return c.json({ error: 'unknown-match' }, 404)
    try {
      declineRematch(match, wallet)
      persist()
      return c.json(publicMatch(match, wallet))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'decline-failed' }, 400)
    }
  })

  function applyVersusSubmit(runMatchId: string, playerId: string, words: string[], inputs: InputEvent[]) {
    const match = matches.get(runMatchId)
    if (!match) throw new Error('unknown-match')
    applyScore(match, playerId, words, inputs)
    persist()
    return publicMatch(match, playerId)
  }

  return { applyVersusSubmit, persistNow, storeKind: matchStore.kind }
}

function joinMatchSafe(match: Match, wallet: string) {
  try {
    joinMatch(match, wallet)
  } catch (err) {
    if (err instanceof Error && err.message === 'self-join') return
    if (seatOf(match, wallet)) return
    throw err
  }
}
