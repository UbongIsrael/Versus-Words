import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Match } from './match.ts'

export function loadMatches(path: string): Match[] {
  if (!existsSync(path)) return []
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Match[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveMatches(path: string, matches: Match[]) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(matches, null, 2))
}
