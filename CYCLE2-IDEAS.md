# Cycle II idea grades

Decision file for a **solo, cold-start** builder whose goal is **placing**, not monetizing.

**Selected: Versus Word.** Product spec: [`docs/versus-word.md`](docs/versus-word.md). Other briefs stay here as rejected alternatives.

Calendar used here: kickoff **24 Aug**, Sip & Ship **26 Aug / 2 Sep / 9 Sep / 16 Sep**, close **19 Sep**. That is **26 days**, with Week 3 public testing and a final week to tighten.

## Two questions that were easy to misread

### “What can you test in week 1?”

This was not “will people pay you.” It was: **can the core loop be proven on real devices in the first seven days**, or does the idea only work if a café, a meetup, or a street set cooperates?

| If you only have… | Ideas you can honestly prove |
| --- | --- |
| One phone + a laptop | Versus Word, One Object, Café Shift, Heartbeat, Last Bid |
| A second phone (yours or a friend’s) | All of the above, plus Table Pay, Proof of Paid, Warranty Stub (as a demo) |
| A real meetup or café you can visit | Door Stake, Table Pay filmed IRL, Warranty Stub as a real sale |
| A street / performer | Busker Window |

Council members will open the app on a phone. They will not fly to your city. IRL ideas can still win if the **in-app loop is complete** and the video shows one real-world use. They die if the product is empty without a venue.

### “IRL money vs ritual vs competitive loop”

This was a **product shape**, not “do you want to earn a living from the app.”

| Shape | Meaning | Cycle I analogue |
| --- | --- | --- |
| IRL money | Two people in physical space settle or prove something | Nimble, GatePass |
| Ritual / place | A reason to open it again because other people (or a heartbeat) are there | Nimiq Space, Radio |
| Competitive loop | A match, a seed, a rematch, an invite | NimJump |

You said winning is the goal. That means pick the shape that **scores**, not the shape that could become a company. For a solo cold start, the competitive loop is the safest path to users (every match is an invite). Ritual/place is how first place was won, but Space already owns the big version. IRL money is original and very “Nimiq Pay,” but a cold start has to manufacture the second person.

**Call for this builder:** explore **competitive loop first**, **ritual/place second**, IRL only if you have a second phone and want to bet on craft. Godot is worth it only for Versus Word. Everything else should be web.

---

## How the grades work

Each idea is scored **for you**, not in the abstract. 1 = weak for this profile, 5 = strong.

| Axis | What it measures |
| --- | --- |
| Council fit | Would this look like a winner under design / function / originality / marketing |
| Solo finish | Can one person ship a trustworthy v1 by 19 Sep |
| Cold-start users | Can strangers enter without your city, your merchants, or an audience |
| NIM necessity | Is NIM the product, or a sticker |
| Demo / video | Can a 45s clip make a non-crypto judge nod |
| Risk | Inverse: 5 = low chance of a broken loop, gambling flag, or empty room |

**Composite** is not an average. Cold-start + solo finish + council fit are weighted hardest, because those are how Cycle I was actually won.

---

## Scoreboard

| Rank | Idea | Shape | Stack | Composite /5 | One-line verdict |
| --- | --- | --- | --- | --- | --- |
| 1 | **C — Versus Word** | Competitive | Godot **or** web | **4.6** | Clearest path to a trophy as a solo unknown |
| 2 | **B — One Object** | Ritual / place | Web + realtime | **4.3** | Space’s lesson without competing with Space |
| 3 | **A — Table Pay** | IRL money | Web | **4.0** | Highest payment originality; marketing is the hard part |
| 4 | **F — Heartbeat** | Ritual | Web | **3.6** | Distinct and finishable; weaker “open it tomorrow” |
| 5 | **H — Café Shift** | Ritual / place | Web + realtime | **3.4** | Intimate presence; easy to feel thin next to Space |
| 6 | **D — Door Stake** | IRL money | Web | **3.3** | Sharp economics; needs a real event during the cycle |
| 7 | **J — Last Bid** | Competitive / commerce | Web + realtime | **3.1** | Feeless auctions are Nimiq-shaped; gambling line is real |
| 8 | **E — Proof of Paid** | IRL / social | Web | **2.9** | Beautiful idea; chicken-and-egg on a cold start |
| 9 | **I — Warranty Stub** | IRL money | Web | **2.6** | Needs a merchant scene you do not have |
| 10 | **G — Busker Window** | IRL money | Web | **2.4** | Filmable; empty map if you cannot stage a set |

