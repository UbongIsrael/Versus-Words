import {
  generateGridFromHex,
  hasWord,
  parseDictionary,
  pickAnagramSource,
  pointsForLength,
  wordFromPath,
  type Dictionary,
  type InputEvent,
} from '@versus/sim'
import {
  api,
  loadDictionary,
  type ClaimRow,
  type DailyInfo,
  type GameKind,
  type IssuedRun,
  type Leaderboard,
  type MatchView,
} from './api.ts'
import { mountGrid, type GridView } from './grid-view.ts'
import {
  evmAccount,
  lockUsdt,
  peekEvmAddress,
  recallLock,
  resolveEvmAddress,
  submitSettle,
  submitTimeoutRefund,
} from './evm.ts'
import { isPayAvailable, listPayAddress, sendStake, signPayMessage } from './pay.ts'
import { clearSession, getSession, setSession } from './session.ts'
import './styles/app.css'

const rootEl = document.querySelector('#app')
if (!(rootEl instanceof HTMLDivElement)) throw new Error('#app')
const root: HTMLDivElement = rootEl

let dict: Dictionary | null = null
let gridView: GridView | null = null
let timer: number | null = null
let matchPoll: number | null = null
let rematchTick: number | null = null
let playLocked = false
let matchViewGen = 0
let paintedMatchKey = ''
let cachedEvm: string | null = null
let activeGame: GameKind = 'trace'

const GAME_META: Record<GameKind, { title: string; blurb: string }> = {
  trace: {
    title: 'Trace',
    blurb: 'Draw words. Beat the clock.',
  },
  anagrams: {
    title: 'Anagrams',
    blurb: 'Find the most words. Win.',
  },
}

boot()

async function boot() {
  root.innerHTML = `
    <p class="wordmark">Versus Word</p>
    <p class="kicker">Getting ready…</p>
  `
  try {
    const [text] = await Promise.all([loadDictionary(), api.health()])
    dict = parseDictionary(text)
    const params = new URLSearchParams(location.search)
    const pending = params.get('v')
    const code = params.get('c')
    if (params.has('claims')) {
      await showClaims()
      return
    }
    if (pending) {
      await showMatch(pending)
      return
    }
    if (code) {
      await openByCode(code)
      return
    }
    await showHome()
  } catch (err) {
    root.innerHTML = `
      <p class="wordmark">Versus Word</p>
      <p class="kicker">Can’t reach the game right now.</p>
    `
    console.error(err)
  }
}

async function showHome() {
  teardownPlay()
  const session = getSession()
  const pay = session ? true : await isPayAvailable()

  root.innerHTML = `
    <header>
      <h1 class="wordmark">Versus Word</h1>
      <p class="kicker">Two games. One clock. Challenge a friend.</p>
    </header>
    <div class="stack">
      <section class="card">
        ${
          session
            ? `<div class="mode-tag">Nimiq Pay</div>
               <p class="kicker" style="margin-top:8px">${escapeHtml(session.label)}</p>
               <button class="back" type="button" data-act="disconnect" style="margin-top:10px">Disconnect</button>`
            : pay
              ? `<div class="mode-tag">Nimiq Pay</div>
                 <p class="kicker" style="margin-top:8px">Connect to play for keeps.</p>
                 <button class="btn btn-primary" data-act="connect" style="margin-top:12px;width:100%">Connect wallet</button>`
              : `<div class="mode-tag">Guest</div>
                 <p class="kicker" style="margin-top:8px">Open this in Nimiq Pay to play with your wallet.</p>`
        }
      </section>
      <div class="game-grid">
        <button class="game-card" type="button" data-game="trace">
          <div class="mode-tag">Game</div>
          <h2>Trace</h2>
          <p>${escapeHtml(GAME_META.trace.blurb)}</p>
        </button>
        <button class="game-card" type="button" data-game="anagrams">
          <div class="mode-tag">Game</div>
          <h2>Anagrams</h2>
          <p>${escapeHtml(GAME_META.anagrams.blurb)}</p>
        </button>
      </div>
      ${
        session
          ? `<button class="btn btn-primary" data-act="challenge">Challenge someone</button>
             <button class="btn btn-ghost" data-act="join-code">I have a code</button>
             <button class="btn btn-ghost" data-act="claims">Rewards</button>`
          : ''
      }
    </div>
  `

  root.querySelectorAll<HTMLButtonElement>('[data-game]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const game = btn.dataset.game === 'anagrams' ? 'anagrams' : 'trace'
      void showGameHub(game)
    })
  })
  root.querySelector('[data-act="challenge"]')?.addEventListener('click', () => void showNewChallenge())
  root.querySelector('[data-act="join-code"]')?.addEventListener('click', () => showJoinCode())
  root.querySelector('[data-act="claims"]')?.addEventListener('click', () => {
    history.replaceState({}, '', '/?claims=1')
    void showClaims()
  })
  root.querySelector('[data-act="disconnect"]')?.addEventListener('click', () => {
    clearSession()
    void showHome()
  })
  root.querySelector('[data-act="connect"]')?.addEventListener('click', () => void connectWallet())
}

async function connectWallet() {
  root.innerHTML = `<p class="kicker">Opening your wallet…</p>`
  try {
    const address = await listPayAddress()
    const challenge = await api.challenge(address)
    const signed = await signPayMessage(challenge.message)
    const session = await api.completeSession({
      challengeId: challenge.challengeId,
      walletAddress: address,
      publicKey: signed.publicKey,
      signature: signed.signature,
    })
    setSession(session)
    await showHome()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'connect-failed'
    root.innerHTML = `
      <p class="kicker">${escapeHtml(humanConnectError(message))}</p>
      <button class="btn btn-primary" data-act="home">Back</button>
    `
    root.querySelector('[data-act="home"]')?.addEventListener('click', () => void showHome())
  }
}

