export type Mode = 'free' | 'daily' | 'versus'

export type RunRecord = {
  runId: string
  playerId: string
  mode: Mode
  seed: string
  startTs: number
  consumed: boolean
  score?: number
  words?: string[]
  matchId?: string
}

export type LeaderboardRow = {
  playerId: string
  score: number
  wordCount: number
  submittedAt: number
}

export function utcDate(ts = Date.now()): string {
  return new Date(ts).toISOString().slice(0, 10)
}

export function createStore() {
  const runs = new Map<string, RunRecord>()
  const dailyByPlayer = new Map<string, string>()
  const boards = new Map<string, LeaderboardRow[]>()

  return {
    putRun(run: RunRecord) {
      runs.set(run.runId, run)
      if (run.mode === 'daily') dailyByPlayer.set(`${run.playerId}:${utcDate(run.startTs)}`, run.runId)
    },
    getRun(runId: string) {
      return runs.get(runId)
    },
    dailyRunId(playerId: string, date = utcDate()) {
      return dailyByPlayer.get(`${playerId}:${date}`)
    },
    consume(run: RunRecord, score: number, words: string[]) {
      run.consumed = true
      run.score = score
      run.words = words
      if (run.mode === 'daily') {
        const date = utcDate(run.startTs)
        const rows = boards.get(date) ?? []
        const next = rows.filter((r) => r.playerId !== run.playerId)
        next.push({
          playerId: run.playerId,
          score,
          wordCount: words.length,
          submittedAt: Date.now(),
        })
        next.sort((a, b) => b.score - a.score || a.submittedAt - b.submittedAt)
        boards.set(date, next)
      }
    },
    leaderboard(date = utcDate(), limit = 20) {
      return (boards.get(date) ?? []).slice(0, limit)
    },
  }
}

export type Store = ReturnType<typeof createStore>
