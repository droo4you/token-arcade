# Token Arcade economy indexer (Envio HyperIndex v3)

Indexes the MiniCoin economy on **Monad testnet (10143)**: `EconomyRaidVault`, `CommunityNftRaidVault`,
`EconomyManager`, `FeeAccumulator`, `MiniCoinHook`. Monad testnet is HyperSync-supported
(`https://monad-testnet.hypersync.xyz`), so no RPC is needed.

Entities (`schema.graphql`): `Raid` (WMON and NFT raids, full lifecycle), `RaidClaim`, `VaultBalance`
(free/locked prize balance derived from events), `Pool` (+ split config, total fees), `FeeAccrual` (one per
hooked swap, i.e. the swap feed), `Distribution`, `PlayerStats` (wins, claims, prize totals by wallet).

## Run locally
Node 22+. `envio dev` needs Docker (Postgres + Hasura).

    cd indexer
    npm install
    npm run addresses        # after contracts/scripts/deploy-economy-testnet.cjs wrote deployments/monad-testnet.json
                             # (add `-- --nft-vault 0x…` if a CommunityNftRaidVault is deployed)
    npm run codegen
    npm test                 # type-check + simulated fee→distribute→raid→claim handler test (no network)
    npm run dev              # GraphQL/Hasura at http://localhost:8080 (default password: testing)

Until real addresses are set, config placeholders `0x…01`–`0x…05` index nothing.

## Host on Envio (hosted service)
1. https://envio.dev/app → sign in with GitHub → **Add indexer** → pick `droo4you/token-arcade`,
   root directory `indexer`, config `config.yaml`, branch `grok/final-stretch` (or main after merge).
   Envio's GitHub app must be granted access to the private repo.
2. Add env vars in the Envio dashboard: `ENVIO_RAID_VAULT`, `ENVIO_ECONOMY_MANAGER`, `ENVIO_FEE_ACCUMULATOR`,
   `ENVIO_MINICOIN_HOOK`, `ENVIO_NFT_RAID_VAULT`, `ENVIO_START_BLOCK` (values from `npm run addresses`).
3. Push → Envio builds and deploys; it gives a public GraphQL endpoint. Point the arcade API/web at it.

Example query:

    { Raid(order_by: {openedAt: desc}, limit: 5) { raidId kind status prize winner endsAt claims { amount to } }
      VaultBalance { id freeBalance lockedBalance totalPrizesPaid }
      PlayerStats(order_by: {totalPrizeWei: desc}) { id raidsWon totalPrizeWei } }

## Hosting on Envio (Monad testnet deployment)

Defaults in `config.yaml` already point at `contracts/deployments/monad-testnet.json`:
RaidVault `0x2e9497F8f8fc1cb4b51ACd35E5E27A21b389af7D`, EconomyManager `0x03254f5046482695614E56269c4849D185fCA727`,
FeeAccumulator `0x329D2f485625b19CB6b9299011Db4457A4fea276`, MiniCoinHook `0xCdE995A2445EBAA8Ded2d00D4D59DdCC35b060cc`.
Verified 2026-10-13 via Monad RPC receipts: ConfigUpdated, HookSet, PoolConfigured, FeeCaptured, FeeCollected, Redeemed,
Distributed, RaidOpened, RaidSettled, PrizeClaimed all emitted on chain (blocks 70821881-70822798).

1. Sign in at https://envio.dev/app with GitHub (droo4you) and install the Envio GitHub app on `droo4you/token-arcade` (private repo access).
2. Add indexer -> repo `droo4you/token-arcade`, root directory `indexer`, config `config.yaml`, deploy branch `main`.
3. Environment variables: `ENVIO_START_BLOCK=70821881` (required, otherwise it scans from block 0).
   Leave `ENVIO_NFT_RAID_VAULT` unset until that vault is deployed. Address vars are optional (defaults are baked in).
4. Deploy, wait for sync to pass block ~70822798, then open the GraphQL playground and run:
   `query { Raid { id status } Distribution { id } }` (entity names per `schema.graphql`); expect 1 raid, settled/claimed.
5. Local alternative: `npm ci && npm run addresses > .env && npx envio dev` (needs Docker, plus `ENVIO_API_TOKEN` for HyperSync, which now returns 401 without a token).

Note: `npm test` must run without a `.env` setting `ENVIO_START_BLOCK` (the test indexer processes block 1).