async function showClaims() {
  teardownPlay()
  const goHome = () => {
    history.replaceState({}, '', '/')
    void showHome()
  }
  root.innerHTML = `<p class="kicker">Looking for money you left behind…</p>`
  let rows: ClaimRow[]
  try {
    const evm = (await peekEvmAddress()) ?? (await resolveEvmAddress())
    if (!evm) {
      root.innerHTML = `
        <button class="back" type="button" data-act="home">Back</button>
        <p class="kicker">No wallet on this phone to collect with.</p>
      `
      root.querySelector('[data-act="home"]')?.addEventListener('click', goHome)
      return
    }
    rows = (await api.claims(evm)).claims
  } catch (err) {
    root.innerHTML = `
      <button class="back" type="button" data-act="home">Back</button>
      <p class="kicker">${escapeHtml(err instanceof Error ? err.message : 'claims-failed')}</p>
    `
    root.querySelector('[data-act="home"]')?.addEventListener('click', goHome)
    return
  }

  root.innerHTML = `
    <button class="back" type="button" data-act="home">Back</button>
    <h1 class="wordmark">Your money</h1>
    <div class="stack" style="margin-top:22px">
      ${
        rows.length
          ? rows
              .map(
                (row) => `
            <section class="card">
              <div class="mode-tag">${row.action === 'timeout' ? 'Your stake' : 'Winnings'}</div>
              <h2 style="font-size:32px;margin:8px 0 4px">${escapeHtml(formatAmount(row.amount))} USDT</h2>
              <button class="btn btn-primary" data-act="claim" data-id="${escapeHtml(row.matchId)}" data-action="${row.action}" style="width:100%;margin-top:12px">${
                row.action === 'timeout' ? 'Get it back' : 'Collect'
              }</button>
            </section>`,
              )
              .join('')
          : `<section class="card"><p class="kicker">Nothing waiting.</p></section>`
      }
    </div>
  `
  root.querySelector('[data-act="home"]')?.addEventListener('click', goHome)
  root.querySelectorAll<HTMLButtonElement>('[data-act="claim"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      if (!id) return
      const action = btn.dataset.action === 'timeout' ? 'timeout' : 'settle'
      btn.disabled = true
      btn.textContent = 'Working…'
      void claimUsdt(id, () => showClaims(), action).finally(() => {
        btn.disabled = false
        btn.textContent = action === 'timeout' ? 'Get it back' : 'Collect'
      })
    })
  })
}

function humanConnectError(code: string): string {
  if (code === 'not-in-pay') return 'Open this in Nimiq Pay, then try again.'
  if (code === 'no-account') return 'No wallet found in Pay.'
  if (code === 'PermissionDeniedError' || /denied|reject/i.test(code)) return 'You cancelled the sign-in.'
  return code
}

async function showGameHub(game: GameKind) {
  teardownPlay()
  activeGame = game
  const meta = GAME_META[game]
  const session = getSession()
  let daily: DailyInfo
  let board: Leaderboard
  try {
    ;[daily, board] = await Promise.all([api.daily(game), api.leaderboard(game)])
  } catch {
    root.innerHTML = `<p class="kicker">Can’t reach the game right now.</p>`
    return
  }

  root.innerHTML = `
    <button class="back" type="button" data-act="home">Back</button>
    <header>
      <h1 class="wordmark">${escapeHtml(meta.title)}</h1>
      <p class="kicker">${escapeHtml(meta.blurb)}</p>
    </header>
    <div class="stack">
      <button class="btn btn-primary" data-act="free">Practice</button>
      <button class="btn btn-ghost" data-act="daily" ${daily.played ? 'disabled' : ''}>
        ${daily.played ? `You’re done · ${daily.score} pts` : 'Today’s challenge'}
      </button>
      ${session ? `<button class="btn btn-ghost" data-act="challenge">Challenge someone</button>` : ''}
      <section class="card">
        <div class="mode-tag">${daily.date}</div>
        ${
          board.entries.length
            ? `<ol class="board-list">${board.entries
                .map(
                  (row, i) =>
                    `<li><span>${i + 1}. ${escapeHtml(row.label)}</span><span class="muted">${row.score} · ${row.wordCount} words</span></li>`,
                )
                .join('')}</ol>`
            : `<p class="kicker">Nobody’s on the board yet.</p>`
        }
      </section>
    </div>
  `
  root.querySelector('[data-act="home"]')?.addEventListener('click', () => void showHome())
  root.querySelector('[data-act="free"]')?.addEventListener('click', () => void startRun('free', game))
  root.querySelector('[data-act="daily"]')?.addEventListener('click', () => void startRun('daily', game))
  root.querySelector('[data-act="challenge"]')?.addEventListener('click', () => void showNewChallenge([game]))
}

async function startRun(mode: 'free' | 'daily', game: GameKind = activeGame) {
  if (!dict) return
  activeGame = game
  let run: IssuedRun
  try {
    run = await api.start(mode, game)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'start-failed'
    if (message === 'daily-already-played') {
      await showHome()
      return
    }
    root.innerHTML = `<p class="kicker">${escapeHtml(message)}</p><button class="back">Back</button>`
    root.querySelector('.back')?.addEventListener('click', () => void showHome())
    return
  }
  showPlay(run)
}

