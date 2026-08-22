# AGENTS.md — Nimiq Mini Apps Competition (Cycle II)

This repo is a Cycle II entry workspace for the [Nimiq Mini Apps Competition](https://miniappscompetition.com). Nothing here is a shipped product yet. Treat this file as the working brief: competition constraints, what Cycle I actually rewarded, what is already saturated, and which ideas are still worth building.

Read this before proposing features, scaffolding an app, or “just adding payments.” A polished clone of a Cycle I utility will not place.

## Mission

Ship **one** working Mini App inside Nimiq Pay in four weeks. It must be usable on the first try, use NIM or USDT as a core interaction (NIM earns bonus), live on a public HTTPS URL, and open-sourced under MIT.

The product is **Versus Word**: a 90-second same-seed word-hunt duel. The client sends traces; the server is the only thing that may write a score or release a pot. The invite link is the growth loop. Spec: [`docs/versus-word.md`](docs/versus-word.md).

## Competition facts

| Item | Detail |
| --- | --- |
| Host | Nimiq / Nimiq Pay Mini Apps Framework |
| Cycle I | 6–31 Jul 2026. 62 submissions. Winners announced. |
| Cycle II window | **Confirmed by builder:** kickoff **24 Aug 2026**, submissions close **19 Sep 2026**. |
| Cycle III | Listed as 28 Sep – 23 Oct 2026 |
| Prize pool / cycle | $17,000 USDT on Polygon: $10k / $5k / $2k |
| Payout | Three equal monthly instalments. App must stay live. Month 3 requires a meaningful update. Expected maintenance ≥ 12 months. |
| Team | Solo or up to 5. One lead. One submission per team per cycle. |
| License | Public GitHub, **MIT required** |
| Early access | Week 3 submissions go public for community testing |
| Community | [Skool](https://www.skool.com/miniappscompetition/about). Sip & Ship: **26 Aug, 2 Sep, 9 Sep, 16 Sep**. Marketing is scored. |
| Docs | [nimiq.dev/mini-apps](https://nimiq.dev/mini-apps) |
| Cycle I showcase | [miniappscompetition.com/submissions/cycle1](https://miniappscompetition.com/submissions/cycle1) |
| Official submissions repo | [github.com/nimiq/miniappscompetition-submissions](https://github.com/nimiq/miniappscompetition-submissions) |

**Eligibility notes**

- 18+, public GitHub, Nimiq wallet. OFAC-sanctioned jurisdictions cannot be paid.
- Winning Mini Apps cannot be resubmitted. Non-winners can re-enter if significantly improved. Past winners may enter with a **new** app.
- AI tools are allowed. Existing apps may be adapted if rights are clear and Nimiq Pay is a core interaction.
- Gambling / games of chance are banned. Skill-based games with defined rules are allowed.
- Displaying a Nimiq logo is not integration.

**This builder (locked):** solo, cold start, **goal is placing, not monetizing**.

**Idea (locked):** Versus Word — same-seed word-hunt duel, server resimulates, NIM pot, invite link. Spec: [`docs/versus-word.md`](docs/versus-word.md). Grades: [`CYCLE2-IDEAS.md`](CYCLE2-IDEAS.md).

Code is in. Golden path: `packages/sim` (truth), `apps/api` (runs + matches), `apps/web` (tracer + versus). Match rules live in `apps/api/src/match.ts`. Local dev uses `FAKE_CHAIN=1`.

## What a Mini App actually is

A Mini App is a normal web app hosted by you, loaded in a Nimiq Pay WebView. You never touch keys. You request wallet actions; the host shows native approval dialogs.

```js
import { init, requestDeviceIdentifier } from '@nimiq/mini-app-sdk'

const nimiq = await init()
const [accounts, consensus] = await Promise.all([
  nimiq.listAccounts(),
  nimiq.isConsensusEstablished(),
])
```

**Use these, not browser substitutes**

- `window.nimiqPay.language` — user’s Nimiq Pay language, not `navigator.language`
- `requestDeviceIdentifier({ reason })` — per-origin device handle for leaderboards / anti-spam. Identifies the **device**, not the person
- Deeplinks: `nimiqpay://miniapp?url=your-app.com` and `https://nimpay.app/miniapps/open/your-app.com`

**Networks**

- NIM natively (payments, message signing, consensus, block number)
- EVM via `window.ethereum`: Ethereum, Polygon, Arbitrum, Optimism, Base, BSC, Sepolia
- USDT on Polygon counts. Supporting **NIM** scores the 5-point bonus

**Hard constraints for this repo**

- Mobile-first. The judging device is a phone WebView, not a desktop browser.
- Onboarding under 60 seconds. No seed-phrase homework.
- Secrets stay on a backend. No keys in the client bundle.
- Test inside Nimiq Pay: same Wi-Fi, Custom URL, long-press settings 10s for testnet, claim testnet NIM from empty-state / Top Up.
- Stripe / fiat on-ramps are allowed as extras. Native Google Pay API is not. Wallet integration must still be the core loop.
- Any frontend framework is fine. Backend is allowed and, for anything that can be cheated or faked, **required**.

Official idea list at [nimiq.dev/mini-apps/ideas](https://nimiq.dev/mini-apps/ideas) is a starter menu (tip jar, invoice, split bill, coin flip, trivia). Cycle I already built almost all of it. Do not implement that list as-is.

## Scoring (105 points) — what to optimize

Scored by the Nimiq Community Council. 20 criteria. 0–5 per criterion.

| Block | Points | What they actually look at |
| --- | --- | --- |
| Design & UX | 25 | First impression, visual consistency, nav without instructions, **native phone feel**, 0→use in <60s |
| Functionality | 25 | It works end-to-end. Edge cases. Wallet flow is real. Not a prototype. |
| Usefulness & originality | 25 | Why this exists. Not the 8th bill splitter. Someone would open it on day two. |
| Marketing & distribution | 25 | Story, video, Skool posts, real users, feedback loop. Build-and-forget loses here. |
| Bonus | 5 | Incentivizes **NIM** usage (circulation, not a logo) |

Quote from the scoring page: *“Don’t just build. Ship something polished, tell the story of what you built, get real people to use it, and show up in the community.”*

FAQ is explicit: a focused, finished Mini App can beat a large unfinished one.

**Implied winning formula from Cycle I**

1. A product people return to (presence, daily ritual, or invite loop)
2. A hard problem treated seriously (cheat resistance, proof, persistence, IRL door)
3. Wallet as **identity / settlement / circulation**, not a bolted-on paywall
4. Public evidence: live stats, unseeded leaderboards, real wallets, a demo video
5. A builder story that is specific, not “I love crypto”

## Cycle I winners — study these, do not clone them

### 1st — Nimiq Space by @Harlski — $10,000

- Live: [nimiq.space](https://nimiq.space) · Repo: [harlski/nspace](https://github.com/harlski/nspace)
- Shared isometric multiplayer world. Wallet-signed presence. Persistent 500×500 pixel floor. Seasonal soccer. Buildable rooms, gates, teleporters. Live sync.
- **Why it won:** it is a place, not a form. “I’m here right now” is the product. Language translation across silos. 30-day production stats they published: 253 unique visitors, 141 first-time sign-ins, 101 Nimiq Pay uniques, **1,120h** active play, **202,630 NIM** paid out.
- Architecture: Vite/TS/Three.js client, Express + WebSocket server authority, payment-intent + payout sidecars. 259 commits. Serious live-service repo.
- Steal: persistence, presence, public metrics, community-directed roadmap, NIM that circulates.
- Do not steal: another 3D/isometric social sandbox. That slot is taken.

### 2nd — NimJump by @emrealt34 — $5,000

- Live: [nimjump.zetashare.com](https://nimjump.zetashare.com) · Repo: [nimjump/game](https://github.com/nimjump/game)
- Godot 4.7 endless climber. Tap or gyro. Daily/weekly boards, streaks, quests.
- **Why it won:** it solved a real web3 problem. Client has zero score authority. Server replays raw inputs. Offline play via **server-issued signed seed batches**. VS mode: same seed, both stake NIM, higher verified score takes the pot — invite link is the growth loop. IP cap of 2 paid wallets/day.
- They published weekly Skool stats (15 → 28 real users) and invited the council to break the anti-cheat.
- Steal: server authority, invite-to-compete, retention systems, honesty about remaining cheat vectors.
- Do not steal: another endless jumper, or a client-trusted “score = money” game.

### 3rd — NimQuest by @mystiquemide — $2,000

- Live: [nimquest.artistic-chip.workers.dev](https://nimquest.artistic-chip.workers.dev) · Repo: [mystiquemide/nimquest](https://github.com/mystiquemide/nimquest)
- Learn Nimiq → server-graded quiz (answer key never ships) → one-time wallet-bound 5-minute signature → D1 receipt → masked leaderboard. **No NIM moves.**
- **Why it won:** a tight, honest product. Wallet as proof, not a faucet. 25 automated tests of cheat attempts. Public curl-able leaderboard. In-app docs, privacy, architecture. Cloudflare Worker + D1. They wrote what it is *not*.
- Steal: server-side truth, attack table, live verifiable data, ruthless scope, storytelling.
- Do not steal: another “learn Nimiq / quiz-to-earn” app.

## Cycle I field, ranked

Ranks are a judgement of **idea + execution signal**, not official scores (those were not published per entry). Use this to calibrate: if an idea sits in the bottom two bands, do not build it unless the mechanic is genuinely new.

### Band 0 — Official starter list / already commodity

These appeared many times or are the official idea-list defaults. Fine as a weekend exercise. They will not win Cycle II.

| Pattern | Cycle I examples |
| --- | --- |
| Tip jar / paywall / “tip the creator” | TipWall, UnlockMedia |
| Invoice / request-a-payment | Nimiq Invoice Pay |
| Piggy bank / lock NIM | Piggy, Nimcapsule (gift lock) |
| Recurring / subscriptions | FLOWRIQ, NimSub |
| Stake-and-leaderboard | NimiqStake |
| Simple arcade / tap duel / prize pot | NIM Duel, NIMIQ-ARCADE |
| Prediction pool | Nimiq Pools |
| Generic AI pay-per-gen | nimga, OtherMeApp, Bardtale, NimAgent |
| Encrypted chat bolted to a wallet | SimplePGP |
| Voting for its own sake | Votum |

### Band 1 — Competent utilities, crowded

Real products, real pain, but Cycle I already has 3–6 of each. A Cycle II clone needs a 10× interaction insight or it dies on originality.

| Pattern | Cycle I examples | Why it’s crowded |
| --- | --- | --- |
| Split the bill / trip | Tab, PayShare, Roundtrip | Official category bait |
| ROSCA / ajo / tanda / rotating pot | Rota, Tanda, Kolo, Ajoo | Four entries, same West African savings primitive |
| Generic escrow / “protect the deal” | TrustPay, XcrowHub, PactPay, Pact | Trust theater without a specific scene |
| Bounty / microtask board | Pull, Ergon, NimBounty, Trove | Same “lock → evidence → release” loop |
| Creator storefront | Atelier | Gumroad-without-fees is an essay, not a wedge |
| Habit stake / check-in | Stakes, SteadyStreak, NimiFit, Pods | Commitment contracts are a genre now |
| Gift link / red packet | Kado, NimDrops | Viral, but already shipped |
| Collect / chip-in link | Collect | One-link pot is solved |

### Band 2 — Strong non-winners (study the *insight*, not the category)

These had a sharp observation. They did not take a trophy. That usually means polish, users, or “place-ness” was missing — not that the insight is dead.

| App | Insight worth keeping |
| --- | --- |
| **Nimble** | QR/links are stealable credentials. A 6-digit, 120s, single-use **locator** plus live dual-screen confirm is how people actually pay IRL. Feeless + Albatross finality is the missing BLIK ingredient. |
| **GatePass** | Screenshot QR tickets are forgeable. Rotating QR + NIM ticket + door scan + attendance badge is a complete IRL loop. |
| **Nimiq Radio** | One shared now. Everyone hears the same song. (Team-member entry — **not eligible**. The *idea* of a global simultaneous object is still fertile.) |
| **Tally** | Don’t split each bill. Net a group’s debts and settle the minimum transfers. Feeless NIM makes small nets worth doing. |
| **Stakes** | Don’t let a model referee your friends. Money is mechanical; truth is social. |
| **Kado** | First-to-tap gift packets in a group chat. Auto-refund remainder. A native share loop. |
| **Pull / Ergon** | Invert the marketplace: post money, not a job ad. Pre-define what evidence means. |
| **Sesión** | Nearby pickup session + NIM reservation so people show up. |
| **NimHunt** | Fund a spot on a map; someone has to physically go. (Geofaucet / WeNano homage. GPS spoofing is the unsolved part.) |
| **EverRelay** | Digital death/handover is a real problem. Their build is a checklist, not the mechanism. |
| **VeriLock** | Hash locally, multi-party wallet sign, optional on-chain anchor. File never leaves the device. |
| **Atelier** | 60-second storefront, wallet-to-wallet, under-3s settlement. Execution of a commodity idea. |

### Band 3 — Winners

Space (place + presence + persistence + users + NIM circulation) → NimJump (real game + uncheatable rewards + invite loop) → NimQuest (proof, not payment; server truth; finished artifact).

## What Cycle I taught us

**Council taste**

- They reward *worlds, rituals, and integrity*, not “Stripe but NIM.”
- Marketing is a full quarter of the score. Public users and a story beat a private masterpiece.
- Supporting NIM is not optional if you want the last 5 points and the bonus narrative.
- Scope that finishes beats a platform pitch.

**Nimiq-shaped advantages to lean on**

- Feeless NIM → micro-settlement, netting, live auctions, tiny stakes, many small transfers
- Fast finality (Albatross) → dual-screen live pay, door check-in, “paid” in seconds
- Message signing → proof, identity, receipts, without moving funds (NimQuest)
- Device identifier → anti-sybil / save slots without accounts
- In-app language → multilingual by default (Space’s actual wedge)
- Deeplinks → every invite can open *inside* Nimiq Pay

**Failure modes to refuse**

- Client-trusted scores, quizzes, or “I did the habit”
- Custodial pots with a “trust us” treasurer and no on-chain story
- Feature soup
- Seeded leaderboards / fake activity
- Gambling dressed as a game
- Building the official idea list
- Ignoring Skool / shipping in week 4 with no users

## Saturated vs still open

**Do not start here unless you have a new mechanic, not a new skin**

Bill split, ROSCA, generic escrow, tip jar, invoice, storefront, habit stake, gift packet, quiz-to-earn, endless jumper, 3D social sandbox, staking dashboard, AI image paywall.

**Still open (and closer to how winners actually won)**

- IRL payment *interaction* that is safer than QR (Nimble opened this; it did not close it)
- Shared simultaneous objects that are not a 3D world and not a radio stream
- Server-authoritative skill games in a **different genre**, with invite-to-wager
- Proof products that are not “learn Nimiq”
- Merchant/IRL loops where NIM has to move in public (map of real acceptors, receipts-as-warranty, door + refund economics)
- Presence products at human scale (a table of 8, a café shift, a busker window) rather than a whole planet
- Inheritance / dead-man / family handover as a *mechanism*, not a checklist
- Live commerce that only works because NIM is feeless (penny increments, 60s drops)

## Cycle II idea briefs

These are written to be buildable in four weeks by a small team, mobile-native, NIM-core, and distinct from Cycle I winners. Prefer one of these (or a tighter variant) over a new utility clone.

Each brief has a **kill test**: if you cannot pass it by week 2, pick another.

### A. Table Pay — dual-screen IRL settlement (high)

Customer opens a 90-second table code. Merchant types amount + note. Both phones show the same three-word scene + amount before anyone signs. Tx memo carries the session token; if the app dies, the backend reconciles on-chain. Offline-tolerant: the code is the locator, not the credential.

- Why it can place: Nimble proved the insight; Cycle I still has no merchant-grade dual-screen POS. This is the most “Nimiq Pay native” product in the set.
- NIM role: the payment *is* the product. Bonus points are free.
- Must not become: a QR page, an invoice generator, or a 6-digit clone with worse UX than Nimble.
- Kill test: a stranger can pay a stranger across a table, on two phones, in under 20 seconds, with a spoofed-code attempt failing closed.

### B. One Object — a single global artifact everyone shares (high)

One crossword, one daily mural-of-the-day, or one 15-minute live auction of a community-made file. Everyone in the world is looking at the **same** thing at the same second. Paying NIM buys a letter, a tile, a bid increment, or a “nudge.” Yesterday’s object is archived and shareable.

- Why it can place: Radio’s “same song, same moment” was the best social idea that could not win. Space won on persistence. Combine both without building a 3D engine.
- NIM role: micro-actions that only make sense if fees are zero.
- Must not become: a pixel canvas (Space already has 500×500) or a YouTube jukebox.
- Kill test: two phones in different countries show the identical state within 1s, and a paid action is visible to both without refresh.

### C. Versus Word — invite-duel skill game with server replay (high)

Not a jumper. A 90-second word / geography / calculation duel. Server issues the seed. Both players get the same board. Client sends inputs only. Server resimulates. Higher verified score takes the pot. Challenge link is the entire growth loop. Daily seed for a global board; VS for friends.

- Why it can place: NimJump’s architecture, different sport, much smaller art budget, still invite-viral.
- NIM role: circulates player-to-player, not paid out from a faucet.
- Must not become: trivia-with-a-random-pot (gambling line) or client-reported scores.
- Kill test: you can cheat the client in DevTools and the server still rejects the run. A VS invite is completable by a non-crypto friend.

### D. Door Stake — events that refund if the room is empty (high)

Host creates a night. Guests stake NIM to RSVP. Door uses a rotating QR (GatePass’s good idea). If fewer than N people check in by start+15, **everyone is refunded**. If the threshold hits, the host is paid from the pot and no-shows forfeit their stake to the people who came.

- Why it can place: GatePass sold tickets. This sells *assurance*. It is a new economic object, not a QR reskin.
- NIM role: escrow that actually changes whether people show up.
- Must not become: Eventbrite + logo, or a prize raffle.
- Kill test: a 6-person test meetup runs for real; no-shows lose, attendees can see the pot math, host cannot rug after check-in starts.

### E. Proof of Paid — reputation that is invalid without a tx (medium-high)

After any NIM payment, either party can attach a one-line signed receipt (“paid Maya for the chair, condition as described”). The review is rejected unless the backend can see the matching on-chain transfer. Public graph of wallets that have actually settled.

- Why it can place: every escrow/freelance app in Cycle I asked you to trust chat. This makes the payment the review.
- NIM role: no payment, no voice. Sybil reviews die.
- Must not become: Yelp with optional crypto, or a bounty board.
- Kill test: a review posted without a real tx is impossible; a real tx produces a public, masked, linkable receipt in one tap.

### F. Heartbeat — dead-man release without taking the seed (medium-high)

You designate a beneficiary wallet and a check-in cadence. Each check-in is a signed message. After N missed windows, a sealed packet (instructions, not the seed) and/or a pre-funded NIM purse is released. Optional witnesses must co-sign the release. App never custodians the recovery phrase.

- Why it can place: EverRelay asked the right question and shipped a quiz. The mechanism is still unbuilt. Nimiq users actually die/lose phones.
- NIM role: the purse is real; signing is the heartbeat.
- Must not become: a readiness checklist, or a product that stores seed words.
- Kill test: a test wallet misses N beats and the beneficiary can open the packet; a live user cannot extract someone else’s packet.

### G. Busker Window — live IRL performance radar (medium)

Performer opens a 30–90 minute window, drops a pin, starts a tip ticker. Nearby users see live windows on a map and send NIM + a 40-character note that **appears on the performer’s phone immediately**. Window closes, map marker dies. Optional rotating QR at the case so walk-ups don’t need the map.

- Why it can place: presence + payment + IRL, none of which NimHunt (static spots) or Kado (chat packets) cover. Extremely filmable for the marketing score.
- NIM role: live tips, feeless so $0.20 notes are rational.
- Must not become: a geofaucet, a directory of musicians, or a 24/7 map of nothing.
- Kill test: one real street set, three real tips, notes visible to the performer within 2s.

### H. Café Shift — 8 seats, 25 minutes, paid presence (medium)

Not a world. A single room with eight chairs. You pay a small NIM for a focus shift. You can see who else is in the room. Optional whisper. When the timer ends, you’re out. Daily prompt on the table. Intimate on purpose.

- Why it can place: Space already owns “planet.” This owns “I sat with you.” Cheaper to polish. Multilingual prompt is the Space lesson without the engine.
- NIM role: the chair costs NIM; that’s the cover, not a tip jar.
- Must not become: Discord with avatars, or a mini Space.
- Kill test: two strangers can sit a shift without an account beyond the wallet, and the room feels calm on a phone.

### I. Warranty Stub — IRL receipt that *is* the guarantee (medium)

Merchant POS: amount, item one-liner, warranty days. Customer pays. Both get a wallet-signed stub. Later, the customer opens the stub; merchant scans it; status flips to claimed/honored. The stub is the product.

- Why it can place: Nimiq’s merchant story is still “we can pay.” This is “we can stand behind a sale.” Pairs with Table Pay if you need a bigger surface.
- NIM role: the sale and the stub share one tx memo.
- Must not become: a general invoice app or an inventory system (Nimiq Bazar already did local POS inventory).
- Kill test: a real object changes hands, both phones show the same stub, a third party can verify it later from the tx.

### J. Last Bid — feeless live auction for real files (medium)

Seller posts one digital good. Auction runs 3–10 minutes. Bids are real NIM increments of any size (feeless is the point). Losing bids auto-refund. Winner’s payment releases the file key. English auction, not a raffle — keep it on the skill/agency side of the gambling rule.

- Why it can place: Atelier is a static shop. Feeless bidding is a Nimiq-only interaction.
- NIM role: many small bids, automatic refunds.
- Must not become: a casino, a prediction market, or Gumroad.
- Kill test: 5 live bidders, refunds are automatic, winner actually receives the file, legal review is comfortable it is not a game of chance.

## How to pick (do this before writing code)

Score each candidate 1–5 on:

1. Can a new user finish the loop in 60 seconds on a phone?
2. Does NIM *have* to be there, or is it a sticker?
3. Is there a reason to come back tomorrow or invite one friend?
4. Can we finish a trustworthy version in 4 weeks with the people we have?
5. Can we film a 45-second video that makes a non-crypto person nod?
6. Is the category still empty after Cycle I?

Ship the highest score. If two tie, pick the one you can test with real humans in week 1.

**Default recommendation if the user has no strong preference:** **A (Table Pay)** or **C (Versus Word)** if the team is product/UX-heavy vs game-engine-comfortable. **B (One Object)** if they can run a tiny realtime backend and want Space-adjacent presence without competing with Space. **D (Door Stake)** if they can host or attend one real meetup during the cycle.

## Agent working rules

- One Mini App. Do not scaffold a suite.
- Mobile WebView first. Check 390×844 before any desktop polish.
- Server is source of truth for money, scores, proofs, and presence.
- Prefer NIM transfers and NIM signatures over EVM unless USDT is the point.
- No gambling. If randomness decides the money, stop.
- No custodial seed storage. No secrets in the client.
- MIT, public repo, live HTTPS demo, demo video, ≤250 word submission blurb covering what / who / how Nimiq Pay is used.
- Show up on Skool weekly. Publish real (even small) usage numbers. Do not seed them.
- Week 3 is public. The app must already work; week 3 is for tightening, not inventing.
- Keep a builder story that is specific. Winners wrote from a bathroom, a forum, a cheat they hated — not from a category list.
- When in doubt, cut scope and finish the loop.

## Builder profile (answered)

| Question | Answer |
| --- | --- |
| Team | Solo |
| Audience | Cold start |
| Stack | Web or Godot/Unity — explore what the idea needs |
| Success metric | Place in Cycle II. Revenue is a side effect, not the target |
| Dates | Kickoff 24 Aug. Sip & Ship 26 Aug / 2 Sep / 9 Sep / 16 Sep. Close 19 Sep |
| Scaffolding | Not until an idea is chosen |

Still useful later, not blocking: second phone available? city for an IRL demo video? willing to keep a placed app live 12 months?

## Open questions — resolved or deferred

Idea is Versus Word. Follow [`docs/versus-word.md`](docs/versus-word.md). Run `npm test` after sim changes. Dev: `npm run dev` (API 8787, web 5173).

## Canonical links

- Competition: https://miniappscompetition.com
- Rules: https://miniappscompetition.com/rules
- Scoring: https://miniappscompetition.com/scoring
- FAQ: https://miniappscompetition.com/faq
- Examples: https://miniappscompetition.com/examples
- Cycle I showcase: https://miniappscompetition.com/submissions/cycle1
- Cycle I winner post: https://www.nimiq.com/blog/mini-apps-competition-cycle-1-winner-announcement/
- Framework: https://nimiq.dev/mini-apps
- Official ideas (avoid as-is): https://nimiq.dev/mini-apps/ideas
- Technical FAQ: https://nimiq.dev/mini-apps/faq
- SDK: https://www.npmjs.com/package/@nimiq/mini-app-sdk
- Skool: https://www.skool.com/miniappscompetition/about
- Winners: [nspace](https://github.com/harlski/nspace) · [nimjump/game](https://github.com/nimjump/game) · [nimquest](https://github.com/mystiquemide/nimquest)
