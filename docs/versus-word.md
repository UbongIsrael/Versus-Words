# Versus Words — product spec

Locked Cycle II entry. Solo, cold start, place-first. Kickoff 24 Aug, close 19 Sep.

Scaffold is in. `npm install && npm test && npm run dev` — free run + daily, no wallet, no pots.

Working title: **Versus Words**. Ship name can change in week 3 if a better one is obvious. Do not bikeshed it now.

## One-liner

Two people get the same letter grid. They have 90 seconds. The client only records the finger path. The server rebuilds the run, scores it, and — if they staked — pays the higher verified score. The invite is the product.

## What it is not

- Not a NimJump skin. No platforms, gyro, or vertical climb.
- Not a client-trusted “I scored 400” game.
- Not trivia with a random pot. Not anagram-of-the-day with an honor system.
- Not a dictionary company. One verb: **trace words on a shared seed**.

## The game

### Board

- 4×4 grid. Sixteen letters. Generated deterministically from a 32-byte seed.
- Adjacent includes diagonals (8-neighbor), Boggle-style.
- A path may not reuse a cell in the same word.
- Minimum word length: 3.
- Dictionary: a single English word list vendored in the repo under a permissive license (e.g. ENABLE / SCOWL subset). Same file on client (for instant reject UX) and server (for truth). The server list is authoritative.

### Scoring (daily / solo)

Classic Boggle points, applied only to **valid unique words** on that run:

| Length | Points |
| --- | --- |
| 3 | 1 |
| 4 | 1 |
| 5 | 2 |
| 6 | 3 |
| 7 | 5 |
| 8+ | 11 |

Duplicate submissions of the same word in one run count once.

### Scoring (VS)

After both runs are verified, words that **both** found are worth **0**. Words only one player found keep the table above. Ties on that unique-word score: pot returns to both, minus nothing if we can do two refunds; if fees are zero this is clean.

This is the Versus twist. Same seed is fair. Unique words are the fight. The overlay replay is the theater.

### Run clock

- 90 seconds, started by the server when it issues the run token.
- Inputs timestamped relative to run start.
- Any input after t=90 is dropped on the server even if the client was generous.

### Controls

- Finger (or mouse) traces a path. Lift commits the word.
- Invalid path or non-word: short haptic/shake, no score flash from the client that implies success until the server ack — or optimistic flash that **reverts** if the server says no.
- One-hand, thumb-reachable. Portrait only. No landscape.

## Modes

### 1. Daily (must ship)

- One seed per UTC day, issued by the server, signed.
- Play once for a verified score. Replay of your own traces is allowed; a second *scoring* run is not.
- Leaderboard: masked wallet, score, word count. Unseeded. Queryable.

### 2. Versus (must ship)

- Host sets the table: NIM or USDT, a custom amount, and a scoring mode (`unique` or `most words`).
- Server issues a six-letter room code plus a `/?c=CODE` invite link.
- Opponent joins in-app by typing the code, or opens the link.
- Rooms die if nobody joins in 8 minutes, nobody starts a run in 12 minutes after a join, everyone leaves before a run, or 10 minutes after a result. A live 90s run is not killed.
- Both play the same seed (async is fine: challenger can play before the opponent opens the link).
- When both runs verify, unique-word scores decide. Server pays the pot to the winner.
- If the opponent never funds within 24h: challenger is refunded.
- If one funds and plays but the other funds and never submits a run: after 24h the one who submitted wins. If neither submits: both refunded.
- Rematch: one tap, new seed, same stake, same opponent.

### 3. Free run (must ship)

- Practice on a random server-issued seed. No board, no pot. Exists so a judge can feel the verb in ten seconds without paying.

## Authority model

Copy NimJump’s shape, not their engine.

```
server issues signed seed + runId + startTs
        ↓
client plays, records [{t, cells[]}, ...]
        ↓
client POSTs input log + runId
        ↓
server: signature ok? seed unused? t monotonic? t<=90?
        ↓
server rebuilds words from cells + grid(seed)
        ↓
server checks dictionary + path rules
        ↓
server writes score
        ↓
only then: leaderboard / pot
```

