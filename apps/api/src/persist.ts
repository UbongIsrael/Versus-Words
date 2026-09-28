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
      // Railway has no GCP metadata server available, so GCS-backed storage
      // only works if a token is explicitly provided via GOOGLE_ACCESS_TOKEN.
      // Without one, skip GCS entirely instead of crashing at startup.
      const token = gcpAccessToken()
      if (!token) return []
      const res = await fetch(mediaUrl, { headers: { Authorization: `Bearer ${token}` } })
      if (res.status === 404) return []
      if (!res.ok) throw new Error(`gcs load ${res.status} ${await res.text()}`)
      return parseMatches(await res.text())
    },
    async save(matches) {
      const token = gcpAccessToken()
      if (!token) return
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

// Previously this fetched a token from the GCP metadata server
// (http://metadata.google.internal/...). That server is only reachable when
// running on Google Cloud infrastructure, and calling it on Railway caused
// the API to crash at startup. GCS-backed storage now only works if a token
// is explicitly supplied via the GOOGLE_ACCESS_TOKEN environment variable.
function gcpAccessToken(): string | null {
  const fromEnv = (process.env.GOOGLE_ACCESS_TOKEN ?? '').trim()
  return fromEnv || null
}