If you want a single default: **build Versus Word.** If that genre bores you, **One Object** is the other winner-shaped bet. Table Pay is the pick if you would rather perfect a 20-second handshake than a game.

---

## C — Versus Word

**Composite 4.6 · recommended default**

A 90-second skill duel. The server issues the seed. Both players see the same board. The client sends inputs only. The server resimulates the match and is the only thing that may write a score or release a pot. Daily global seed for a public board. VS mode: both lock NIM, share a link, higher verified score takes the pot.

Genre must not be an endless jumper. Word, geography, mental math, or a tiny deterministic puzzler. One verb. Ninety seconds.

### Problem it solves

Web3 games pay the client for a number the client invented. NimJump already proved the council cares about that lie. Cycle II still has no **small, invite-native, anti-cheat duel** that a non-gamer can finish on a phone. A cold-start builder needs a loop that manufactures the second user. A challenge link is that loop.

### Who it is for

Anyone in Nimiq Pay who will tap a friend’s link. Judges who want to break a claim. People who will not install a 40 MB world.

### Core loop

1. Open the Mini App → wallet sign-in (message, not a payment).
2. Play today’s seed for free → server verifies → daily board.
3. Tap Challenge → both lock NIM → same seed → rematch link.
4. Server replays both input logs → winner’s address receives the pot.
5. Share the replay / rematch deeplink.

### Nimiq integration

| Hook | Role |
| --- | --- |
| `init()` + `listAccounts()` | Identity. Board rows are wallets, not emails. |
| `signMessage` | Session auth. Bind the player to the wallet before a run. |
| NIM transfer (lock) | Each VS player sends the stake to an escrow address the server watches. |
| NIM transfer (payout) | Server pays the verified winner. Circulation, not a faucet. Bonus points. |
| Tx memo / extra data | Session id so a killed app can still settle. |
| `requestDeviceIdentifier` | Cap rewards / pots per device. NimJump used IP; device id is the native primitive. |
| Deeplink | `nimiqpay://miniapp?url=…` is the entire growth motion. |
| Language | One string table. Free UX points. |

No EVM required. USDT is optional later and would slow you down.

### Why it can place

NimJump took second by treating integrity as the product and invites as marketing. You are not cloning the game. You are cloning the **scoring-shaped architecture** in a genre they have not awarded. Marketing score is structurally easier: every pot is a reason to ping Skool and X.

### Why it can lose

If the game is not fun in ten seconds, anti-cheat is trivia. If scores are client-trusted, you are Band 0. If VS is “highest random roll,” you are gambling and can be disqualified.

### Solo plan (26 days)

- Days 1–3: one board, one verb, deterministic sim in TypeScript (or Godot if you already think in it). Web is faster to ship inside a WebView.
- Days 4–10: server seed issue, input log, replay, reject-mismatch tests.
- Days 11–16: NIM lock / payout / deeplink. Playable VS.
- Days 17–20 (public week): daily board, streaks, device cap. Sip & Ship 2 and 3 are for getting people to challenge you.
- Days 21–26: Safari/WebView polish, video, attack table in the README the way NimQuest did.

### Kill test

Cheat the score in DevTools. Server rejects it. A friend who does not care about crypto can finish a VS match from a link.

### Grades

| Council | Solo | Cold-start | NIM | Demo | Risk | Composite |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | 4 | 5 | 5 | 5 | 4 | **4.6** |