function showPlay(run: IssuedRun) {
  if (!dict) return
  if ((run.game ?? 'trace') === 'anagrams') {
    showAnagramsPlay(run)
    return
  }
  playLocked = true
  stopMatchPoll()
  clearPlaySurface()
  const cells = generateGridFromHex(run.seed)
  const durationMs = run.durationMs > 0 ? run.durationMs : 90_000
  const inputs: InputEvent[] = []
  const found = new Set<string>()
  let livePath: number[] = []
  let status: 'idle' | 'good' | 'bad' | 'already' = 'idle'
  let statusWord = ''
  let submitting = false

  root.innerHTML = `
    <div class="play-screen" data-play="1">
      <div class="play-head">
        <button class="back" type="button" data-act="quit">Quit</button>
        <div class="mode-tag">${run.mode === 'daily' ? 'Today' : run.mode === 'versus' ? 'Versus' : 'Practice'}</div>
        <div class="clock" data-el="clock">1:30</div>
      </div>
      <div class="current" data-el="current"></div>
      <div class="play-stage">
        <div class="grid-wrap" data-el="grid"></div>
        <p class="pop" data-el="pop"></p>
      </div>
      <div class="found" data-el="found"></div>
      <div class="scoreline">
        <span data-el="tally">0 words</span>
        <span></span>
      </div>
    </div>
  `

  const gridEl = root.querySelector<HTMLElement>('[data-el="grid"]')!
  const clockEl = root.querySelector<HTMLElement>('[data-el="clock"]')!
  const currentEl = root.querySelector<HTMLElement>('[data-el="current"]')!
  const foundEl = root.querySelector<HTMLElement>('[data-el="found"]')!
  const tallyEl = root.querySelector<HTMLElement>('[data-el="tally"]')!

  function paintStatus() {
    const preview = wordFromPath(cells, livePath)
    currentEl.classList.toggle('good', status === 'good')
    currentEl.classList.toggle('bad', status === 'bad')
    currentEl.classList.toggle('already', status === 'already')
    if (status === 'good' || status === 'bad' || status === 'already') currentEl.textContent = statusWord
    else currentEl.textContent = preview.ok ? preview.word : preview.error === 'empty' ? '' : '·'
  }

  function paintFound() {
    foundEl.innerHTML = [...found]
      .sort()
      .map((word) => `<span class="chip">${escapeHtml(word)}</span>`)
      .join('')
    tallyEl.textContent = `${found.size} word${found.size === 1 ? '' : 's'}`
  }

  gridView = mountGrid(gridEl, cells, {
    onPath(path) {
      livePath = path
      status = 'idle'
      paintStatus()
    },
    onCommit(path) {
      livePath = []
      const at = Date.now() - run.startTs
      const parsed = wordFromPath(cells, path)
      if (!parsed.ok) {
        status = parsed.error === 'empty' || parsed.error === 'too-short' ? 'idle' : 'bad'
        statusWord = ''
        paintStatus()
        return
      }
      if (!hasWord(dict!, parsed.word)) {
        status = 'bad'
        statusWord = parsed.word
        paintStatus()
        flashPop('bad', parsed.word)
        vibrate(12)
        return
      }
      if (found.has(parsed.word)) {
        status = 'already'
        statusWord = 'Already in'
        paintStatus()
        flashPop('already', 'Already in')
        vibrate(10)
        return
      }
      inputs.push({ t: Math.max(0, at), cells: path })
      found.add(parsed.word)
      paintFound()
      const pts = pointsForLength(parsed.word.length)
      status = 'good'
      statusWord = parsed.word
      paintStatus()
      flashPop('good', `+${pts}`)
      vibrate(8)
    },
  })

  root.querySelector('[data-act="quit"]')?.addEventListener('click', () => {
    if (run.mode === 'daily' || run.mode === 'versus') {
      void finish(run, inputs)
      return
    }
    void showHome()
  })

  const tick = () => {
    if (!playLocked) return
    const left = Math.max(0, durationMs - (Date.now() - run.startTs))
    const secs = Math.ceil(left / 1000)
    clockEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    clockEl.classList.toggle('warn', secs <= 10)
    if (left <= 0) {
      void finish(run, inputs)
      return
    }
    timer = window.setTimeout(tick, 200)
  }
  tick()

  async function finish(issued: IssuedRun, log: InputEvent[]) {
    if (submitting) return
    submitting = true
    teardownPlay()
    root.innerHTML = `<p class="kicker">Checking your words…</p>`
    try {
      const result = await api.submit(issued, log)
      if (issued.matchId) {
        history.replaceState({}, '', `/?v=${issued.matchId}`)
        await showMatch(issued.matchId)
        return
      }
      showResult(issued.mode, result.score, result.words)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'submit-failed'
      root.innerHTML = `<p class="kicker">${escapeHtml(message)}</p><button class="btn btn-primary" data-act="home">Home</button>`
      root.querySelector('[data-act="home"]')?.addEventListener('click', () => void showHome())
    }
  }
}

function showResult(mode: string, score: number, words: string[]) {
  root.innerHTML = `
    <section class="result">
      <div class="mode-tag">${mode === 'daily' ? 'Today' : mode === 'versus' ? 'Versus' : 'Practice'}</div>
      <h2>${score}</h2>
      <p>${words.length} word${words.length === 1 ? '' : 's'}.</p>
      <div class="words">${words.map((word) => `<span class="chip">${escapeHtml(word)}</span>`).join('')}</div>
      <div class="stack">
        <button class="btn btn-primary" data-act="home">Home</button>
        ${mode === 'free' ? `<button class="btn btn-ghost" data-act="again">Play again</button>` : ''}
      </div>
    </section>
  `
  root.querySelector('[data-act="home"]')?.addEventListener('click', () => void showHome())
  root.querySelector('[data-act="again"]')?.addEventListener('click', () => void startRun('free', activeGame))
}

