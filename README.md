# Versus Word

A Nimiq Pay Mini App for Cycle II: 90 seconds, one 4×4 grid, the server resimulates your traces. Wallet login and versus pots are next.

Spec: [docs/versus-word.md](docs/versus-word.md)

## Run

```bash
npm install
npm test
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:8787/health

Play in a phone-sized viewport. For Nimiq Pay later: same Wi-Fi, Custom URL → your machine.

## Now / next

Shipped in this scaffold: shared `sim/`, canvas tracer, free run, daily seed, server-side verify, unseeded leaderboard.

In: Nimiq Pay login. Versus: Challenge someone → pick 1 / 5 / 10 NIM → copy invite (`/?v=…`) → both stake → same 90s grid → unique words take the pot.

`npm run dev` uses `FAKE_CHAIN=1`. Live USDT pots: deploy [`contracts/src/VersusEscrow.sol`](contracts/src/VersusEscrow.sol), set `USDT_ESCROW` + `POLYGON_ORACLE_KEY`. Contract tests: `npm test --prefix contracts`. NIM HTLCs wait on Pay adding the methods.

Game rules / first-play notes: [docs/game-mechanics.md](docs/game-mechanics.md)
