# Token Arcade v0 — Metropolis

**The Internet Is Fun.** This repository is the curated arcade host for the Metropolis launch. It provides a playable guest path, a local competition test fixture, a game registry, Player Passport, admin Launch Console, raid and ranked infrastructure, and separately tested onchain contracts. The four launch games are external workstreams and are not copied or represented as playable here until their real cartridges arrive.

## Run locally

Requires Node.js 22.12 or later and npm.

```powershell
npm ci
Copy-Item .env.example .env
```

For a local, loopback-only demo of player and admin flows, set `LOCAL_DEMO_MODE=true` in `.env`. Then:

```powershell
npm run dev
```

Open `http://127.0.0.1:5173`. For a built app served by the API:

```powershell
npm run build
npm start
```

Open `http://127.0.0.1:8787`. The API uses ignored `apps/api/data/arcade.sqlite` for local persistence. `npm test` runs the SDK and API tests. Contract build, tests, and deployment instructions are in [contracts/README.md](contracts/README.md).

## What you can review now

1. Open **Take a tour** in the header for five separate, replayable walkthroughs: Arcade, Cabinets, Raids, Passport, and Launch Console.
2. Browse the arcade as Guest and play **Warmup Cabinet**, clearly labeled as an internal test cartridge.
3. With local demo mode, enter as a test player from Passport, play a Ranked Run, and see the verified result on the leaderboard and Passport.
4. Enter the free Warmup Test Raid to exercise fixed seed, attempt cap, standings, and Passport history.
5. Enter as test admin to register/configure a draft game and inspect publishing readiness. The four incoming launch titles cannot publish until their real adapters and verifiers pass review.
6. Inspect the contract tests for Minicoin deployment, explicit entry fee routing, and pre-funded NFT prize custody. These are local EVM tests, not live Monad transactions.

The Minicoin admin API can be exercised against an in-process Hardhat chain, with no Monad RPC, using:

```powershell
node --experimental-sqlite --experimental-strip-types apps/api/test/minicoin.local-chain.ts
```

The Launch Console only enables its Minicoin action when `GET /api/health` reports the factory write path ready. This requires `ENABLE_ONCHAIN_WRITES=true` plus the RPC, expected chain ID, factory address, owner private key, treasury, and initial-supply recipient in `.env`. A successful admin request submits a real owner transaction, verifies its confirmed factory event and mapping, then associates the token in the registry. This workspace has no live values configured. A confirmed transaction that was sent before an API crash can be recovered through the read-only `POST /api/admin/games/:id/minicoin/reconcile` endpoint with its transaction hash; it verifies the onchain event, token metadata, mapping, and configured community before storing an association. Do not send a second deployment to recover a pending transaction.

## What Metropolis still needs

- Reviewed source and cartridge adapters for Buy Bounce, Two Places, Coindle, and Skrumpey Slide. See [game integration queue](docs/GAME_INTEGRATION.md).
- Game-specific server verification for every competitive launch mode. The standalone Skrumpey prototype has seeded gameplay but no server-verifiable replay proof yet.
- Privy app ID/secret and allowlisted admin user ID for live accounts. The local demo identity is accepted only when explicitly enabled on loopback. For a live Passport, the API derives the embedded EVM arcade wallet from Privy's server-side user record after access-token verification.
- Monad RPC, deployment wallet, treasury address, verified contract deployments, Skrumpeys collection address, and a prize NFT deposit before any live Minicoin, paid entry, or reward flow can be claimed.
- Production database/hosting and security review before public release.

The architecture and release boundaries are in [architecture](docs/ARCHITECTURE.md). Game source, wallet logic, and contract custody remain separate by design. There is no Token Arcade protocol token in v0.