function showAnagramsPlay(run: IssuedRun) {
  if (!dict) return
  playLocked = true
  stopMatchPoll()
  clearPlaySurface()
  const durationMs = run.durationMs > 0 ? run.durationMs : 90_000
  const { rack } = pickAnagramSource(run.seed, dict)
  const inputs: InputEvent[] = []
  const found = new Set<string>()
  const picked: number[] = []
  let status: 'idle' | 'good' | 'bad' | 'already' = 'idle'
  let statusWord = ''
  let submitting = false

  root.innerHTML = `
    <div class="play-screen" data-play="1">
      <div class="play-head">
        <button class="back" type="button" data-act="quit">Quit</button>
        <div class="mode-tag">${run.mode === 'daily' ? 'Today' : run.mode === 'versus' ? 'Versus' : 'Practice'} · Anagrams</div>
        <div class="clock" data-el="clock">1:30</div>
      </div>
      <div class="found" data-el="found"></div>
      <div class="play-stage">
        <div class="rack" data-el="rack"></div>
        <p class="pop" data-el="pop"></p>
      </div>
      <div class="play-dock">
        <div class="current" data-el="current"></div>
        <button class="btn btn-primary" type="button" data-act="submit" style="width:100%">Send it</button>
        <div class="scoreline">
          <span data-el="tally">0 words</span>
          <span></span>
        </div>
      </div>
    </div>
  `

  const clockEl = root.querySelector<HTMLElement>('[data-el="clock"]')!
  const currentEl = root.querySelector<HTMLElement>('[data-el="current"]')!
  const rackEl = root.querySelector<HTMLElement>('[data-el="rack"]')!
  const foundEl = root.querySelector<HTMLElement>('[data-el="found"]')!
  const tallyEl = root.querySelector<HTMLElement>('[data-el="tally"]')!

  function currentWord() {
    return picked.map((i) => rack[i] ?? '').join('')
  }

  function paintRack() {
    rackEl.innerHTML = rack
      .map(
        (letter, i) =>
          `<button type="button" data-i="${i}" class="${picked.includes(i) ? 'on' : ''}" ${picked.includes(i) ? 'disabled' : ''}>${escapeHtml(letter)}</button>`,
      )
      .join('')
    rackEl.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.i)
        if (!Number.isInteger(i) || picked.includes(i)) return
        picked.push(i)
        status = 'idle'
        paint()
      })
    })
  }

  function paintFound() {
    foundEl.innerHTML = [...found]
      .sort()
      .map((word) => `<span class="chip">${escapeHtml(word)}</span>`)
      .join('')
    tallyEl.textContent = `${found.size} word${found.size === 1 ? '' : 's'}`
  }

  function paint() {
    currentEl.classList.toggle('good', status === 'good')
    currentEl.classList.toggle('bad', status === 'bad')
    currentEl.classList.toggle('already', status === 'already')
    if (status === 'good' || status === 'bad' || status === 'already') currentEl.textContent = statusWord
    else currentEl.textContent = currentWord()
    paintRack()
    paintFound()
  }

  function submitWord() {
    const cells = [...picked]
    const word = currentWord()
    picked.length = 0
    if (word.length < 3) {
      status = 'idle'
      statusWord = ''
      paint()
      return
    }
    const at = Date.now() - run.startTs
    if (!hasWord(dict!, word)) {
      status = 'bad'
      statusWord = word
      paint()
      flashPop('bad', word)
      vibrate(12)
      return
    }
    if (found.has(word)) {
      status = 'already'
      statusWord = 'Already in'
      paint()
      flashPop('already', 'Already in')
      vibrate(10)
      return
    }
    inputs.push({ t: Math.max(0, at), cells, word })
    found.add(word)
    const pts = pointsForLength(word.length)
    status = 'good'
    statusWord = word
    paint()
    flashPop('good', `+${pts}`)
    vibrate(8)
  }

  paint()
  root.querySelector('[data-act="submit"]')?.addEventListener('click', submitWord)
  root.querySelector('[data-act="quit"]')?.addEventListener('click', () => {
    if (run.mode === 'daily' || run.mode === 'versus') {
      void finish(run, inputs)
      return
    }
    void showHome()
  })

  const tick = () => {
    if (!playLocked) return
    const left = Math.max(0, durationMs - (Date.now() - run.startTs))
    const secs = Math.ceil(left / 1000)
    clockEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
    clockEl.classList.toggle('warn', secs <= 10)
    if (left <= 0) {
      void finish(run, inputs)
      return
    }
    timer = window.setTimeout(tick, 200)
  }
  tick()

  async function finish(issued: IssuedRun, log: InputEvent[]) {
    if (submitting) return
    submitting = true
    teardownPlay()
    root.innerHTML = `<p class="kicker">Checking your words…</p>`
    try {
      const result = await api.submit(issued, log)
      if (issued.matchId) {
        history.replaceState({}, '', `/?v=${issued.matchId}`)
        await showMatch(issued.matchId)
        return
      }
      showResult(issued.mode, result.score, result.words)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'submit-failed'
      root.innerHTML = `<p class="kicker">${escapeHtml(message)}</p><button class="btn btn-primary" data-act="home">Home</button>`
      root.querySelector('[data-act="home"]')?.addEventListener('click', () => void showHome())
    }
  }
}

