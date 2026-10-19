# Funded player raid — Monad testnet

## Verified 2026-10-19

The prior operator rehearsal's seven transactions succeeded. RPC reports its raid
claimed, and hosted Envio agrees on winner, prize, result hash and claim transaction.
The vault has 0.00024375 WMON available and no active raid. Its current duration is
120 seconds. This is existing contract evidence, not a completed player pilot.

`node scripts/check-funded-raid.mjs` repeats those read-only checks and saves
`.data/funded-raid-readiness.json`. With testnet signer configuration loaded, it
also compares the signer address with the vault owner without logging the key.

## Roles

- Privy player wallet: snapshotted on the first issued attempt; the winner claims.
- Vault-owner signer: local operator signs rules configuration, opening and settlement.
- Render: serves the API and UI, with no settlement key required for this workflow.
- Envio: indexes on-chain events; it does not validate gameplay or sign transactions.

## Deployment prerequisites

Deploy the funded API, database migration and claim UI together. Configure the API:

```
TESTNET_RPC_URL=<Monad testnet RPC>
TESTNET_RAID_VAULT=0x2e9497F8f8fc1cb4b51ACd35E5E27A21b389af7D
```

The existing global settlement health flag still describes general paid-entry
settlement. This explicit testnet pilot is free entry and uses its own custody checks.

Before opening: each player opens their Passport, has a Privy arcade wallet,
and confirms they can access that same wallet for transaction signing. The winner
needs test MON for gas. Browser access to a server-created Privy wallet has not yet
been verified end-to-end; the unit tests cannot prove this. Do not start the timed
player event until this wallet check succeeds.

## Operator sequence

1. As an arcade admin, POST `/api/admin/raids` with the reviewed Skrumpey Slide
   game/community, score objective, three attempts, seed and rules. Use
   `reward: {type: "erc20", asset: "0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541"}`,
   no entry fee and an intended future window. It stays a draft pending custody.
2. Load `TESTNET_RPC_URL`, `TESTNET_DEPLOYER_PRIVATE_KEY` and a short-lived
   `ARCADE_ADMIN_TOKEN` in the operator environment. Never commit these values.
3. Preview:
   `node --experimental-strip-types scripts/funded-player-raid.mjs open WEBSITE_RAID_ID`.
   The script reads the draft's rules commitment and checks vault ownership,
   available funding and cooldown. With `--broadcast`, it configures 30 minutes of
   play, a 24-hour settlement window and a 24-hour claim window, opens the chain raid,
   and binds the website raid to its exact chain times and locked prize.
4. Share the website raid and play. Opening starts the timer immediately. Each
   player's first issued attempt records their Passport wallet; later changes
   cannot redirect the prize. The server continues replay verification as usual.
5. After the deadline and final verification, preview:
   `node --experimental-strip-types scripts/funded-player-raid.mjs settle WEBSITE_RAID_ID`.
   Inspect the frozen standings and winner. Add `--broadcast` to settle the hash of
   the final result artifact to that wallet. No deployer-as-winner fallback exists.
6. The winner opens the raid and clicks **Claim testnet prize**, then confirms in
   Privy. The API checks on-chain settlement against the final artifact before
   returning claim calldata. A submitted transaction is not displayed as confirmed.
7. Verify the new receipt and corresponding Envio `Raid`/`RaidClaim` records.

Re-running opening can recover a still-active chain raid with the same rules hash;
it refuses a different active raid. Re-running settlement accepts an existing matching
settlement and refuses mismatches. If an opening request has an uncertain outcome,
wait for confirmation before retrying. If no player qualifies, cancel or time out
the contract raid instead of inventing a winner. The old free raid cannot be attached:
binding requires a draft and its unique rules commitment before play.

## Still to verify live

- Privy signing with the exact Passport wallet, then successful player claim.
- New deployed API admission, closure, settlement and Envio update for real players.
- No claim twice (contract enforces this; UI reads claimed status on recheck).

No new on-chain raid or transaction was created while preparing this integration.
