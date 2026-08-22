import {
  generateGridFromHex,
  hasWord,
  parseDictionary,
  pointsForLength,
  wordFromPath,
  type Dictionary,
  type InputEvent,
} from '@versus/sim'
import { api, loadDictionary, type DailyInfo, type IssuedRun, type Leaderboard, type MatchView } from './api.ts'
import { mountGrid, type GridView } from './grid-view.ts'
import { evmAccount, lockUsdt, recallLock, resolveEvmAddress, submitSettle } from './evm.ts'
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

boot()

async function boot() {
  root.innerHTML = `
    <p class="wordmark">Versus Word</p>
    <p class="kicker">Loading the word list…</p>
  `
  try {
    const [text] = await Promise.all([loadDictionary(), api.health()])
    dict = parseDictionary(text)
    const params = new URLSearchParams(location.search)
    const pending = params.get('v')
    const code = params.get('c')
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
      <p class="kicker">Could not reach the server. Start it with <code>npm run dev</code>.</p>
    `
    console.error(err)
  }
}

async function showHome() {
  teardownPlay()
  let daily: DailyInfo
  let board: Leaderboard
  try {
    ;[daily, board] = await Promise.all([api.daily(), api.leaderboard()])
  } catch {
    root.innerHTML = `<p class="kicker">API is down.</p>`
    return
  }

  const session = getSession()
  const pay = session ? true : await isPayAvailable()

  root.innerHTML = `
    <header>
      <h1 class="wordmark">Versus Word</h1>
      <p class="kicker">Trace words. Same letters. The server keeps score.</p>
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
                 <p class="kicker" style="margin-top:8px">Sign in so the daily board is your wallet, not this phone.</p>
                 <button class="btn btn-primary" data-act="connect" style="margin-top:12px;width:100%">Connect wallet</button>`
              : `<div class="mode-tag">Guest</div>
                 <p class="kicker" style="margin-top:8px">Playing in a browser. Open this URL inside Nimiq Pay to connect a wallet.</p>`
        }
      </section>
      ${
        session
          ? `<button class="btn btn-primary" data-act="challenge">New versus room</button>
             <button class="btn btn-ghost" data-act="join-code">Join with a code</button>`
          : ''
      }
      <button class="btn ${session ? 'btn-ghost' : 'btn-primary'}" data-act="daily" ${daily.played ? 'disabled' : ''}>
        ${daily.played ? `Daily done · ${daily.score} pts` : 'Play today’s grid'}
      </button>
      <button class="btn btn-ghost" data-act="free">Free run</button>
      <section class="card">
        <div class="mode-tag">${daily.date} · daily board</div>
        ${
          board.entries.length
            ? `<ol class="board-list">${board.entries
                .map(
                  (row, i) =>
                    `<li><span>${i + 1}. ${escapeHtml(row.label)}</span><span class="muted">${row.score} · ${row.wordCount} words</span></li>`,
                )
                .join('')}</ol>`
            : `<p class="kicker">No verified scores yet. Be first.</p>`
        }
      </section>
    </div>
  `

  root.querySelector('[data-act="daily"]')?.addEventListener('click', () => startRun('daily'))
  root.querySelector('[data-act="free"]')?.addEventListener('click', () => startRun('free'))
  root.querySelector('[data-act="challenge"]')?.addEventListener('click', () => void showNewChallenge())
  root.querySelector('[data-act="join-code"]')?.addEventListener('click', () => showJoinCode())
  root.querySelector('[data-act="disconnect"]')?.addEventListener('click', () => {
    clearSession()
    void showHome()
  })
  root.querySelector('[data-act="connect"]')?.addEventListener('click', () => void connectWallet())
}

async function connectWallet() {
  root.innerHTML = `<p class="kicker">Waiting on Nimiq Pay…</p>`
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

function humanConnectError(code: string): string {
  if (code === 'not-in-pay') return 'Open this app inside Nimiq Pay, then connect.'
  if (code === 'no-account') return 'No Nimiq account in Pay.'
  if (code === 'PermissionDeniedError' || /denied|reject/i.test(code)) return 'Signature was cancelled.'
  return code
}

async function startRun(mode: 'free' | 'daily') {
  if (!dict) return
  let run: IssuedRun
  try {
    run = await api.start(mode)
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
  const cells = generateGridFromHex(run.seed)
  const inputs: InputEvent[] = []
  const found = new Set<string>()
  let livePath: number[] = []
  let status: 'idle' | 'good' | 'bad' = 'idle'
  let statusWord = ''
  let submitting = false

  root.innerHTML = `
    <div class="play-head">
      <button class="back" type="button" data-act="quit">Quit</button>
      <div class="mode-tag">${run.mode === 'daily' ? 'Daily' : run.mode === 'versus' ? 'Versus' : 'Free run'}</div>
      <div class="clock" data-el="clock">1:30</div>
    </div>
    <div class="current" data-el="current"></div>
    <div class="grid-wrap" data-el="grid"></div>
    <div class="found" data-el="found"></div>
    <div class="scoreline">
      <span data-el="tally">0 words</span>
      <span>Score is official after the clock.</span>
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
    if (status === 'good' || status === 'bad') currentEl.textContent = statusWord
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
        vibrate(12)
        return
      }
      inputs.push({ t: Math.max(0, at), cells: path })
      if (!found.has(parsed.word)) {
        found.add(parsed.word)
        paintFound()
      }
      status = 'good'
      statusWord = `${parsed.word} +${pointsForLength(parsed.word.length)}`
      paintStatus()
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
    const left = Math.max(0, run.durationMs - (Date.now() - run.startTs))
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
    root.innerHTML = `<p class="kicker">Server is walking your path…</p>`
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
      <div class="mode-tag">Verified · ${mode}</div>
      <h2>${score}</h2>
      <p>${words.length} word${words.length === 1 ? '' : 's'} the server accepted.</p>
      <div class="words">${words.map((word) => `<span class="chip">${escapeHtml(word)}</span>`).join('')}</div>
      <div class="stack">
        <button class="btn btn-primary" data-act="home">Back home</button>
        ${mode === 'free' ? `<button class="btn btn-ghost" data-act="again">Another free run</button>` : ''}
      </div>
    </section>
  `
  root.querySelector('[data-act="home"]')?.addEventListener('click', () => void showHome())
  root.querySelector('[data-act="again"]')?.addEventListener('click', () => void startRun('free'))
}

async function showNewChallenge() {
  let asset: 'NIM' | 'USDT' = 'NIM'
  let scoreMode: 'unique' | 'count' = 'unique'
  root.innerHTML = `
    <button class="back" type="button" data-act="home">Back</button>
    <h1 class="wordmark">New room</h1>
    <p class="kicker">Set the table. They join with a six-letter code or the link.</p>
    <form class="stack" style="margin-top:22px" data-el="form">
      <label class="field">
        <span>Stake in</span>
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
          <button type="button" class="on" data-mode="unique">Unique words</button>
          <button type="button" data-mode="count">Most words</button>
        </div>
      </label>
      <p class="note" data-el="hint">Shared words are worth 0. Highest unique score takes the pot.</p>
      <button class="btn btn-primary" type="submit">Create room</button>
    </form>
  `
  const hint = root.querySelector<HTMLElement>('[data-el="hint"]')!
  function paint() {
    root.querySelectorAll('[data-asset]').forEach((btn) => btn.classList.toggle('on', btn.getAttribute('data-asset') === asset))
    root.querySelectorAll('[data-mode]').forEach((btn) => btn.classList.toggle('on', btn.getAttribute('data-mode') === scoreMode))
    hint.textContent =
      scoreMode === 'count'
        ? 'Whoever finds more accepted words wins. Shared words still count.'
        : 'Shared words are worth 0. Highest unique score takes the pot.'
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
  root.querySelector<HTMLFormElement>('[data-el="form"]')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const raw = new FormData(event.currentTarget as HTMLFormElement).get('amount')
    const amount = Number(String(raw ?? '').replace(',', '.'))
    try {
      const match = await api.createMatch({ stakeAmount: amount, asset, scoreMode })
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
    <p class="kicker">Type the six-letter room code.</p>
    <form class="stack" style="margin-top:22px" data-el="form">
      <input class="code" name="code" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="K7NP2Q" />
      <button class="btn btn-primary" type="submit">Enter room</button>
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
    root.innerHTML = `<p class="kicker">No room for that code.</p><button class="btn btn-primary" data-act="again">Try again</button>`
    root.querySelector('[data-act="again"]')?.addEventListener('click', () => showJoinCode())
  }
}

async function showMatch(id: string) {
  teardownPlay()
  stopMatchPoll()
  let match: MatchView
  try {
    const config = await api.config().catch(() => null)
    const recalled = recallLock(id)
    const evm =
      recalled?.evm ?? (await resolveEvmAddress(config?.usdt.chainId)) ?? null
    if (recalled) {
      try {
        await api.fundMatch(id, { evmAddress: recalled.evm, txHash: recalled.txHash })
      } catch {
        /* still load the match */
      }
    }
    match = await api.getMatch(id, evm ?? undefined)
  } catch {
    root.innerHTML = `<p class="kicker">Match not found.</p><button class="btn btn-primary" data-act="home">Home</button>`
    root.querySelector('[data-act="home"]')?.addEventListener('click', () => {
      history.replaceState({}, '', '/')
      void showHome()
    })
    return
  }

  if (match.closed) {
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

  const session = getSession()
  const link = `${location.origin}/?c=${match.code}`
  const youNeedWallet = !session
  const canJoin = session && !match.you && !match.settled && !match.closed
  const canFund = Boolean(match.you && !match.you.funded && !match.settled && !match.closed)
  const canPlay = Boolean(match.you?.funded && !match.you.scored && !match.settled && !match.closed)
  const stakeLabel = `${formatAmount(match.stakeAmount)} ${match.asset}`
  const modeLabel = match.scoreMode === 'count' ? 'Most words' : 'Unique words'

  root.innerHTML = `
    <div class="play-head">
      <button class="back" type="button" data-act="home">Home</button>
      <div class="mode-tag">${escapeHtml(stakeLabel)} · ${modeLabel}</div>
    </div>
    <section class="card">
      <div class="mode-tag">Room code</div>
      <p class="room-code">${escapeHtml(match.code)}</p>
      <p class="kicker" style="margin-top:8px">${
        match.scoreMode === 'count'
          ? 'Most accepted words wins. Shared words still count.'
          : 'Words you both find are worth 0. Highest unique score takes the pot.'
      }</p>
      <ol class="board-list" style="margin-top:14px">
        <li><span>${escapeHtml(shortAddr(match.challenger.address))} · host</span><span class="muted">${seatState(match.challenger, match.scoreMode)}</span></li>
        <li><span>${match.opponent ? escapeHtml(shortAddr(match.opponent.address)) : 'Waiting…'}</span><span class="muted">${match.opponent ? seatState(match.opponent, match.scoreMode) : 'empty seat'}</span></li>
      </ol>
    </section>
    <div class="stack" style="margin-top:16px">
      ${youNeedWallet ? `<p class="note">Connect a wallet on the home screen, then enter this code.</p>` : ''}
      ${canJoin ? `<button class="btn btn-primary" data-act="join">Sit down</button>` : ''}
      ${canFund ? `<button class="btn btn-primary" data-act="fund">Stake ${escapeHtml(stakeLabel)}</button>` : ''}
      ${canPlay ? `<button class="btn btn-primary" data-act="play">Play 90 seconds</button>` : ''}
      ${match.you?.scored && !match.settled ? `<p class="kicker">Waiting for the other trace.</p>` : ''}
      <button class="btn btn-ghost" data-act="copy">Copy invite link</button>
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
      await showMatch(id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'join-failed')
    }
  })
  root.querySelector('[data-act="fund"]')?.addEventListener('click', () => void fundSeat(id))
  root.querySelector('[data-act="play"]')?.addEventListener('click', async () => {
    try {
      const run = await api.startVersus(id)
      showPlay(run)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'run-failed')
    }
  })
  root.querySelector('[data-act="claim"]')?.addEventListener('click', () => void claimUsdt(id))
  root.querySelector('[data-act="rematch"]')?.addEventListener('click', async () => {
    try {
      const next = await api.rematch(id)
      history.replaceState({}, '', `/?v=${next.id}`)
      await showMatch(next.id)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'rematch-failed')
    }
  })

  if (!match.settled && !match.closed) {
    matchPoll = window.setTimeout(() => void showMatch(id), 2500)
  }
}

function closedCopy(reason: string | null) {
  if (reason === 'idle-no-join') return 'Nobody joined. This room is closed — create a new one.'
  if (reason === 'idle-no-play') return 'No game started. This room is closed — create a new one.'
  if (reason === 'empty') return 'Everyone left. This room is closed — create a new one.'
  if (reason === 'expired' || reason === 'settled') return 'This room is closed — create a new one.'
  return 'This room is closed — create a new one.'
}

async function claimUsdt(id: string) {
  try {
    const config = await api.config()
    if (!config.usdt.escrow) throw new Error('usdt-escrow-unconfigured')
    const signed = await api.settleSig(id)
    const hash = await submitSettle({
      escrow: config.usdt.escrow,
      chainId: config.usdt.chainId,
      matchId: signed.matchId,
      winner: signed.winner,
      signature: signed.signature,
    })
    alert(`Claim sent: ${hash}`)
  } catch (err) {
    alert(err instanceof Error ? err.message : 'claim-failed')
  }
}

async function fundSeat(id: string) {
  root.innerHTML = `<p class="kicker">Sending stake…</p>`
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
    match.winner === 'tie' ? 'Tie · stakes back' : match.winner ? `Winner ${shortAddr(match.winner)}` : 'Settled'
  return `
    <section class="card">
      <div class="mode-tag">Result</div>
      <h2 style="font-size:32px;margin:8px 0 4px">${escapeHtml(title)}</h2>
      ${
        overlay
          ? `<p class="kicker">${overlay.scoreA} – ${overlay.scoreB} ${match.scoreMode === 'count' ? 'words' : 'unique'}</p>
             ${
               match.scoreMode === 'unique'
                 ? `<div class="words">${overlay.uniqueA.map((w) => `<span class="chip">${escapeHtml(w)}</span>`).join('')}</div>
                    <p class="note">Shared (0 pts): ${overlay.shared.length ? overlay.shared.join(', ') : 'none'}</p>
                    <div class="words">${overlay.uniqueB.map((w) => `<span class="chip">${escapeHtml(w)}</span>`).join('')}</div>`
                 : `<p class="note">Most accepted words wins. Shared words still count.</p>`
             }`
          : ''
      }
      ${
        match.asset === 'USDT'
          ? `<button class="btn btn-ghost" data-act="claim" style="width:100%;margin-top:12px">Claim USDT on Polygon</button>`
          : ''
      }
      <button class="btn btn-primary" data-act="rematch" style="width:100%;margin-top:12px">Rematch</button>
    </section>
  `
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : String(value)
}

function seatState(
  seat: { funded: boolean; scored: boolean; uniqueScore: number | null },
  mode: 'unique' | 'count' = 'unique',
) {
  if (seat.uniqueScore !== null) return `${seat.uniqueScore} ${mode === 'count' ? 'words' : 'unique'}`
  if (seat.scored) return 'traced'
  if (seat.funded) return 'staked'
  return 'not staked'
}

function shortAddr(address: string) {
  const compact = address.replace(/\s+/g, '')
  return `${compact.slice(0, 6)}…${compact.slice(-4)}`
}

function stopMatchPoll() {
  if (matchPoll !== null) {
    window.clearTimeout(matchPoll)
    matchPoll = null
  }
}

function teardownPlay() {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
  stopMatchPoll()
  gridView?.destroy()
  gridView = null
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