async function showNewChallenge(preset?: GameKind[]) {
  let asset: 'NIM' | 'USDT' = 'NIM'
  let scoreMode: 'unique' | 'count' = 'unique'
  const selected = new Set<GameKind>(preset?.length ? preset : ['trace'])
  root.innerHTML = `
    <button class="back" type="button" data-act="home">Back</button>
    <h1 class="wordmark">New room</h1>
    <p class="kicker">Invite someone. Winner takes the pot.</p>
    <form class="stack" style="margin-top:22px" data-el="form">
      <label class="field">
        <span>Games</span>
        <div class="seg">
          <button type="button" data-game="trace">Trace</button>
          <button type="button" data-game="anagrams">Anagrams</button>
        </div>
      </label>
      <p class="note" data-el="games-hint"></p>
      <label class="field">
        <span>Play for</span>
        <div class="seg">
          <button type="button" class="on" data-asset="NIM">NIM</button>
          <button type="button" data-asset="USDT">USDT</button>
        </div>
      </label>
      <label class="field">
        <span>Amount</span>
        <input class="amount" name="amount" inputmode="decimal" placeholder="e.g. 12.5" value="1" />
      </label>
      <label class="field">
        <span>How you win</span>
        <div class="seg">
          <button type="button" class="on" data-mode="unique">Words they missed</button>
          <button type="button" data-mode="count">Most words</button>
        </div>
      </label>
      <p class="note" data-el="hint">Only words they didn’t find count.</p>
      <button class="btn btn-primary" type="submit">Open room</button>
    </form>
  `
  const hint = root.querySelector<HTMLElement>('[data-el="hint"]')!
  const gamesHint = root.querySelector<HTMLElement>('[data-el="games-hint"]')!
  function paint() {
    root.querySelectorAll('[data-asset]').forEach((btn) => btn.classList.toggle('on', btn.getAttribute('data-asset') === asset))
    root.querySelectorAll('[data-mode]').forEach((btn) => btn.classList.toggle('on', btn.getAttribute('data-mode') === scoreMode))
    root.querySelectorAll('[data-game]').forEach((btn) => {
      const game = btn.getAttribute('data-game')
      btn.classList.toggle('on', game === 'trace' || game === 'anagrams' ? selected.has(game) : false)
    })
    gamesHint.textContent =
      selected.size > 1
        ? 'You’ll play both. Scores add up.'
        : selected.has('anagrams')
          ? 'Same letters. Most words wins.'
          : 'Same grid. Draw more words than they do.'
    hint.textContent =
      scoreMode === 'count'
        ? 'Whoever finds more words wins.'
        : 'Only words they didn’t find count.'
  }
  root.querySelector('[data-act="home"]')?.addEventListener('click', () => {
    history.replaceState({}, '', '/')
    void showHome()
  })
  root.querySelectorAll<HTMLButtonElement>('[data-asset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      asset = btn.dataset.asset === 'USDT' ? 'USDT' : 'NIM'
      paint()
    })
  })
  root.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      scoreMode = btn.dataset.mode === 'count' ? 'count' : 'unique'
      paint()
    })
  })
  root.querySelectorAll<HTMLButtonElement>('[data-game]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const game = btn.dataset.game === 'anagrams' ? 'anagrams' : 'trace'
      if (selected.has(game)) {
        if (selected.size === 1) return
        selected.delete(game)
      } else selected.add(game)
      paint()
    })
  })
  paint()
  root.querySelector<HTMLFormElement>('[data-el="form"]')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const raw = new FormData(event.currentTarget as HTMLFormElement).get('amount')
    const amount = Number(String(raw ?? '').replace(',', '.'))
    const games = [...selected]
    try {
      const match = await api.createMatch({ stakeAmount: amount, asset, scoreMode, games })
      history.replaceState({}, '', `/?v=${match.id}`)
      await showMatch(match.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'create-failed')
    }
  })
}

function showJoinCode() {
  root.innerHTML = `
    <button class="back" type="button" data-act="home">Back</button>
    <h1 class="wordmark">Join</h1>
    <p class="kicker">Got a code?</p>
    <form class="stack" style="margin-top:22px" data-el="form">
      <input class="code" name="code" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="K7NP2Q" />
      <button class="btn btn-primary" type="submit">Let’s go</button>
    </form>
  `
  root.querySelector('[data-act="home"]')?.addEventListener('click', () => void showHome())
  root.querySelector<HTMLFormElement>('[data-el="form"]')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const code = String(new FormData(event.currentTarget as HTMLFormElement).get('code') ?? '')
    await openByCode(code)
  })
}

async function openByCode(code: string) {
  try {
    const evm = await resolveEvmAddress()
    const match = await api.getMatchByCode(code, evm ?? undefined)
    history.replaceState({}, '', `/?v=${match.id}`)
    await showMatch(match.id)
  } catch {
    root.innerHTML = `<p class="kicker">That code’s gone.</p><button class="btn btn-primary" data-act="again">Try again</button>`
    root.querySelector('[data-act="again"]')?.addEventListener('click', () => showJoinCode())
  }
}

let evmPeeked = false

async function fetchMatch(id: string) {
  if (!evmPeeked) {
    evmPeeked = true
    const recalled = recallLock(id)
    cachedEvm = recalled?.evm ?? (await peekEvmAddress())
  }
  return api.getMatch(id, cachedEvm ?? undefined)
}

function stillPlaying(): boolean {
  return playLocked || Boolean(root.querySelector('[data-play]'))
}