Godot: use it only if the feel of the verb needs a game loop you cannot get on a canvas in a week. Otherwise web. Unity is the worst fit for a Mini App WebView.

---

## B — One Object

**Composite 4.3 · second pick**

There is one thing on earth inside this app. Today it is a crossword, a 12-hour sculpture, or a 15-minute live sale of a single file. Every open phone shows the **same** object at the **same** second. A NIM payment buys a letter, a cell, a bid increment, or a “nudge.” When the object ends, it is archived and the next one starts. Yesterday is a shareable artifact.

Pick **one** object type and do not add a second.

Recommended default object: **a global crossword** (or a 15×15 cooperative grid) whose clues are Nimiq / everyday, letters cost a tiny NIM amount, conflicts resolve server-side, completed words flash for everyone. Distinct from Space’s pixel floor (color tiles, no shared puzzle state, not timed).

### Problem it solves

Chat is a silo. Feeds are not simultaneous. Space solved “I’m here” with a world. Radio (ineligible) solved “we are hearing the same now.” Nobody shipped a **single shared artifact** that a phone user can alter in one tap and see land on someone else’s screen.

### Who it is for

The Nimiq Pay user who will not learn WASD. The council member who opens one URL and immediately sees other people.

### Core loop

1. Open → see today’s object already in progress (never an empty onboarding desert).
2. Tap a cell / action → confirm a small NIM payment → server applies it → everyone updates.
3. Optional: sign a message to “sit” at the object so presence dots appear.
4. Object completes or expires → archive image + tx list → next object.

### Nimiq integration

| Hook | Role |
| --- | --- |
| NIM transfer | Each mutation is a payment. Feeless is why a letter can cost dust. |
| Tx memo | Cell id + object id. Backend confirms on-chain before applying. |
| `signMessage` | Presence / “I was here” without paying. |
| Consensus / `getTransaction` on a backend | Never trust the client that it paid. |
| Deeplink | “We’re on 14-across” is a share. |
| Language | Clues / UI follow `window.nimiqPay.language`. |

### Why it can place

First place was a place. This is a place that is one screen. Originality is high. Marketing is the object itself — post the live grid every day. NIM circulation is obvious.

### Why it can lose

Empty grid at judging time. Websocket jank on a phone. Looks like a thinner pixel room. Scope creep into “platform for objects.”

### Solo plan

- Days 1–4: one grid, one server, two browsers in sync.
- Days 5–12: pay-to-write, on-chain confirm, conflict rules, archive.
- Days 13–16: presence dots, yesterday’s object, empty-state that still shows a live thing.
- Public week: you play it in Skool like a radio host. The object must never be idle because **you** are in it.

### Kill test

Two phones, two countries or two networks, same cell appears within a second of a confirmed tx. You can leave it open on a table and a stranger understands it without a caption.

### Grades

| Council | Solo | Cold-start | NIM | Demo | Risk | Composite |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | 4 | 4 | 5 | 5 | 3 | **4.3** |

Empty-room risk is the only reason it is not #1. You mitigate it by being the house DJ for four weeks.

---

## A — Table Pay

**Composite 4.0 · best IRL pick**

Two phones, one table, no QR that can be sticker-swapped. Payer opens a 90-second six-digit **locator** (not a credential). Merchant types amount + note + code. Both screens show the same generated three-word scene and the same amount. Payer approves in Nimiq Pay. Both watch the tx to inclusion. If the app dies, the backend reconciles from the memo.

This is Nimble’s insight taken to a merchant-grade handshake. You must be **clearly better** on spoof-resistance and dual-screen theater, or you are a clone.

### Problem it solves

QR codes, payment links, and addresses are stealable credentials. People still pay IRL by trusting a sticker. Crypto IRL still feels like “scan and pray.” Nimiq’s feeless finality is the first chain where a BLIK-style live confirm is not ridiculous.

### Who it is for

Friends splitting a table. A stall. Anyone who can say a number out loud. Judges with two devices.

### Core loop

