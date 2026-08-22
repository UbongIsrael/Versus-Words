# Pots and contracts — what Nimiq actually has

You want the pot sitting in something nobody (including us) can drain. That instinct is right. A builder-controlled escrow wallet is a rug surface. Here is what the protocol actually gives us.

## Nimiq L1 is not Solidity

NIM does **not** have general-purpose smart contracts. You cannot deploy an “escrow.sol” that says “if unique score A > B, pay A.”

What exists on L1 are **built-in account types** (whitepaper + RPC):

| Type | What it does | Good for a versus pot? |
| --- | --- | --- |
| Basic account | Normal wallet | Only if someone holds the key. That is us. Bad. |
| Vesting contract | Unlock NIM on a schedule | Time lock, not a match result |
| **HTLC** (Hashed Time Locked Contract) | Sender reclaims after a block height. Recipient claims only with a preimage of a hash. | Closest native escrow |
| Staking contract | Validators / stake | Unrelated |

USDT in Nimiq Pay is **USDT on Polygon**, via `window.ethereum`. That *is* EVM. A real custom escrow contract is possible there, not on NIM.

## How an HTLC pot would work (the good design)

Each player locks their own stake into a protocol HTLC:

- **sender** = the player (only they can timeout-refund)
- **recipient** = the opponent (only they can claim, and only with secret `s`)
- **hash** = `H(s)`, same `s` for both locks
- **timeout** = match expiry
- Server holds `s` but **never holds the NIM**

After the server verifies both traces:

- Alice wins → server gives `s` to Alice → Alice claims Bob’s HTLC. Her own lock times out back to her. She has the pot.
- Tie / both miss the clock → server never reveals `s` → both timeout-refund.
- Only one funded → that player timeout-refunds.

Properties:

- We cannot send the pot to our own address. There is no key on a contract we control.
- We *can* still cheat by handing `s` to the wrong player. That is “oracle honesty,” not custody.
- Players can always get their own money back after timeout if we disappear.

That is the honest Nimiq-shaped escrow. It is **not** “a smart contract we deploy.”

## Why we cannot ship HTLC pots inside Pay today

The Mini App SDK (`@nimiq/mini-app-sdk`) can:

- `listAccounts`, `sign`
- `sendBasicTransaction` / `sendBasicTransactionWithData`
- staking helpers

It **cannot** create or redeem an HTLC. No method, no confirmation UI. Creating one needs `@nimiq/core` `TransactionBuilder` or a node wallet — neither of which Pay exposes to a Mini App.

So: the contract type exists on-chain; the host app we have to ship inside cannot open it yet.

## What we shipped

**USDT / Polygon — `contracts/VersusEscrow.sol`**

- Players `lock` their own USDT into the contract. First lock opens the pot; second lock must match the amount.
- After the server verifies the game, it **signs** `(escrow, matchId, winner)`. It never holds USDT.
- A player submits that signature via `settle`. The contract will only pay player A, player B, or refund both.
- After 24h, `timeoutRefund` sends deposits back with no signature.
- Deploy, then set `USDT_ESCROW` + `POLYGON_ORACLE_KEY` (the key’s address must be the constructor oracle).

**NIM — still waiting on Pay**

The Mini App SDK still has no `createHtlc` / `redeemHtlc`. Local NIM pots stay on `FAKE_CHAIN` or a watched memo. Do not add a builder hot wallet and call it a contract.

## Bottom line

Wanting a contract nobody can rug is correct. On NIM that contract is an HTLC, and Pay cannot open one yet. On USDT the tiny Polygon escrow is the real thing: we are an oracle, not a custodian.
