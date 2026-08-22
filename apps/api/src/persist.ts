import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Match } from './match.ts'

export type MatchStore = {
  kind: string
  load(): Promise<Match[]>
  save(matches: Match[]): Promise<void>
}

export function createMatchStore(opts: { dataDir: string }): MatchStore {
  const bucket = (process.env.MATCH_BUCKET ?? '').trim()
  if (bucket) return gcsMatchStore(bucket)
  return fileMatchStore(resolve(opts.dataDir, 'matches.json'))
}

export function parseMatches(raw: string): Match[] {
  try {
    const parsed = JSON.parse(raw) as Match[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function loadMatches(path: string): Match[] {
  if (!existsSync(path)) return []
  try {
    return parseMatches(readFileSync(path, 'utf8'))
  } catch {
    return []
  }
}

export function saveMatches(path: string, matches: Match[]) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(matches, null, 2))
}

function fileMatchStore(path: string): MatchStore {
  return {
    kind: `file:${path}`,
    async load() {
      return loadMatches(path)
    },
    async save(matches) {
      saveMatches(path, matches)
    },
  }
}

function gcsMatchStore(bucket: string, object = 'matches.json'): MatchStore {
  const encoded = encodeURIComponent(object)
  const mediaUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encoded}?alt=media`
  const uploadUrl = `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encoded}`
  return {
    kind: `gcs:${bucket}/${object}`,
    async load() {
      const token = await gcpAccessToken()
      const res = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 404) return []
      if (!res.ok) throw new Error(`gcs load ${res.status} ${await res.text()}`)
      return parseMatches(await res.text())
    },
    async save(matches) {
      const token = await gcpAccessToken()
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(matches),
      })
      if (!res.ok) throw new Error(`gcs save ${res.status} ${await res.text()}`)
    },
  }
}

let cachedToken: { value: string; exp: number } | null = null

async function gcpAccessToken(): Promise<string> {
  const fromEnv = (process.env.GOOGLE_ACCESS_TOKEN ?? '').trim()
  if (fromEnv) return fromEnv
  if (cachedToken && Date.now() < cachedToken.exp) return cachedToken.value
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(3000) },
  )
  if (!res.ok) throw new Error(`gcp metadata token ${res.status}`)
  const body = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!body.access_token) throw new Error('gcp metadata token missing')
  const ttlMs = Math.max(30, (body.expires_in ?? 3600) - 60) * 1000
  cachedToken = { value: body.access_token, exp: Date.now() + ttlMs }
  return cachedToken.value
}