1. Payer taps Receive-a-charge → six digits + countdown + scene words.
2. Payee taps Charge → amount, note, code.
3. Both see identical scene + amount + counterparty address (masked).
4. Payer signs the NIM payment. Both screens go paid → finalized.
5. Receipt is a signed stub either can reopen.

### Nimiq integration

| Hook | Role |
| --- | --- |
| NIM transfer | The handshake ends in a real payment. |
| Tx extra data | Session token for crash recovery. |
| `listAccounts` | Show who is paying / being paid before sign. |
| Backend `getTransaction` | App-death reconciliation. |
| Device id | Rate-limit code guessing. |
| Deeplink | “Pay me at the table” for remote demo. |

### Why it can place

Highest “this is what Mini Apps are for” story. Design/UX can go outstanding if the dual screen feels inevitable. Functionality is crisp and testable. NIM bonus is automatic.

### Why it can lose

Nimble already exists. Originality score suffers unless the spoof story and live theater are obviously new. Cold-start: council can test with two phones; **strangers will not discover a POS**. Marketing has to be a filmed café scene plus Skool, not “users.”

### Solo plan

You need a second phone by day 3. The whole product is two viewports.

- Days 1–7: pairing, scene words, live websocket state, no money.
- Days 8–14: NIM send + watch + memo reconcile + guess throttling.
- Days 15–19: failure cases (expired code, wrong amount reject, app kill).
- Days 20–26: film one real table, write the threat model like Nimble’s builder story.

### Kill test

A swapped / guessed code cannot move money. A stranger pays a stranger in under 20 seconds. Your README lists the attacks you blocked.

### Grades

| Council | Solo | Cold-start | NIM | Demo | Risk | Composite |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | 4 | 3 | 5 | 5 | 4 | **4.0** |

Pick this if you would rather obsess over a handshake than entertain people. Do not pick it if you cannot film two phones.

---

## F — Heartbeat

**Composite 3.6**

You name a beneficiary wallet and a check-in cadence. Each check-in is a Nimiq Pay signature, not a transfer. After N missed windows, a sealed packet (instructions, vault locations, “here is how to help” — **never the seed**) unlocks for the beneficiary. Optional: a pre-funded NIM purse the server releases on the same trigger. Optional witnesses must also sign the release.

EverRelay asked this question and shipped a checklist. You ship the mechanism.

### Problem it solves

People lose phones and die. Families cannot get at a life that now lives in wallets. Normal apps either custody the seed (unacceptable) or give you a PDF of advice (useless).

### Who it is for

Anyone who already holds NIM and has one person they trust. Quietly, every long-term holder.

### Core loop

1. Create a plan: beneficiary address, cadence, packet (client-encrypted to beneficiary pubkey if you can do it honestly; otherwise a server-held sealed blob with a clear threat model).
2. Optional: fund a purse.
3. Check in from Nimiq Pay before the window closes.
4. Miss N windows → beneficiary opens the app, proves control of their wallet, receives packet / purse.
5. You can cancel while alive by signing.

### Nimiq integration

| Hook | Role |
| --- | --- |
| `signMessage` | Heartbeat. Identity of beneficiary. Cancel. Witness. |
| NIM transfer | Optional purse. |
| Backend watch + time | The actual dead-man. Server is a clock, not a bank for the seed. |
| Device id | Soft reminder channel only. Never the auth factor. |

### Why it can place

Originality is high. Story is human. NimQuest showed that **signing without paying** can still be a third-place product if the integrity is obsessive. Docs, threat model, and “what we will never store” are the marketing.

### Why it can lose

Hard to show “users.” The happy path is a person not dying. Demo is a test wallet missing beats on fast-forward, which feels abstract. One custody mistake is a disqualification-level trust failure.

### Solo plan

Scope to: heartbeat + sealed text packet + optional purse. No witnesses in v1. Fast-forward admin on testnet for the video.

### Kill test

