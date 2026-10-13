# Token Arcade v0 — Metropolis

The Internet Is Fun. Four imported games run as reviewed Cartridges, discovered through the published Game Registry. Guest Free Play requires no wallet or account. Token Arcade owns identity, sessions, cabinet leaderboards, raids, publication and optional economies.

## Run locally

Requires Node.js 22.12+ and npm.

```powershell
npm ci
npm run setup:cartridges
Copy-Item .env.example .env
npm run build:cartridges
npm run dev
```

Preserve an existing `.env` instead of copying over it. Open `http://127.0.0.1:5173`. The API listens on 8787; isolated game builds listen on 8788. For real accounts, set `VITE_PRIVY_APP_ID` and matching `PRIVY_APP_ID`, plus the server-only `PRIVY_APP_SECRET`, from one Privy app. Allow the arcade origin in that app's dashboard. After Privy sign-in, the first authenticated Passport request creates a user-owned Ethereum arcade wallet through Privy's server API if one does not already exist. Keep the secret out of all `VITE_` variables and browser configuration. Set `LOCAL_DEMO_MODE=true` only for loopback developer testing; demo identities are disabled when `NODE_ENV=production`.

```powershell
npm test
npm run build
npm start
```

The built app is served at `http://127.0.0.1:8787`. Both dev/start commands launch the separate Cartridge server. Local state lives in ignored `apps/api/data/arcade.sqlite`. Coindle's independent React 19 dependencies are installed in its source folder; generated `arcade-dist` is ignored and built by `npm run build`.

## Cabinets

| Cabinet | Source / Skeleton | Association | Economy |
| --- | --- | --- | --- |
| eMONAD cabinet | Buy Bounce | Founder-supplied eMONAD reference | Pending protocol verification |
| Two Places at Once | Two Places at Once | Skrumpeys ERC-721 | Pending |
| Coindle | Coindle | COIN / RWA concept | Coming soon |
| Skip to 10K | Skip to 10K | ETH / WETH concept | Pending |

The eMONAD title is configurable pending final founder naming. Buy Bounce is internal source provenance, not another public cabinet. Two Places, Coindle and Skip retain their original presentation/gameplay. Warmup remains an automated test fixture. Skrumpey Slide is deferred.

Coindle plays using its non-price clues without a data key. Configure `PYTH_API_KEY` for its existing Pyth Pro price clues; missing data is visibly unavailable. No fake market data or substitute Community Asset is supplied.

## Creator publication

Open **Launch Console** (`/launch`): submit a versioned build → admin records technical review and approves → submitting developer deploys → Registry publishes the cabinet. Approval alone does not make it public. New Free Play iframe Cartridges need no homepage change or frontend adapter registration. Competitive modes need an installed game-specific verifier.

Admin cabinet configuration and free raids are at `/admin-tools`. Existing contract tooling is retained but the full Economy v0.2.2 deployment pipeline is a separate protocol workstream. No chain transactions or economic deployments were made during this integration.

## Founder token rehearsal (local only)

This repeats the demo sequence with **your real Privy sign-in**, a local experimental fixed-supply token association for eMONAD, and a verified Passport Play run. It does **not** deploy the Economy v0.2.2 WMON pool, hook, liquidity, vault, or strategies. The local Hardhat chain disappears when the command stops.

Stop the ordinary `npm run dev` preview first; the rehearsal uses the same loopback app ports. Keep the existing `.env` with the working Privy app ID and server secret. From the checkout that contains your Passport database:

```powershell
npm ci --prefix contracts
npm run build:cartridges
npm run rehearse:minicoin
```

Set `REHEARSAL_ADMIN_PRIVY_ID` to the intended founder's exact `did:privy:` user ID before starting the runner, or use an existing `ADMIN_PRIVY_IDS` allowlist. Verify that account first: the only Privy identity in a Passport database can still be a burner test account. The runner never chooses an account automatically or grants every signed-in player curator access. It disables the built-in local test admin for this rehearsal, so curator actions require an allowlisted Privy account.

To find that ID, sign in with the intended founder account in the ordinary local preview, open `/demo`, and expand **Founder account setup** in Step 01. The ID is shown only when that signed-in account still needs curator access. Copy the Privy account ID, stop the ordinary preview, then set `$env:REHEARSAL_ADMIN_PRIVY_ID = 'did:privy:...'` in the PowerShell session that runs the rehearsal command. Use the founder account ID, never the burner test account or the unrelated Passport player ID. The ID is an account identifier, not a wallet key.

The runner checks that ports 5173, 8787 and 8788 are free, starts a fresh Hardhat chain on `127.0.0.1`, deploys and verifies the legacy factory with Hardhat's public dev account, then starts the API, web and Cartridge servers. It makes a consistent, read-only snapshot of the normal SQLite database into an ignored `apps/api/data/minicoin-rehearsals/` file. All rehearsal token and score writes go to that snapshot; the normal `arcade.sqlite` is untouched. The runner overrides any configured Monad RPC and deployer key for its child API with local chain 31337 and the public Hardhat dev key.

Open `http://127.0.0.1:5173/demo`. Sign in with Privy, open the eMONAD rehearsal form, record the experimental token, play eMONAD in Passport Play, and show the accepted score in Passport and the cabinet board. The form and demo page label the token-only boundary. Press Ctrl+C to stop the rehearsal. A new run starts a new chain and database snapshot.

Suggested live order: play the already-published eMONAD Cabinet as a guest in Free Play → sign in with the allowlisted founder/curator Privy account → record the experimental local token association → play the same Cabinet in Passport Play → show its verified score and association record. A burner player account can demonstrate Passport Play before the founder signs in, but it cannot perform curator actions. If showing the separate new-game publication lifecycle, the creator submits a real versioned game build, the curator validates and approves it, and that same creator deploys the Cabinet. The curator may record a MiniCoin association only after the Cabinet is published; submitting a game build is not submitting a MiniCoin.

## Documentation

- [Integration audit, per-game results and remaining gaps](docs/GAME_INTEGRATION.md)
- [Architecture and authority](docs/ARCHITECTURE.md)
- [Build and submit another Cartridge](docs/CARTRIDGE_DEVELOPER.md)
- [Authoritative package index](docs/token-arcade-package/Token_Arcade_Documentation_Index.pdf)
- [Existing contract tooling](contracts/README.md)

Production release still needs separate HTTPS origins, immutable versioned game artifacts, durable database operation, live Privy configuration, and the separate protocol pass for any economy/rewards. Do not enable production local-demo identities.
