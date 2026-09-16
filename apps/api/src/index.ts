import './load-env.ts'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  generateGridFromHex,
  parseDictionary,
  verifyAnagrams,
  verifyRun,
  type InputEvent,
} from '@versus/sim'
import { attachMatchRoutes } from './matches-api.ts'
import { isGuestId, normalizeWalletAddress, verifyWalletProof } from './nimiq.ts'
import { createSessionStore, readSession, signSession } from './session.ts'
import { createStore, utcDate, type Mode } from './store.ts'
import { checkRunToken, dailySeedHex, maskPlayer, newId, newSeedHex, signRun } from './token.ts'

const PORT = Number(process.env.PORT ?? 8787)
const SECRET = process.env.RUN_SECRET ?? 'versus-word-dev-secret'
const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../..')
const DICT_PATH = resolve(HERE, process.env.DICT_PATH ?? '../../../data/enable.txt')
const DATA_DIR = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : resolve(ROOT, 'data')
const CORS_ORIGINS = (process.env.CORS_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean)

const dict = parseDictionary(readFileSync(DICT_PATH, 'utf8'))
const store = createStore()
const sessions = createSessionStore()

function allowedOrigin(origin: string): boolean {
  const normalized = origin.replace(/\/$/, '')
  if (CORS_ORIGINS.includes('*') || CORS_ORIGINS.includes(normalized)) return true
  try {
    const url = new URL(origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true
    if (/^192\.168\.\d+\.\d+$/.test(url.hostname)) return true
    if (/^10\.\d+\.\d+\.\d+$/.test(url.hostname)) return true
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(url.hostname)) return true
    return false
  } catch {
    return false
  }
}

const app = new Hono()
app.use(
  '*',
  cors({
    origin: (origin) => (origin && allowedOrigin(origin) ? origin : undefined),
    allowHeaders: ['Content-Type', 'Authorization', 'X-Player-Id'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }),
)

let matchStoreKind = 'pending'
app.get('/health', (c) =>
  c.json({ ok: true, words: dict.size, date: utcDate(), matches: matchStoreKind }),
)

app.get('/dictionary.txt', (c) => {
  const text = readFileSync(DICT_PATH, 'utf8')
  return c.body(text, 200, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'public, max-age=86400',
  })
})

function playerIdFrom(c: {
  req: { header: (n: string) => string | undefined; query: (n: string) => string | undefined }
}) {
  const bearer = c.req.header('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (bearer) {
    const wallet = readSession(SECRET, bearer)
    if (wallet) return wallet
  }
  const raw = (c.req.header('x-player-id') ?? c.req.query('playerId') ?? '').trim()
  const wallet = normalizeWalletAddress(raw)
  if (wallet) return wallet
  if (isGuestId(raw)) return raw
  return null
}

app.get('/api/session', (c) => {
  const playerId = playerIdFrom(c)
  if (!playerId || isGuestId(playerId)) return c.json({ connected: false })
  return c.json({ connected: true, address: playerId, label: maskPlayer(playerId) })
})

app.post('/api/session/challenge', async (c) => {
  const body = await c.req.json().catch(() => null)
  const wallet = typeof body?.walletAddress === 'string' ? normalizeWalletAddress(body.walletAddress) : null
  if (!wallet) return c.json({ error: 'bad-address' }, 400)
  const challenge = sessions.issue(wallet)
  return c.json({
    challengeId: challenge.id,
    message: challenge.message,
    expiresAt: new Date(challenge.expiresAt).toISOString(),
  })
})

app.post('/api/session', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body.challengeId !== 'string') return c.json({ error: 'bad-body' }, 400)
  const challenge = sessions.take(body.challengeId)
  if (!challenge) return c.json({ error: 'bad-challenge' }, 400)
  const proof = await verifyWalletProof({
    message: challenge.message,
    walletAddress: typeof body.walletAddress === 'string' ? body.walletAddress : challenge.walletAddress,
    publicKey: String(body.publicKey ?? ''),
    signature: String(body.signature ?? ''),
  })
  if (!proof.ok) return c.json({ error: proof.error }, 401)
  if (proof.walletAddress !== challenge.walletAddress) return c.json({ error: 'wallet-mismatch' }, 401)
  const token = signSession(SECRET, proof.walletAddress)
  return c.json({
    token,
    address: proof.walletAddress,
    label: maskPlayer(proof.walletAddress),
  })
})

function parseGame(raw: unknown): 'trace' | 'anagrams' {
  return raw === 'anagrams' ? 'anagrams' : 'trace'
}