A test wallet misses N beats and the beneficiary opens the packet. A stranger cannot. The repo never sees a seed. You can explain the threat model in six sentences.

### Grades

| Council | Solo | Cold-start | NIM | Demo | Risk | Composite |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | 4 | 2 | 3 | 3 | 3 | **3.6** |

NIM necessity is only a 3 unless the purse is on by default — signing-only can still qualify (NimQuest) but you want the 5-point bonus.

---

## H — Café Shift

**Composite 3.4**

One room. Eight chairs. You pay a small NIM for a 25-minute focus shift. You see who else is sitting. A daily prompt sits on the table. Optional whisper. Timer ends, you leave. No map, no building, no soccer.

### Problem it solves

Discord does not feel like sitting together. Space is a planet. Most people want a table for half an hour.

### Who it is for

Builders on Sip & Ship weeks. Anyone who will pay a cover to not be alone while they work.

### Core loop

Pay → sit → see 0–7 others → prompt / whisper → time’s up.

### Nimiq integration

NIM as cover charge. `signMessage` for seat identity. Presence over websocket. Language for the prompt. Device id to stop one person buying eight chairs.

### Why it can place

Presence won Cycle I. A finished intimate room can feel more designed than a half-world.

### Why it can lose

Empty café is a sad screenshot. Council compares you to Space and writes “smaller.” Cover charge without a scene is a paywall.

### Kill test

Two strangers sit a shift with only a wallet. The room feels calm on a 390px screen. You personally occupy a chair for most of the public week.

### Grades

| Council | Solo | Cold-start | NIM | Demo | Risk | Composite |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 4 | 3 | 4 | 3 | 3 | **3.4** |

Only take this if the *feeling* of a quiet room is what you want to make, and you will be the host every day.

---

## D — Door Stake

**Composite 3.3**

Host posts a night. Guests lock NIM to RSVP. Door is a rotating QR. If fewer than N people check in by start+15, **everyone is refunded**. If the threshold hits, the host is paid and no-shows forfeit to the people who came.

GatePass sold tickets. This sells assurance.

### Problem it solves

IRL events die from no-shows, or never get posted because the host eats the room. Ticket apps do not refund a dead night. Crypto events still run on screenshot QRs.

### Who it is for

Meetup hosts in the Nimiq / Mini Apps community. You, if you will actually throw one night before 19 Sep.

### Core loop

Create → guests stake → rotating QR at the door → threshold math → payouts / refunds automatically.

### Nimiq integration

NIM escrow per RSVP. Rotating QR is an HMAC of `eventId + time window + server secret`, verified at scan. Check-in is a scan + optional guest signature. Payouts from the watched escrow. Memos bind tickets to events.

### Why it can place

New economic object. Full IRL loop. Filmable. NIM has to move.

### Why it can lose

Without a real event, it is a state machine in a costume. You are solo and cold-start: manufacturing attendees is a second product. GatePass already owns “NIM ticket + rotating QR,” so the **refund threshold** must be the headline or you look derivative.

### Kill test

A 6-person night runs. No-shows lose. Attendees can see the math. Host cannot pull funds after check-in starts.

### Grades

| Council | Solo | Cold-start | NIM | Demo | Risk | Composite |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | 3 | 2 | 5 | 4 | 2 | **3.3** |

Do this only if you will host or hijack a Sip & Ship / local meetup as the live proof.

---

## J — Last Bid

**Composite 3.1**

One digital file. 3–10 minutes. Bids are real NIM of any size. Losing bids refund automatically. Winner’s payment releases the file key. English auction: people choose amounts. Keep it off raffles, coin flips, and “mystery boxes.”

### Problem it solves

Static storefronts (Atelier) do not need feeless rails. Rapid small increments do. Today that interaction does not exist in Nimiq Pay.

### Who it is for

Someone with one file people might want (a pack, a track, a zine). Spectators who like a clock.

### Nimiq integration

Each bid is a NIM tx the server confirms before the board updates. Refunds are real send-backs. Winner tx memo unlocks a server-held encrypted blob. Websocket for the clock.

