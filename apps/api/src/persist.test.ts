import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMatch } from './match.ts'
import { createMatchStore, loadMatches, parseMatches, saveMatches } from './persist.ts'

const ALICE = 'NQ07 0000 0000 0000 0000 0000 0000 0000 0000'

describe('match persist', () => {
  const prevBucket = process.env.MATCH_BUCKET

  afterEach(() => {
    if (prevBucket === undefined) delete process.env.MATCH_BUCKET
    else process.env.MATCH_BUCKET = prevBucket
  })

  it('round-trips matches.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'versus-persist-'))
    const path = join(dir, 'matches.json')
    const match = createMatch(ALICE, { amount: 1, asset: 'NIM' })
    saveMatches(path, [match])
    const loaded = loadMatches(path)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]?.id).toBe(match.id)
    expect(loaded[0]?.code).toBe(match.code)
  })

  it('returns empty on missing or junk file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'versus-persist-'))
    expect(loadMatches(join(dir, 'nope.json'))).toEqual([])
    const junk = join(dir, 'matches.json')
    writeFileSync(junk, '{not json')
    expect(loadMatches(junk)).toEqual([])
    expect(parseMatches('[]')).toEqual([])
    expect(parseMatches('{"no":"array"}')).toEqual([])
  })

  it('uses the file store unless MATCH_BUCKET is set', async () => {
    delete process.env.MATCH_BUCKET
    const dir = mkdtempSync(join(tmpdir(), 'versus-persist-'))
    const store = createMatchStore({ dataDir: dir })
    expect(store.kind.startsWith('file:')).toBe(true)
    const match = createMatch(ALICE, { amount: 2, asset: 'USDT' })
    await store.save([match])
    const loaded = await store.load()
    expect(loaded[0]?.id).toBe(match.id)
    const raw = JSON.parse(readFileSync(join(dir, 'matches.json'), 'utf8')) as { id: string }[]
    expect(raw[0]?.id).toBe(match.id)
  })

  it('selects gcs when MATCH_BUCKET is set', () => {
    process.env.MATCH_BUCKET = 'versus-words-matches'
    const store = createMatchStore({ dataDir: '/tmp' })
    expect(store.kind).toBe('gcs:versus-words-matches/matches.json')
  })
})
