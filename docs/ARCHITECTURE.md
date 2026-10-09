# Token Arcade v0 — Metropolis architecture

This is the integration workspace for the curated Token Arcade host. The four launch games are being built in other workspaces. Their source stays independent; each enters the arcade through a reviewed cartridge adapter and manifest. The sibling `Projects/Token-Arcade/Skrumpey-Slide` folder is a standalone prototype, not this platform repository.

## Product boundary

The browser renders the arcade, hosts a cartridge, and collects player input. The API owns player identity, registry state, ranked sessions, raid attempts, leaderboards, and result acceptance. Contracts own funds and NFT custody when deployed. A cartridge has no knowledge of Privy, wallets, Monad, payments, or raids beyond the run configuration it receives.

```
React arcade ── cartridge host ── reviewed game adapter
      │
      └── API ── SQLite (local demo) ── settlement adapter ── Monad contracts
              └── Privy token verification
```

The local SQLite store makes the demo durable across server restarts. Production hosting must provide durable storage and HTTPS. No browser-supplied score is accepted as a verified result without a game-specific verifier. This is deliberately a hard boundary: an unintegrated game can appear in the registry, but cannot enable Ranked Run or Community Raid until its verifier is registered.

## Modules

- `apps/web`: responsive arcade, game detail/player, raid lobby, Passport, and allowlisted Launch Console.
- `apps/api`: same-origin JSON API, Privy authentication, registry, run sessions, verification, raids, and Passport projection.
- `packages/sdk`: cartridge lifecycle, manifest, objective, result and verification contracts shared with game adapters.
- `contracts`: small onchain Minicoin and prize/entry contracts with deployment configuration kept outside game code.

## Identity and modes

- Guest: browse and Free Play without login; local results have no claim of verification.
- Player: Privy access token identifies the account; the API creates/loads a Player Passport. Privy embedded wallet is the arcade wallet. Ownership wallets are linked separately by signed association and never transfer assets for eligibility.
- Admin: allowlisted Privy user ID, checked on every mutation by the API. The console cannot grant its own role.
- Free Play: a cartridge can run without a server session.
- Ranked Run and Community Raid: require account, server-issued run ID/seed/rules, a compatible verifier, and one-time result acceptance. The reviewed adapter can set a competitive run timeout from 30 seconds to 24 hours; the default is two minutes. A raid also enforces start/end and attempt cap server-side.

## Cartridge contract

The host passes immutable `GameRunConfig` (`runId`, `mode`, `objective`, optional `raidId`/`seed`, rules). Rule values are a bounded set of server-issued strings, safe integers, or booleans; the game verifier must check their game-specific meaning. A cartridge supports `mount`, `start`, `pause`, `resume`, `restart`, `destroy`, and `onRunComplete`. It emits a `GameRunResult` with metrics, timestamps, and game version. The adapter can additionally produce a replay/input proof. The API's `GameVerifier` validates game-specific proof against the issued session; the browser's metric is only a claim.

Manifest validation checks unique ID, version, modes/objectives, artwork, and an approved adapter key. Publishing requires an installed adapter and Free Play smoke test. Competitive modes additionally require a registered verifier. This permits the curator to prepare an incoming game without pretending it is playable before its source arrives.

## API contract

All mutations use JSON. Player requests send `Authorization: Bearer <Privy access token>`. Local demo identity is an explicit development-only mode.

| Route | Purpose |
| --- | --- |
| `GET /api/health` | API and configuration readiness |
| `GET /api/games`, `GET /api/games/:id` | Published registry and detail |
| `GET /api/raids`, `GET /api/raids/:id` | Public raid state and standings |
| `GET /api/leaderboards/:gameId` | Accepted ranked results for the current version, primary objective, and rule set |
| `GET /api/me`, `PATCH /api/me` | Passport |
| `POST /api/runs` | Issue ranked/raid session and seed |
| `POST /api/runs/:id/complete` | Verify and consume session, update standings/Passport |
| `POST /api/admin/games` | Register draft manifest/config |
| `PATCH /api/admin/games/:id` | Configure draft or pause a game |
| `POST /api/admin/games/:id/publish` | Validate then publish |
| `POST /api/admin/games/:id/minicoin` | Admin-only, explicitly enabled factory deployment and verified association |
| `POST /api/admin/games/:id/minicoin/reconcile` | Verify a prior confirmed transaction and recover its registry association without sending a transaction |
| `POST /api/admin/raids` | Create a raid and explicit fee/reward definition |

## Onchain boundary

`SettlementAdapter` is the platform-facing interface for entry collection, Minicoin deployment/association, prize deposit, and settlement. The Minicoin path uses the tested `MinicoinFactory`: it requires an explicit write flag, expected chain ID, owner key, factory, treasury, and supply recipient; confirms the factory event and mapping before saving the association. Community Asset and Strategy are required before deployment when applicable, and are frozen afterward because the token records them immutably. Its read-only reconcile route verifies an already confirmed transaction if the API stopped after submitting it but before saving the game. Paid entry, prize custody, and settlement API paths remain blocked pending chain integration and funded assets. The UI must never report a simulated operation as an onchain deployment, payment, escrow, or reward.

For v0, Community Asset and Community Strategy are separate records. A Skrumpeys ERC-721 collection can be attached to Skrumpey Slide; its Minicoin remains optional. Fee splits are per raid in basis points and must total 10,000. Token Arcade Treasury is a configured address, not a token. There is no `$TA`.

## External integration checklist

For each incoming game: obtain source and license/art notes; wrap or implement cartridge lifecycle; map its native metrics to the shared result schema; prove clean mount/destroy and mobile controls; add deterministic seed/replay support for competitive modes; register a server verifier; run a Free Play smoke test; then publish. A game lacking verification can still offer Free Play. This avoids rebuilding games inside the platform.

## Current demo limits

The codebase can exercise the host using an internal test cartridge. It is labeled as a test fixture and is not one of the four launch games. Actual launch game play, live Privy sign-in, Monad transactions, and NFT custody require their respective sources/configuration before the Metropolis acceptance script can pass.