app.get('/api/daily', (c) => {
  const playerId = playerIdFrom(c)
  const date = utcDate()
  const game = parseGame(c.req.query('game'))
  const seed = dailySeedHex(SECRET, date, game)
  const existingId = playerId ? store.dailyRunId(playerId, date, game) : undefined
  const existing = existingId ? store.getRun(existingId) : undefined
  return c.json({
    date,
    game,
    seed,
    played: Boolean(existing?.consumed),
    score: existing?.score ?? null,
    wordCount: existing?.words?.length ?? null,
  })
})

app.get('/api/leaderboard', (c) => {
  const date = c.req.query('date') || utcDate()
  const game = parseGame(c.req.query('game'))
  return c.json({
    date,
    game,
    entries: store.leaderboard(date, 20, game).map((row) => ({
      label: maskPlayer(row.playerId),
      score: row.score,
      wordCount: row.wordCount,
    })),
  })
})

const matchApi = await attachMatchRoutes(app, playerIdFrom, {
  secret: SECRET,
  store,
  dict,
  dataDir: DATA_DIR,
})
matchStoreKind = matchApi.storeKind

app.post('/api/runs', async (c) => {
  const playerId = playerIdFrom(c)
  if (!playerId) return c.json({ error: 'player-required' }, 400)
  const body = await c.req.json().catch(() => ({}))
  const mode: Mode = body.mode === 'daily' ? 'daily' : 'free'
  const game = parseGame(body.game)
  const date = utcDate()

  if (mode === 'daily') {
    const existingId = store.dailyRunId(playerId, date, game)
    const existing = existingId ? store.getRun(existingId) : undefined
    if (existing?.consumed) {
      return c.json(
        { error: 'daily-already-played', score: existing.score, words: existing.words },
        409,
      )
    }
    if (existing && !existing.consumed) {
      const token = signRun(SECRET, existing)
      return c.json({
        runId: existing.runId,
        seed: existing.seed,
        mode: existing.mode,
        game: existing.game ?? game,
        startTs: existing.startTs,
        durationMs: 90_000,
        token,
      })
    }
  }

  const runId = newId()
  const seed = mode === 'daily' ? dailySeedHex(SECRET, date, game) : newSeedHex()
  const startTs = Date.now()
  const run = { runId, playerId, mode, game, seed, startTs, consumed: false }
  store.putRun(run)
  const token = signRun(SECRET, run)
  return c.json({
    runId,
    seed,
    mode,
    game,
    startTs,
    durationMs: 90_000,
    token,
  })
})

app.post('/api/runs/:id/submit', async (c) => {
  const playerId = playerIdFrom(c)
  if (!playerId) return c.json({ error: 'player-required' }, 400)
  const run = store.getRun(c.req.param('id'))
  if (!run || run.playerId !== playerId) return c.json({ error: 'unknown-run' }, 404)
  if (run.consumed) {
    return c.json({ error: 'already-consumed', score: run.score, words: run.words }, 409)
  }

  const body = await c.req.json().catch(() => null)
  if (!body || typeof body.token !== 'string' || !Array.isArray(body.inputs)) {
    return c.json({ error: 'bad-body' }, 400)
  }
  if (!checkRunToken(SECRET, run, body.token)) {
    return c.json({ error: 'bad-token' }, 403)
  }
  if ('score' in body) {
    // Client score is ignored. Keep going.
  }

  const verified =
    (run.game ?? 'trace') === 'anagrams'
      ? verifyAnagrams(run.seed, body.inputs as InputEvent[], dict)
      : verifyRun(generateGridFromHex(run.seed), body.inputs as InputEvent[], dict)
  if (!verified.ok) return c.json({ error: verified.error }, 400)

  store.consume(run, verified.score, verified.words)
  let versus = null
  if (run.mode === 'versus' && run.matchId) {
    versus = matchApi.applyVersusSubmit(run.matchId, playerId, verified.words, body.inputs as InputEvent[])
  }
  return c.json({
    accepted: true,
    score: verified.score,
    words: verified.words,
    rejected: verified.rejected,
    versus,
  })
})

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`versus-word api on http://localhost:${info.port} (${dict.size} words, ${matchStoreKind})`)
})

async function flushAndExit() {
  try {
    await matchApi.persistNow()
  } catch (err) {
    console.warn('match flush failed', err)
  }
  process.exit(0)
}
process.on('SIGTERM', flushAndExit)
process.on('SIGINT', flushAndExit)