async function showMatch(id: string) {
  if (stillPlaying()) return
  const gen = ++matchViewGen
  stopMatchPoll()
  let match: MatchView
  try {
    const recalled = recallLock(id)
    if (recalled) {
      cachedEvm = recalled.evm
      try {
        await api.fundMatch(id, { evmAddress: recalled.evm, txHash: recalled.txHash })
      } catch {
        /* still load the match */
      }
    }
    if (stillPlaying() || gen !== matchViewGen) return
    match = await fetchMatch(id)
  } catch {
    if (stillPlaying() || gen !== matchViewGen) return
    root.innerHTML = `<p class="kicker">This room’s gone.</p><button class="btn btn-primary" data-act="home">Home</button>`
    root.querySelector('[data-act="home"]')?.addEventListener('click', () => {
      history.replaceState({}, '', '/')
      void showHome()
    })
    return
  }

  if (stillPlaying() || gen !== matchViewGen) return
  await applyMatch(id, match, gen)
}

let refreshBusy = false

async function refreshMatch(id: string) {
  if (stillPlaying() || refreshBusy) return
  refreshBusy = true
  try {
    const match = await fetchMatch(id)
    if (stillPlaying()) return
    await applyMatch(id, match, matchViewGen)
  } catch {
    if (!stillPlaying()) startLobbyPoll(id, false)
  } finally {
    refreshBusy = false
  }
}

async function applyMatch(id: string, match: MatchView, gen: number) {
  if (stillPlaying() || gen !== matchViewGen) return

  if (match.you?.playing) {
    playLocked = true
    stopMatchPoll()
    try {
      const run = await api.startVersus(id)
      if (!playLocked) return
      showPlay(run)
    } catch {
      playLocked = false
      startLobbyPoll(id, match.settled)
    }
    return
  }

  if (match.rematch?.nextId && match.rematch.nextId !== id) {
    history.replaceState({}, '', `/?v=${match.rematch.nextId}`)
    paintedMatchKey = ''
    await showMatch(match.rematch.nextId)
    return
  }

  if (match.closed) {
    paintedMatchKey = ''
    stopMatchPoll()
    root.innerHTML = `
      <p class="kicker">${escapeHtml(closedCopy(match.closeReason))}</p>
      <button class="btn btn-primary" data-act="home">Home</button>
    `
    root.querySelector('[data-act="home"]')?.addEventListener('click', () => {
      history.replaceState({}, '', '/')
      void showHome()
    })
    return
  }

  const key = matchPaintKey(match)
  if (key === paintedMatchKey && root.querySelector(`[data-match-id="${id}"]`)) {
    startLobbyPoll(id, match.settled)
    return
  }
  if (stillPlaying()) return
  paintMatch(match)
  startLobbyPoll(id, match.settled)
}

function paintMatch(match: MatchView) {
  if (stillPlaying()) return
  const id = match.id
  paintedMatchKey = matchPaintKey(match)
  const session = getSession()
  const link = `${location.origin}/?c=${match.code}`
  const youNeedWallet = !session
  const canJoin = session && !match.you && !match.settled && !match.closed
  const canFund = Boolean(match.you && !match.you.funded && !match.settled && !match.closed)
  const canPlay = Boolean(match.you?.funded && !match.you.scored && !match.you.playing && !match.settled && !match.closed)
  const stakeLabel = `${formatAmount(match.stakeAmount)} ${match.asset}`
  const games = match.games?.length ? match.games : (['trace'] as GameKind[])
  const game = match.game ?? games[match.round ?? 0] ?? 'trace'
  const round = match.round ?? 0
  const modeLabel = `${games.map((g) => GAME_META[g].title).join(' + ')} · ${
    match.scoreMode === 'count' ? 'Most words' : 'Words they missed'
  }`
  const playLabel =
    games.length > 1
      ? `${GAME_META[game].title} · round ${round + 1} of ${games.length}`
      : `Go — ${GAME_META[game].title}`

  root.innerHTML = `
    <div class="play-head" data-match-id="${escapeHtml(match.id)}">
      <button class="back" type="button" data-act="home">Home</button>
      <div class="mode-tag">${escapeHtml(stakeLabel)} · ${modeLabel}</div>
    </div>
    <section class="card">
      <div class="mode-tag">Code</div>
      <p class="room-code">${escapeHtml(match.code)}</p>
      <p class="kicker" style="margin-top:8px">${
        match.scoreMode === 'count'
          ? 'Whoever finds more words wins.'
          : 'Only words they didn’t find count.'
      }</p>
      <ol class="board-list" style="margin-top:14px">
        <li><span>${escapeHtml(shortAddr(match.challenger.address))} · host</span><span class="muted">${seatState(match.challenger, match.scoreMode)}</span></li>
        <li><span>${match.opponent ? escapeHtml(shortAddr(match.opponent.address)) : 'Waiting…'}</span><span class="muted">${match.opponent ? seatState(match.opponent, match.scoreMode) : 'open'}</span></li>
      </ol>
    </section>
    <div class="stack" style="margin-top:16px">
      ${youNeedWallet ? `<p class="note">Connect a wallet, then come back with this code.</p>` : ''}
      ${canJoin ? `<button class="btn btn-primary" data-act="join">I’m in</button>` : ''}
      ${canFund ? `<button class="btn btn-primary" data-act="fund">Put in ${escapeHtml(stakeLabel)}</button>` : ''}
      ${canPlay ? `<button class="btn btn-primary" data-act="play">${escapeHtml(playLabel)}</button>` : ''}
      ${match.you?.scored && !match.settled ? `<p class="kicker">Waiting on them…</p>` : ''}
      <button class="btn btn-ghost" data-act="copy">Copy invite</button>
      ${match.settled ? settleBlock(match) : ''}
    </div>
  `

  root.querySelector('[data-act="home"]')?.addEventListener('click', () => {
    void api.leaveMatch(id).catch(() => undefined)
    history.replaceState({}, '', '/')
    void showHome()
  })
  root.querySelector('[data-act="copy"]')?.addEventListener('click', () => {
    void navigator.clipboard.writeText(link)
  })
  root.querySelector('[data-act="join"]')?.addEventListener('click', async () => {
    try {
      await api.joinMatch(id)
      paintedMatchKey = ''
      await showMatch(id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'join-failed')
    }
  })
  root.querySelector('[data-act="fund"]')?.addEventListener('click', () => void fundSeat(id))
  root.querySelector('[data-act="play"]')?.addEventListener('click', () => void beginVersus(id))
  root.querySelector('[data-act="claim"]')?.addEventListener('click', () => void claimUsdt(id))
  root.querySelector('[data-act="rematch"]')?.addEventListener('click', () => void offerRematch(id))
  root.querySelector('[data-act="accept"]')?.addEventListener('click', () => void acceptIncomingRematch(id))
  root.querySelector('[data-act="decline"]')?.addEventListener('click', () => void declineIncomingRematch(id))
  if (match.rematch?.expiresAt) startRematchClock(match.rematch.expiresAt)
}

