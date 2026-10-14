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