The client must not send a score. If it does, the server ignores it.

**Tests that must exist before Week 3**

| Attack | Expected |
| --- | --- |
| POST a score field | Ignored |
| Invent a word not on the path | Rejected |
| Path that jumps non-adjacent cells | Rejected |
| Reuse a cell in one word | Rejected |
| Replay someone else’s runId | Rejected |
| Replay your own runId | Rejected (already consumed) |
| Inputs after 90s | Dropped |
| Dictionary word that is not on this grid | Rejected |
| Client-generated seed | Rejected |
| Second daily run | Rejected |
| VS payout before both verified | Impossible |
| Device id used for 3+ pot-winning wallets in 24h | Blocked or flagged |

Device identifier (`requestDeviceIdentifier`) is the anti-farm handle. Do not pretend it is a user id.

## Nimiq Pay integration

| Hook | Where |
| --- | --- |
| `init()` + `listAccounts()` | Identity. Every run and every board row is a wallet. |
| `signMessage` | Session login. Bind wallet to JWT. No email. |
| NIM transfer (stake) | Player → escrow, memo = `matchId`. |
| Backend watches NIM txs | Confirm stake before unlocking the VS run (or allow play and withhold payout until funded — prefer **fund then play** so the video is honest). |
| NIM transfer (payout / refund) | Escrow hot wallet → winner or both. Circulation. Bonus points. |
| `requestDeviceIdentifier` | Farm cap. Prompt reason: “Keep Versus fair.” |
| `window.nimiqPay.language` | UI strings. Dictionary stays English in v1 (say so in the UI). |
| Deeplink | `https://nimpay.app/miniapps/open/<host>/v/<matchId>` and the `nimiqpay://` form. This is acquisition. |

No USDT in v1. No EVM. NIM only.

**Escrow honesty:** the pot sits in a server-controlled address. Say that in the app and the README. Keys live in the host secret store, never the repo. Publish the escrow address. Optionally publish outgoing payout txs on a `/transparency` page — cheap trust, high council value.

## Stack (decided)

**Web.** TypeScript end to end.

| Piece | Choice | Why |
| --- | --- | --- |
| Client | Vite + TypeScript. No React required; a small component lib is fine if it stays out of the way. | Phone WebView, 60s onboarding, no 30MB wasm. |
| Grid / trace | Canvas or SVG in the client. One file owns hit-testing. | The verb must feel native. |
| Sim | Shared package `sim/` imported by client (preview) and server (truth). | One implementation of path → word → points. |
| API | Hono or vanilla on Cloudflare Workers, or a small Node server if Workers + NIM RPC is painful. Prefer Workers + D1 if the NIM watch loop can live as a cron/queue. | NimQuest already proved this shape to the council. |
| DB | D1 or SQLite. Matches, runs, input logs, payouts. | Input logs are tiny. Keep them forever. |
| Auth | Wallet signature → JWT. | Standard Mini App. |
| Hosting | Client on Pages/Workers static. API on Workers or a single VPS if the escrow watcher is simpler there. | HTTPS, custom domain before submission. |

Godot is **out** unless the canvas trace is genuinely unshippable by 28 Aug. A 4×4 grid does not need an engine. Unity is out.

## Must ship (19 Sep)

- Free run that feels good on a 390px phone in Nimiq Pay
- Daily seed, one verified score, live unseeded leaderboard
- VS: create, fund, play, verify, pay or refund, rematch, deeplink
- Overlay replay of both traces after a VS match
- Server-side sim + the attack table above, running in CI
- Device-id farm cap
- Escrow transparency page
- `window.nimiqPay.language` for chrome (EN + one other if cheap)
- MIT repo, no secrets, README with architecture + attack table + curl-able leaderboard
- 45–60s demo video (finger on glass, then VS invite, then payout)
- Submission blurb ≤ 250 words
- Skool posts at each Sip & Ship with **real** numbers

## Stretch (only after must-ship is live)

- Spectate a live VS (third phone watches traces land)
- Gyro nothing. Don’t.
- A second dictionary / language pack
- Cosmetics bought with NIM
- Weekly board
- Bot detection beyond device cap

