# Versus Word

A Nimiq Pay Mini App for Cycle II: 90 seconds, one 4×4 grid, the server resimulates your traces. Wallet login and versus pots are next.

Spec: [docs/versus-word.md](docs/versus-word.md)

## Run

```bash
npm install
cp apps/api/.env.example apps/api/.env.local
cp apps/web/.env.example apps/web/.env.local
npm test
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:8787/health

Env templates: [apps/web/.env.example](apps/web/.env.example) and [apps/api/.env.example](apps/api/.env.example).

Production (split hosts):

- **Frontend (Vercel):** `VITE_API_URL=https://your-api.example.com` (build-time)
- **API (Cloud Run / Railway):** deploy from the **repo root**, not `apps/api`. `@versus/sim` is a local workspace, not an npm package.
  - Cloud Run: use the root `Dockerfile`. `PORT` is set by the platform (defaults to 8080 there).
  - Env: `CORS_ORIGINS=https://your-frontend.vercel.app`, `RUN_SECRET`, plus chain keys as needed.
  - Rooms live in memory plus `matches.json`. That file dies with the container on a Cloud Run rebuild. Set `MATCH_BUCKET` to a GCS bucket (same project, service account `roles/storage.objectAdmin`) so rooms come back after deploy. Keep `--max-instances=1`. `/health` reports `matches: gcs:bucket/matches.json` when it is on.

Play in a phone-sized viewport. For Nimiq Pay later: same Wi-Fi, Custom URL → your machine.

## Now / next

Shipped in this scaffold: shared `sim/`, canvas tracer, free run, daily seed, server-side verify, unseeded leaderboard.

In: Nimiq Pay login. Versus: Challenge someone → pick 1 / 5 / 10 NIM → copy invite (`/?v=…`) → both stake → same 90s grid → unique words take the pot.

`npm run dev` uses `FAKE_CHAIN=1`. Live USDT pots: deploy [`contracts/src/VersusEscrow.sol`](contracts/src/VersusEscrow.sol), set `USDT_ESCROW` + `POLYGON_ORACLE_KEY`. Contract tests: `npm test --prefix contracts`. NIM HTLCs wait on Pay adding the methods.

Game rules / first-play notes: [docs/game-mechanics.md](docs/game-mechanics.md)
