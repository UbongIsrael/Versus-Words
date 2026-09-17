# Versus Words

**Same letters. More words wins.**

Versus Words is a leisure word game for friends — and anyone who sits at an open table. You get the same letters, ninety seconds on the clock, and two ways to play: **Trace** (draw words on a grid) or **Anagrams** (make words from a scattered rack). It’s built for people who like English, like a bit of pressure, and like finding out who actually knows more words.

You can play for fun: practice any time, or take today’s board. You can also put NIM or USDT on the line. You both get the same letters. When the clock runs out, whoever found more takes the pot. In unique-words, a word you both found counts for nobody. In most-words, every word counts. Invite a friend with a code, or open a table and let a stranger sit.

A [Nimiq Pay](https://nimiq.dev/mini-apps) Mini App for Cycle II. Spec: [docs/versus-word.md](docs/versus-word.md).

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

Play in a phone-sized viewport. In Nimiq Pay: Custom URL → your live HTTPS host.

`npm run dev` uses `FAKE_CHAIN=1`. Live USDT pots: deploy [`contracts/src/VersusEscrow.sol`](contracts/src/VersusEscrow.sol), set `USDT_ESCROW` + `POLYGON_ORACLE_KEY`. Contract tests: `npm test --prefix contracts`.

Game rules: [docs/game-mechanics.md](docs/game-mechanics.md).
