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

Preserve an existing `.env` instead of copying over it. Open `http://127.0.0.1:5173`. The API listens on 8787; isolated game builds listen on 8788. Set `LOCAL_DEMO_MODE=true` for loopback-only player/creator/admin testing. Real account access uses the existing Privy configuration.

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

## Documentation

- [Integration audit, per-game results and remaining gaps](docs/GAME_INTEGRATION.md)
- [Architecture and authority](docs/ARCHITECTURE.md)
- [Build and submit another Cartridge](docs/CARTRIDGE_DEVELOPER.md)
- [Authoritative package index](docs/token-arcade-package/Token_Arcade_Documentation_Index.pdf)
- [Existing contract tooling](contracts/README.md)

Production release still needs separate HTTPS origins, immutable versioned game artifacts, durable database operation, live Privy configuration, and the separate protocol pass for any economy/rewards. Do not enable production local-demo identities.