## Must not ship

- A second game mode
- Chat
- Usernames, avatars, profiles
- On-chain smart contracts
- USDT / Polygon
- Client-side score in the API
- Seeded / fake leaderboard rows
- Random-winner “jackpot”
- Soundtracks, particle packs, or a brand world
- Admin that can edit scores by hand (admin may refund a stuck pot)

## Information architecture (four screens)

1. **Today** — big grid thumbnail, “Play daily”, your status, top 3, “Challenge someone”
2. **Play** — grid, clock, found-word chips, nothing else
3. **Match** — both wallets, both stakes, both states (waiting / playing / verifying / paid), overlay replay, rematch
4. **You** — masked address, daily streak (optional, only if free), match history

Onboarding: first open → connect wallet → one sentence (“Trace words. Same letters. Server keeps score.”) → Free run. Under 60 seconds.

## Visual bar

Nimiq-adjacent, not a Nimiq clone. Large type, lots of air, one accent. The grid is the brand. Think a premium word game, not a crypto dashboard. Dark or light — pick one and commit. Every state (empty daily, waiting on opponent, refund) must look designed.

## Calendar

Pre-kickoff is real time. Use it.

| When | Ship |
| --- | --- |
| **15–17 Aug** | `sim/` + 4×4 generator + dictionary + canvas tracer. Two browsers, no wallet. |
| **18–20 Aug** | Server: issue seed, accept input log, reject the first four attacks. Tests in CI. |
| **21–23 Aug** | Wallet login + free run + daily inside a phone WebView. Ugly is fine. |
| **24 Aug kickoff** | Public URL. First Skool post: here is the verb. |
| **25–26 Aug** (Sip & Ship 1) | VS create + deeplink, even if payout is still manual. Ask two people to play you. |
| **27–31 Aug** | Fund → play → verify → automatic payout/refund. Overlay replay. |
| **1–2 Sep** (Sip & Ship 2) | Daily board live. Publish curl-able leaderboard. Attack table in README. |
| **3–8 Sep** | WebView polish, empty/error states, farm cap, transparency page, video draft. |
| **9 Sep** (Sip & Ship 3, ~Week 3 public) | App must be complete. This week is users and bugs, not features. |
| **10–15 Sep** | Fix what public testers break. Cut anything unfinished. |
| **16 Sep** (Sip & Ship 4) | Final video, numbers, story. |
| **17–19 Sep** | Submit. Freeze features 17 Sep. Only revert-level fixes after that. |

## Builder story (draft, rewrite from a real match)

Web3 games pay the client for a number the client invented. Versus Words does not ask you to trust a score. You and I get the same sixteen letters. We trace. The server walks the path itself. Only words that appear on the grid, in the dictionary, in time, count — and in a duel, only the words the other person missed.

## Submission (draft)

Versus Words is a 90-second word-hunt Mini App. Daily, everyone plays the same server-issued grid. Versus, two wallets stake NIM on the same seed; the server resimulates both input logs and pays the player who found more unique words. The client never submits a score. Nimiq Pay is login, stake, payout, and the invite deeplink.

## Open before code (none blocking)

- Final public name
- Exact chip amounts (depends on testnet vs mainnet NIM feel)
- Workers vs a tiny VPS for the watcher — decide on day 1 of build from whichever NIM RPC is less painful
- Whether daily has a tiny NIM prize from a funded pool (nice marketing, extra custody). Default **no** — VS pots are enough circulation

## Status

Shipped: free run, daily, server verify, Nimiq Pay login, versus matches (same seed, unique-word scoring, invite link, rematch).

Local `npm run dev` sets `FAKE_CHAIN=1` so a stake is marked funded without a real NIM send. For live pots set `ESCROW_ADDRESS` and `FAKE_CHAIN=0`; incoming txs are watched on `rpc.nimiqwatch.com`. Settlement math is real. Automatic on-chain payout still needs an escrow key (recorded on `/api/transparency` until then).

Mechanics Q&A: [`docs/game-mechanics.md`](game-mechanics.md).