### Why it can place

Feeless micro-bids are a Nimiq-only demo. Live clock is good video.

### Why it can lose

Rules ban games of chance. An auction of a real good should be fine; a poorly worded “pot” will not be. Empty auction is embarrassing. File delivery is a trust hole if sloppy.

### Kill test

Five live bidders, automatic refunds, winner actually gets the file, you can defend it as a sale not a bet.

### Grades

| Council | Solo | Cold-start | NIM | Demo | Risk | Composite |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 3 | 3 | 5 | 4 | 2 | **3.1** |

---

## E — Proof of Paid

**Composite 2.9**

A one-line public receipt is allowed only if the backend can see the matching on-chain NIM transfer between those two wallets. No payment, no voice. The graph is “who has actually settled,” not Yelp.

### Problem it solves

Every Cycle I escrow and freelance app asked you to trust chat. Reviews without a tx are sybil food.

### Who it is for

People already paying each other in NIM. That set is small on day one of a cold start.

### Nimiq integration

Watch or require a tx hash. Verify sender, recipient, amount, memo. `signMessage` to attach the one-liner. Public masked graph. Device id is not identity — the wallet is.

### Why it can place

Conceptually clean. Integrity story is NimQuest-adjacent.

### Why it can lose

No payments → empty product. You cannot seed it. Marketing has nothing to film except two of your own wallets.

### Kill test

A review without a real tx is impossible. A real tx produces a linkable receipt in one tap.

### Grades

| Council | Solo | Cold-start | NIM | Demo | Risk | Composite |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 4 | 1 | 5 | 2 | 3 | **2.9** |

Better as a module inside Table Pay than as the whole Mini App.

---

## I — Warranty Stub

**Composite 2.6**

Merchant types amount, item line, warranty days. Customer pays. Both hold a wallet-signed stub tied to the tx. Months later the stub is scanned and marked honored.

### Problem it solves

IRL crypto sales have no after. A receipt that *is* the guarantee is the merchant story Nimiq does not have.

### Why it is graded down for you

You have no merchant. The council cannot honor a warranty in September. It reads as an invoice app unless a real object changes hands on camera.

### Nimiq integration

One NIM payment, memo = stub id, both parties sign the stub payload, later merchant signs “honored.”

### Grades

| Council | Solo | Cold-start | NIM | Demo | Risk | Composite |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 3 | 1 | 5 | 3 | 3 | **2.6** |

---

## G — Busker Window

**Composite 2.4**

Performer opens a 30–90 minute live window, drops a pin, tips and 40-character notes hit their phone as a ticker. Marker dies when the window ends.

### Problem it solves

Static geofaucets (NimHunt) are not a show. Live performance + feeless notes is.

### Why it is graded down for you

The map is empty without a set. Solo cold start cannot keep a city alive. GPS spoofing will get asked. Beautiful video if you can stage one night; a graveyard if you cannot.

### Nimiq integration

NIM tips with memo = window id + note. Presence is time-bounded. Optional rotating QR at the case.

### Grades

| Council | Solo | Cold-start | NIM | Demo | Risk | Composite |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 3 | 1 | 5 | 4 | 2 | **2.4** |

---

## What I would not add to this list

Anything already in Cycle I Band 0–1: splitters, ROSCAs, tip jars, invoices, storefronts, habit stakes, gift packets, quiz-to-earn, jumpers, 3D worlds. A “better Atelier” will not place.

## Decision rule

1. If you want the highest expected place as a solo unknown: **Versus Word**.
2. If you want to make a *place* and you will inhabit it daily: **One Object**.
3. If you have two phones and care more about a perfect handshake than entertainment: **Table Pay**.
4. If none of those three excite you, stop and say so — do not pick Heartbeat/Café/Door as a compromise. Compromises do not win 26-day cycles.

When you name one, the next step is a one-page scope (must-ship / must-not-ship / week-by-week), still without a repo scaffold until you say go.