async function beginVersus(id: string) {
  playLocked = true
  matchViewGen += 1
  stopMatchPoll()
  try {
    const run = await api.startVersus(id)
    showPlay(run)
  } catch (err) {
    playLocked = false
    paintedMatchKey = ''
    alert(err instanceof Error ? err.message : 'run-failed')
    await showMatch(id)
  }
}

function closedCopy(reason: string | null) {
  if (reason === 'idle-no-join') return 'Nobody showed. Start a new room.'
  if (reason === 'idle-no-play') return 'Nobody started. Start a new room.'
  if (reason === 'empty') return 'Everyone left. Start a new room.'
  if (reason === 'expired' || reason === 'settled') return 'This one’s over. Start a new room.'
  return 'This one’s over. Start a new room.'
}

async function claimUsdt(id: string, after?: () => void | Promise<void>, action: 'settle' | 'timeout' = 'settle') {
  try {
    const config = await api.config()
    if (!config.usdt.escrow) throw new Error('usdt-escrow-unconfigured')
    let hash: string
    if (action === 'timeout') {
      hash = await submitTimeoutRefund({
        escrow: config.usdt.escrow,
        chainId: config.usdt.chainId,
        matchId: id,
      })
    } else {
      const signed = await api.settleSig(id)
      hash = await submitSettle({
        escrow: config.usdt.escrow,
        chainId: config.usdt.chainId,
        matchId: signed.matchId,
        winner: signed.winner,
        signature: signed.signature,
      })
    }
    await api.markClaimed(id, hash).catch(() => undefined)
    if (after) {
      await after()
      return
    }
    alert(`Claim sent: ${hash}`)
  } catch (err) {
    alert(humanClaimError(err instanceof Error ? err.message : 'claim-failed'))
  }
}

function humanClaimError(code: string): string {
  if (code === 'pot-missing') return 'Nothing left to collect.'
  if (code === 'not-settled') return 'The round isn’t over yet.'
  if (code === 'usdt-escrow-unconfigured') return 'Can’t collect right now.'
  if (/denied|reject/i.test(code)) return 'You cancelled.'
  if (/settled|already/i.test(code)) return 'Already collected.'
  return code
}

async function fundSeat(id: string) {
  root.innerHTML = `<p class="kicker">Putting your stake in…</p>`
  try {
    const config = await api.config()
    const match = await api.getMatch(id)
    let hash: string | undefined
    let evmAddress: string | undefined
    if (!config.fakeChain && match.asset === 'USDT') {
      if (!config.usdt.escrow) throw new Error('usdt-escrow-unconfigured')
      evmAddress = await evmAccount(config.usdt.chainId)
      try {
        const already = await api.fundMatch(id, { evmAddress })
        if (already.you?.funded) {
          await showMatch(id)
          return
        }
      } catch (err) {
        if (!(err instanceof Error && err.message === 'not-seen-on-chain')) throw err
      }
      const locked = await lockUsdt({
        token: config.usdt.token,
        escrow: config.usdt.escrow,
        chainId: config.usdt.chainId,
        matchId: match.id,
        amount: BigInt(match.stakeUnits),
      })
      hash = locked.txHash
      evmAddress = locked.evmAddress
    } else if (!config.fakeChain) {
      if (!config.escrowAddress) throw new Error('escrow-unconfigured')
      hash = await sendStake({
        recipient: config.escrowAddress,
        valueLuna: match.stakeLuna,
        memo: match.memo,
      })
    }
    await api.fundMatch(id, { txHash: hash, evmAddress })
    await showMatch(id)
  } catch (err) {
    root.innerHTML = `
      <p class="kicker">${escapeHtml(err instanceof Error ? err.message : 'fund-failed')}</p>
      <button class="btn btn-primary" data-act="back">Back</button>
    `
    root.querySelector('[data-act="back"]')?.addEventListener('click', () => void showMatch(id))
  }
}

function settleBlock(match: MatchView): string {
  const overlay = match.overlay
  const title =
    match.winner === 'tie'
      ? 'Tie — stakes back'
      : match.winner && match.you && match.winner === match.you.address
        ? 'You won'
        : match.winner
          ? `${shortAddr(match.winner)} won`
          : 'Done'
  return `
    <section class="card">
      <div class="mode-tag">Score</div>
      <h2 style="font-size:32px;margin:8px 0 4px">${escapeHtml(title)}</h2>
      ${
        overlay
          ? `<p class="kicker">${overlay.scoreA} – ${overlay.scoreB}</p>
             ${
               match.scoreMode === 'unique'
                 ? `<div class="words">${overlay.uniqueA.map((w) => `<span class="chip">${escapeHtml(w)}</span>`).join('')}</div>
                    <p class="note">You both found: ${overlay.shared.length ? overlay.shared.join(', ') : 'nothing'}</p>
                    <div class="words">${overlay.uniqueB.map((w) => `<span class="chip">${escapeHtml(w)}</span>`).join('')}</div>`
                 : `<p class="note">Most words wins.</p>`
             }`
          : ''
      }
      ${
        match.asset === 'USDT' && canClaimUsdt(match)
          ? `<button class="btn btn-ghost" data-act="claim" style="width:100%;margin-top:12px">Collect USDT</button>`
          : ''
      }
      ${rematchBlock(match)}
    </section>
  `
}

