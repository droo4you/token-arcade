# Automatic raid rewards — Monad testnet

## Implemented and rehearsed

The API freezes the accepted standings after the raid ends, reads the winner's wallet captured at entry, and pays that wallet. Winners need no gas and no signing step. The contract emits the existing RaidSettled and PrizeClaimed events in one transaction.

New vault: `0xa2c8b6819575705b340d7fb6796076bd1fed8a12`.
Dedicated testnet owner/sponsor: `0x35F0f9840aCABa576BA1C92AC1f79411F8e6091a`.

The isolated rehearsal paid 0.0001 test WMON to a recipient holding zero native MON:
`0xe271c9425bd83920a573cd856e8450971c3d09090fb7eff1b2de9a82bbe7b9b7`.
See `contracts/deployments/automatic-payout-rehearsal.json`. This was a synthetic contract/worker fixture in a separate local SQLite database, not player gameplay or a live website raid. No production standings were inserted or changed.

## Activation

The implementation is opt-in. On Oct 22, 2026, droober explicitly approved storing the dedicated testnet payout key in Render. The API environment was configured through Render and deployed; production health now reports `automaticPayouts: true`, chain 10143, with normal Privy authentication and demo login disabled. The earlier approval rejection is resolved. A real website player raid with automatic delivery remains the acceptance test; activation alone is not evidence of that payout.

Use one always-on API instance and its existing persistent SQLite disk. Preserve all existing Privy/origin/disk settings. Add only:

```text
TESTNET_AUTO_PAYOUTS=true
TESTNET_RAID_VAULT=0xa2c8b6819575705b340d7fb6796076bd1fed8a12
TESTNET_RPC_URL=https://rpc-testnet.monadinfra.com
TESTNET_PAYOUT_PRIVATE_KEY=<dedicated testnet owner key, entered as a secret>
```

The generated key is in ignored `.data/payout-wallet.env`; never commit or paste it into chat. It controls only the newly deployed testnet vault and was funded with 0.25 test MON. Do not reuse a mainnet key. The old deployment owner key is not needed on Render.

After activation, prepare the next real funded draft in Launch Console. Export its rules plan and run `scripts/funded-player-raid.mjs open` using the dedicated owner key (mapped to the script's TESTNET_DEPLOYER_PRIVATE_KEY). This sets the actual 30-minute rules and opens the chain raid. Link the returned chain raid ID. Bind checks sponsor ownership, payout capability and at least 0.05 test MON before accepting players. The service then finalizes and pays every 15 seconds without a visitor needing to load the page.

The new vault has a direct test deposit; the existing immutable EconomyManager allocation still routes trading fees to the legacy vault. **Trading-fee routing has not migrated.** The next economy integration must deliberately deploy/wire a new pool allocation graph, with separate evidence. Do not present this direct funding as trading volume.

## Recovery and limits

- Chain 10143 only; configured vault only; reserved prize and rules must match.
- Per-transaction gas ceiling: 0.05 test MON. Sponsor balance bounds total available gas.
- SQLite outbox stores signed bytes before broadcast. RPC failover and restart retry those exact bytes/hash/nonce. No new transaction is signed while an earlier one is unresolved.
- A reverted receipt is marked for operator attention and is not automatically re-signed. Back up the persistent database before any recovery; never delete pending jobs to force another payment.
- Insufficient sponsor funds or mismatched custody are surfaced as delivery needing attention. Refill only the dedicated testnet sponsor and let the next tick retry.
- Keep this signer exclusive to this single API instance. Do not run multiple workers or send operator transactions while a payout is pending.
- The old vault and completed Guy payout are preserved. Historical claims read their bound vault after configuration rotates. No second airdrop was made to Guy.
- `settleAndPay` atomically rolls back if delivery fails. `payWinner` can sponsor a previously settled prize but has no recipient parameter. Existing winner-only claims remain compatible.
- Envio's existing events remain compatible; the new address still needs registration in the deployed indexer. A receipt is payment evidence; deployed indexer catch-up must be checked separately.

## Verification

Contract tests cover zero-gas recipients, authorization, double payment, fixed-recipient sponsorship, escrow accounting, expiry and rollback on token transfer failure. Worker tests cover ambiguous RPC failure, restart recovery, wrong chain, custody mismatch, excessive gas, reverted receipts and legacy exclusion. An RPC transport test checks that fallback submits identical signed bytes.

Rehearsal scripts are testnet-only and use separate evidence files. `scripts/rehearse-automatic-payout.mjs` can reconcile the recorded test payment again without another payout; it must never be used as evidence of real player scores.
