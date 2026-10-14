## Current Codex release update

- Production deploys from `main`; Grok commit `c4865e0` is included.
- Actual Monad testnet deployment and raid claim are documented in `docs/TESTNET_DEPLOYMENT.md` and `contracts/deployments/monad-testnet.json`.
- Creator intake accepts an HTTPS repository/source download link and a preparation choice. Source links remain private to the creator and admins. This does not fetch or execute source automatically.
- Admin Configure cartridge connects a prepared build and verifier. Technical validation and approval are required; the creator then sees an in-app approval notice and Deploy. No email notification is sent.
- Revisions and owner reassignment clear approval. Reassignment is restricted to unpublished games without a MiniCoin.
- The header displays the saved Passport name and refreshes after profile edits/account changes.
- Verification: 74 app tests, TypeScript check, Vite production build. Skrumpey approval/deployment are reserved for the user's recording.
- Grok owns hosted Envio verification and X graphics. X: @TokenArcadeFun. Envio start block 70821881; verify the claimed raid after sync past 70822798.

The original handoff below is historical.
# Final stretch (grok/final-stretch) — 2026-10-13

Branch = `codex/backup-integration-20261013` + `codex/minicoin-economy` (clean merge, no conflicts) + the commits below.
It does NOT touch any of Codex's unpushed files (apps/api/src/minicoin.ts, apps/api/src/server.ts,
apps/api/src/testnet-minicoin.ts, apps/web/src/CreatorPortal.tsx, apps/web/src/TestnetTokenPanel.tsx,
packages/sdk/src/testnet.ts, apps/api/test/testnet-launch.local-chain.ts, scripts/setup-testnet.cjs, .gitignore).

## Verified (Node 22.23, Linux)
- `npm ci && npm run setup:cartridges && npm run build`: OK
- `npm test`: 53/53 pass. `cd contracts && npm test`: 20/20 pass. (Node 20 fails: needs >=22.12 flags.)
- Skrumpey Slide (v3 source, cartridge 1.0.0) is not in the default catalog by design (tests assert it).
  `scripts/publish-skrumpey-local.sh` runs it through creator submit -> admin validate/approve -> deploy
  on a LOCAL_DEMO_MODE API; it then loads at /play/skrumpey-slide and a full Free Play run works in headless Chromium.
  In production, publish it the same way through /launch (Creator Portal) + /admin-tools with a Privy admin.
- `cd contracts && npm run rehearse:economy`: PASS (deploy -> wire -> init pool -> seed liquidity -> buy ->
  distribute -> open raid -> settle -> claim) on an in-process Hardhat chain.

## Testnet economy deploy
Addresses (Monad-maintained v4 testnet infra, not official Uniswap; source:
docs.monad.xyz/guides/uniswap-v4-hooks/setup -> monad-developers/uniswap-v4-hooks-example@c3cc78a shared-infrastructure.json;
both have code on 10143): PoolManager 0x451D64ab3b650040d2aE1886602b97ed6eDc643d, WMON 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541.
Uniswap's official v4 deployments page lists Monad mainnet (143) only.

    cd contracts
    RPC_URL=https://testnet-rpc.monad.xyz PRIVATE_KEY=0x... DEPLOY_TEST_ROUTER=1 [MINICOIN_ADDRESS=0x...] npm run deploy:economy:testnet
    RPC_URL=... PRIVATE_KEY=... BUY_WMON=0.05 [WINNER=0x...] npm run raid:testnet

Writes contracts/deployments/monad-testnet.json (resumable; re-run skips finished steps). Refuses any chain but 10143/31337.
Cost: ~10 txs of deploys/wiring + 0.05 MON wrapped for the demo buy; well within 5 test MON.
Raid duration defaults to 120 s (RAID_DURATION). Settlement trusts the vault owner (deployer) as verifier.

## Hosting
Cloudflare quick tunnels cannot connect from the Grok box (outbound 7844 blocked). Use Render (render.yaml, Docker)
or run `npm start` + two tunnels on droober's machine. Two public origins are required (arcade, cartridges):
set CARTRIDGE_ORIGIN / ARCADE_HOST_ORIGINS / ARCADE_API_ORIGIN, NODE_ENV=production, LOCAL_DEMO_MODE=false.
VITE_PRIVY_APP_ID must be present at build time; PRIVY_APP_ID/PRIVY_APP_SECRET/ADMIN_PRIVY_IDS at runtime.
Never expose a LOCAL_DEMO_MODE process publicly (tunnels look like loopback).