function canClaimUsdt(match: MatchView): boolean {
  if (match.asset !== 'USDT' || !match.settled || !match.you || match.claimedOnChain) return false
  if (match.winner === 'tie') return true
  return match.winner === match.you.address
}

function rematchBlock(match: MatchView): string {
  const rematch = match.rematch
  const secs = Math.max(0, Math.ceil((rematch?.remainingMs ?? 0) / 1000))
  if (rematch?.incoming) {
    return `
      <p class="kicker" style="margin-top:12px">Play again? <span data-el="rematch-clock">${secs}s</span></p>
      <div class="rematch-row">
        <button class="btn btn-primary" data-act="accept">Accept</button>
        <button class="btn btn-ghost" data-act="decline">Decline</button>
      </div>
    `
  }
  if (rematch?.youOffered) {
    return `<p class="kicker" style="margin-top:12px">Waiting on them… <span data-el="rematch-clock">${secs}s</span></p>`
  }
  return `<button class="btn btn-primary" data-act="rematch" style="width:100%;margin-top:12px">Play again</button>`
}

async function goToMatch(id: string) {
  history.replaceState({}, '', `/?v=${id}`)
  paintedMatchKey = ''
  await showMatch(id)
}

async function offerRematch(id: string) {
  try {
    const next = await api.rematch(id)
    if (next.id !== id) {
      await goToMatch(next.id)
      return
    }
    paintedMatchKey = ''
    await showMatch(id)
  } catch (err) {
    alert(err instanceof Error ? err.message : 'rematch-failed')
  }
}

async function acceptIncomingRematch(id: string) {
  try {
    const next = await api.acceptRematch(id)
    await goToMatch(next.id)
  } catch (err) {
    alert(err instanceof Error ? err.message : 'accept-failed')
    paintedMatchKey = ''
    await showMatch(id)
  }
}

async function declineIncomingRematch(id: string) {
  try {
    await api.declineRematch(id)
    paintedMatchKey = ''
    await showMatch(id)
  } catch (err) {
    alert(err instanceof Error ? err.message : 'decline-failed')
  }
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : String(value)
}

function seatState(
  seat: { funded: boolean; scored: boolean; uniqueScore: number | null; playing?: boolean },
  mode: 'unique' | 'count' = 'unique',
) {
  if (seat.uniqueScore !== null) return `${seat.uniqueScore}`
  if (seat.scored) return 'done'
  if (seat.playing) return 'in it'
  if (seat.funded) return 'in'
  return 'waiting'
}

function shortAddr(address: string) {
  const compact = address.replace(/\s+/g, '')
  return `${compact.slice(0, 6)}…${compact.slice(-4)}`
}

function matchPaintKey(match: MatchView) {
  return [
    match.id,
    match.closed,
    match.settled,
    match.opponent?.address ?? '',
    match.challenger.funded,
    match.challenger.scored,
    match.challenger.playing,
    match.opponent?.funded ?? '',
    match.opponent?.scored ?? '',
    match.opponent?.playing ?? '',
    match.you?.funded ?? '',
    match.you?.scored ?? '',
    match.you?.playing ?? '',
    match.game ?? '',
    match.round ?? '',
    match.winner ?? '',
    match.claimedOnChain ?? '',
    match.rematch?.from ?? '',
    match.rematch?.expiresAt ?? '',
    match.rematch?.nextId ?? '',
  ].join('|')
}

function startLobbyPoll(id: string, settled: boolean) {
  if (stillPlaying()) return
  stopMatchPoll()
  const ms = settled ? 500 : 2500
  matchPoll = window.setInterval(() => {
    if (stillPlaying()) return
    void refreshMatch(id)
  }, ms)
}

function stopMatchPoll() {
  if (matchPoll !== null) {
    window.clearInterval(matchPoll)
    window.clearTimeout(matchPoll)
    matchPoll = null
  }
}

function startRematchClock(expiresAt: number) {
  stopRematchTick()
  const tick = () => {
    const el = root.querySelector('[data-el="rematch-clock"]')
    const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000))
    if (el) el.textContent = `${left}s`
    if (left <= 0) return
    rematchTick = window.setTimeout(tick, 200)
  }
  tick()
}

function stopRematchTick() {
  if (rematchTick !== null) {
    window.clearTimeout(rematchTick)
    rematchTick = null
  }
}

function clearPlaySurface() {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
  gridView?.destroy()
  gridView = null
}

function teardownPlay() {
  playLocked = false
  paintedMatchKey = ''
  clearPlaySurface()
  stopMatchPoll()
  stopRematchTick()
}

function flashPop(kind: 'good' | 'bad' | 'already', text: string) {
  const el = root.querySelector<HTMLElement>('[data-el="pop"]')
  if (!el) return
  el.className = `pop ${kind} show`
  el.textContent = text
  window.clearTimeout(Number(el.dataset.timer ?? 0))
  const timerId = window.setTimeout(() => {
    el.classList.remove('show')
  }, 700)
  el.dataset.timer = String(timerId)
}

function vibrate(ms: number) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* ignore */
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
