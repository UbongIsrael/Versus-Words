import type { InputEvent } from '@versus/sim'
import { getPlayerId } from './identity.ts'
import { getSessionToken } from './session.ts'

const API_BASE = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

function apiUrl(path: string): string {
  if (!API_BASE) return path
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`
}

export type IssuedRun = {
  runId: string
  seed: string
  mode: 'free' | 'daily' | 'versus'
  startTs: number
  durationMs: number
  token: string
  matchId?: string
}

export type MatchView = {
  id: string
  code: string
  seed: string | null
  asset: 'NIM' | 'USDT'
  scoreMode: 'unique' | 'count'
  stakeAmount: number
  stakeUnits: number
  stakeLuna: number
  stakeNim: number
  memo: string
  createdAt: number
  expiresAt: number
  settled: boolean
  winner: string | 'tie' | null
  payouts: { to: string; luna: number; kind: string; tx?: string; error?: string }[]
  bothFunded: boolean
  bothScored: boolean
  closed: boolean
  closeReason: string | null
  you: {
    address: string
    funded: boolean
    scored: boolean
    words: string[] | null
    uniqueScore: number | null
    evmAddress?: string | null
  } | null
  challenger: {
    address: string
    funded: boolean
    scored: boolean
    wordCount: number
    uniqueScore: number | null
    evmAddress?: string | null
  }
  opponent: {
    address: string
    funded: boolean
    scored: boolean
    wordCount: number
    uniqueScore: number | null
    evmAddress?: string | null
  } | null
  overlay: {
    scoreA: number
    scoreB: number
    uniqueA: string[]
    uniqueB: string[]
    shared: string[]
  } | null
  rematch: {
    nextId: string | null
    from: string | null
    expiresAt: number | null
    remainingMs: number
    youOffered: boolean
    incoming: boolean
  } | null
}

export type AppConfig = {
  escrowAddress: string | null
  assets: Array<'NIM' | 'USDT'>
  scoreModes: Array<'unique' | 'count'>
  lunaPerNim: number
  fakeChain: boolean
  usdt: {
    token: string
    escrow: string | null
    chainId: number
    oracle: string | null
  }
}

export type DailyInfo = {
  date: string
  seed: string
  played: boolean
  score: number | null
  wordCount: number | null
}

export type Leaderboard = {
  date: string
  entries: { label: string; score: number; wordCount: number }[]
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('X-Player-Id', getPlayerId())
  const session = getSessionToken()
  if (session) headers.set('Authorization', `Bearer ${session}`)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const res = await fetch(apiUrl(path), { ...init, headers })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    const err = new Error(data.error ?? `http-${res.status}`)
    Object.assign(err, { status: res.status, body: data })
    throw err
  }
  return data
}

export const api = {
  health: () => req<{ ok: boolean; words: number }>('/health'),
  session: () => req<{ connected: boolean; address?: string; label?: string }>('/api/session'),
  challenge: (walletAddress: string) =>
    req<{ challengeId: string; message: string; expiresAt: string }>('/api/session/challenge', {
      method: 'POST',
      body: JSON.stringify({ walletAddress }),
    }),
  completeSession: (body: {
    challengeId: string
    walletAddress: string
    publicKey: string
    signature: string
  }) =>
    req<{ token: string; address: string; label: string }>('/api/session', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  daily: () => req<DailyInfo>('/api/daily'),
  leaderboard: () => req<Leaderboard>('/api/leaderboard'),
  start: (mode: 'free' | 'daily') =>
    req<IssuedRun>('/api/runs', { method: 'POST', body: JSON.stringify({ mode }) }),
  submit: (run: IssuedRun, inputs: InputEvent[]) =>
    req<{ accepted: boolean; score: number; words: string[]; rejected: unknown[]; versus?: MatchView }>(
      `/api/runs/${run.runId}/submit`,
      { method: 'POST', body: JSON.stringify({ token: run.token, inputs }) },
    ),
  config: () => req<AppConfig>('/api/config'),
  createMatch: (body: { stakeAmount: number; asset: 'NIM' | 'USDT'; scoreMode: 'unique' | 'count' }) =>
    req<MatchView>('/api/matches', { method: 'POST', body: JSON.stringify(body) }),
  getMatch: (id: string, evm?: string) =>
    req<MatchView>(`/api/matches/${id}${evm ? `?evm=${encodeURIComponent(evm)}` : ''}`),
  getMatchByCode: (code: string, evm?: string) =>
    req<MatchView>(
      `/api/matches/code/${encodeURIComponent(code)}${evm ? `?evm=${encodeURIComponent(evm)}` : ''}`,
    ),
  joinMatch: (id: string) => req<MatchView>(`/api/matches/${id}/join`, { method: 'POST', body: '{}' }),
  startVersus: (id: string) => req<IssuedRun>(`/api/matches/${id}/run`, { method: 'POST', body: '{}' }),
  rematch: (id: string) => req<MatchView>(`/api/matches/${id}/rematch`, { method: 'POST', body: '{}' }),
  acceptRematch: (id: string) =>
    req<MatchView>(`/api/matches/${id}/rematch/accept`, { method: 'POST', body: '{}' }),
  declineRematch: (id: string) =>
    req<MatchView>(`/api/matches/${id}/rematch/decline`, { method: 'POST', body: '{}' }),
  leaveMatch: (id: string) => req<MatchView>(`/api/matches/${id}/leave`, { method: 'POST', body: '{}' }),
  fundMatch: (id: string, body?: { txHash?: string; evmAddress?: string }) =>
    req<MatchView>(`/api/matches/${id}/fund`, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  settleSig: (id: string) =>
    req<{ signature: string; oracle: string; winner: 0 | 1 | 2; matchId: string }>(
      `/api/matches/${id}/settle-sig`,
    ),
}

export async function loadDictionary(): Promise<string> {
  const res = await fetch(apiUrl('/dictionary.txt'))
  if (!res.ok) throw new Error('dictionary-failed')
  return res.text()
}
