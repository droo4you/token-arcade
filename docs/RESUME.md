# Resume Token Arcade work

Checkpoint: 2026-10-13. Private GitHub backup: `droo4you/token-arcade`.

## Branches

- `main`: latest committed arcade integration baseline (`20a4043`), with this handoff note.
- `codex/minicoin-economy`: tested contract work and this note. Continue economy work here.
- `codex/backup-integration-20261013`: snapshot of uncommitted integration work from worktree `4499`, including Skrumpey Slide. Untested checkpoint; review before merging.
- `codex/backup-preview-20261013`: snapshot of uncommitted live-preview source from the original checkout. Untested checkpoint; review before merging. The source ZIP is excluded.

The backup branches preserve work without changing the integration checkouts or their staging areas. They are separate snapshots, not a merged release. Local environment files, keys, databases, generated builds, and node_modules are excluded. Recreate configuration from `.env.example`; preserve any existing local environment.

## Product direction

Free community raids should support (1) accumulated vault funds reaching the prize threshold and (2) users sponsoring a raid by depositing the approved community asset. Implemented sponsor path currently accepts ERC-721 NFTs; arbitrary community ERC-20 sponsorship is still a gap. Acquiring an NFT and opening its raid are separate steps. Automated marketplace purchasing is not implemented or approved.

Frozen baseline: `docs/token-arcade-package/minicoin-economy-v0.2.2-codex-ready.txt`. Additional brainstorming: [MiniCoin v1 Contract Spec](https://docs.google.com/document/d/1ECO4d-ifEXJ_ChyAtGmF973ZLiobySw7lZRMuBnP5lQ/edit). The v1 document refers to a DECISIONS_LOG not present here; do not silently treat all brainstorming as frozen scope.

## Economy checkpoint

- Fixed MiniCoin/WMON v4 pool hook; WMON fees accrue as ERC-6909 claims in FeeAccumulator.
- Claims are redeemed later and split by EconomyManager; rounding remainder goes to the prize vault.
- EconomyRaidVault opens a free-entry raid when funded above its threshold and supports settlement, winner claim, cancellation, timeout, and expired-claim recycling.
- CommunityNftRaidVault lets a holder sponsor an approved NFT raid, snapshots the verifier, and supports claims and sponsor refunds.
- Read-only mainnet preflight exists at `contracts/scripts/preflight.cjs`.
- `cd contracts; npm ci; npm run compile; npm test`: compile succeeded and **20/20 tests passed** on 2026-10-13. Includes actual local v4 PoolManager swaps with WMON in either currency position, a first purchase with zero WMON reserves, distribution, raid settlement, and winner claim.

The first purchase requires ERC-6909 accrual: taking physical WMON before the router settles input can fail when PoolManager has no WMON reserves. The regression test covers this.

## Remaining work / launch gates

1. Reconcile v0 and the v1 brainstorm, including anti-snipe limits, configuration timelocks, lobby requirements and Merkle rewards. These are not implemented in this checkpoint.
2. Build and rehearse production deployment wiring, hook CREATE2 deployment, pool initialization, initial liquidity and LP custody/lock. Existing `contracts/scripts/deploy.cjs` deploys only the legacy factory/manual vault/paid-entry router; it does NOT deploy the new economy.
3. Integrate registry/API/indexing, score verification and UI. Contract settlement trusts the configured operator/verifier. WMON and NFT vaults do not share an active-raid lock.
4. Implement/review community treasury strategy and NFT acquisition workflow. An allocation destination alone is not an automated strategy.
5. Confirm exact founder settings: price/range, seed assets, budgets, owner/verifier/treasury addresses, raid rules, fee split and LP lock. Proposed values are not spending authorization.
6. Verify Monad mainnet contracts/router version against official sources and run a fork rehearsal. Local tests are not a production security audit.
7. Obtain explicit approval of concrete transactions and budgets before deployment, funding, swaps or NFT purchases. **No mainnet transactions were sent by this economy task.**

## Local workspace cautions

- Economy worktree: `C:\Users\andre\.codex\worktrees\7f34\Metropolis - TA`.
- Integration worktree: `C:\Users\andre\.codex\worktrees\4499\Metropolis - TA`.
- Live preview: `C:\Users\andre\Projects\Metropolis - TA`, ports 5173/8787/8788. Separate review ports 5190/8790.
- Preserve running rehearsal chain, local environment, databases and unrelated integration edits. Do not restart services just to resume contract work.
