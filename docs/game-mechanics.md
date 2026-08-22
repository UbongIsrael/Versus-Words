# Game mechanics — answers from first play

Captured after the 15 Aug phone session. This is the place to argue rules **before** changing `packages/sim`. The tracer itself is accepted; do not reopen it here unless a rule change forces it.

## 1. Why one tile said `Qu`

**Yes. By design.** It is not a bug and not two letters crammed into one cell by accident.

Classic 4×4 Boggle treats **Q as the digraph Qu**. One die face is `Qu`. You tap that **one tile once**. The word gains two letters (`Q` + `U`). You do not need a separate `U` tile next to it.

Example: tiles `Qu` → `I` → `Z` spell **QUIZ**. Path length is 3 cells. Word length for scoring is 4.

That is why a 3-cell path can be worth a 4-letter score, and why `Qu` looks “fat” on the tile.

### Why we kept it

- Same dice as physical Boggle, so letter frequency is playable (raw `Q` with no `U` is almost dead).
- ENABLE contains `QUIZ`, `QUIT`, `EQUAL`, etc. A lone `Q` tile would be a trap on a 90-second phone grid.

### Open for later (do not change until we decide)

| Option | Effect |
| --- | --- |
| **Keep Qu** (current) | Familiar, fairer Q, slightly uglier tile |
| Plain `Q` | Cleaner tile, fewer real words, more “dead” boards |
| `Q` that still counts as `QU` but renders as `Q` | Looks normal, still a surprise when the word becomes QU… |
| No Q at all | Simplest visual, less “classic” |

If we change this, both client render and `packages/sim` must stay in lockstep. Daily seeds already rolled with Qu-as-one-face; a mid-day rule change would invalidate today’s board.

---

## 2. Why a repeat still flashed `+1`

**UX bug, not the scoring rule.**

The **server** already counts each word once. A second trace of `CAT` is stored in the input log (timestamps stay monotonic) and then **deduped** in `verifyRun`. It does not add points.

The **client** was sloppy: any dictionary word on a valid path showed `WORD +N`, even if that word was already in the chip list.

What it should do next time we touch play-feel:

| Path result | Feedback |
| --- | --- |
| New valid word | `CAT +1` (or +2 / +3 / …) |
| Same word again | `CAT · already found` (no plus) |
| In the dictionary but not on this path | should be impossible if we only commit legal paths |
| Not a word | `BLORP` in the error color, no plus |
| Too short / let go on one tile | stay quiet |

Score on the play screen is still unofficial. The number on the result screen is the only one that counts.

---

## 3. Scoring, as implemented

Clock: **90 seconds**, started when the server issues the run, not when you first touch the grid.

Minimum word: **3 letters** after expanding `Qu`.

Path rules: 8-neighbor (diagonals count). A word may not reuse a cell. Backtracking to the previous cell undoes the last letter (standard Boggle).

### Daily and free run

Classic Boggle table, **unique words in that run only**:

| Word length | Points |
| --- | --- |
| 3 | 1 |
| 4 | 1 |
| 5 | 2 |
| 6 | 3 |
| 7 | 5 |
| 8 or more | 11 |

`Qu` counts as two letters toward this table.

Duplicates in one run: **0 extra**. Invalid path, non-word, or anything after 90.000s: dropped, run still valid.

The client may not submit a score. If it does, the API ignores it and resimulates the traces.

Daily: one **scoring** run per player per UTC day. Same grid for everyone that day (HMAC of `daily:YYYY-MM-DD`). Leaderboard is that verified score, not the live chip count.

Free run: new random seed every time, no board.

### Versus

Host picks the mode when the room is created.

- **Unique words (default):** same Boggle table, then words both found become **0**. Highest unique score takes the pot.
- **Most words:** whoever has more accepted words wins. Shared words still count. Length does not matter.

Tie → both stakes return. Invite is a six-letter code and a `/?c=` link. Stake is a custom NIM or USDT amount, not a fixed chip.

See [`docs/escrow.md`](escrow.md) for why the pot is not a custom NIM smart contract (yet).

### What is *not* scored

- Speed inside the 90s (finding CAT at 1s vs 89s is the same point)
- Fancy words beyond the length table (no rarity bonus)
- Using `Qu` (no extra)
- Number of traces, only unique accepted words

### Tiny example

Grid has `C A T` in a line. You trace CAT twice, then COAT.

- Live chips: CAT, COAT
- Official: CAT 1 + COAT 1 = **2**
- Second CAT: already found, should not look like +1

---

## 4. Still open (work these here before code)

Use this list when we come back to mechanics. Do not silently change `sim/` without updating this file.

- Keep `Qu`, restyle it, or drop Q?
- Already-found copy: “already found” vs a shake vs nothing?
- Show a live unofficial total during the run, or only chips?
- Daily: show the full grid on home before play, or keep it hidden?
- Dictionary: ENABLE is huge (obscure 3-letter words score). Tighten to a common-word list?
- Versus: unique-word scoring confirmed, or total-points-then-compare (NimJump style)?

## 5. Status

Tracer: accepted.  
Rules above: current truth.  
Next build work: wallet login (Nimiq Pay), then versus pots — not a rules pass unless you mark an item in §4.
