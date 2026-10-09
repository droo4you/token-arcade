# Token Arcade v0 contracts

These contracts provide the optional onchain boundary for the Metropolis demo. They have **not been deployed or audited**. The API must keep transaction hashes and contract addresses empty until a real deployment is configured and confirmed.

| Contract | Responsibility |
| --- | --- |
| `MinicoinFactory` | Curated deployment and one-token-per-game association. Only its owner can deploy. |
| `ExperimentalMinicoin` | Plain fixed-supply ERC-20 minted once to the configured recipient. It has no tax, reward, buyback, or further mint function. This is one experimental implementation, not the model for every future game. |
| `RaidPrizeVault` | Custody of a pre-deposited ERC-721 prize, association with a raid/game/community, irrevocable award to a winner, winner claim, and depositor refund after cancellation. |
| `EntryFeeRouter` | Fixed native coin or ERC-20 entry payment per raid, escrow until settlement, explicit prize/community/treasury split, and full payer refunds after cancellation. |

## Trust and integration boundaries

- The owner is a trusted Token Arcade settlement authority. Use the intended owner address when deploying. The owner registers raids/routes, adjudicates NFT winners after the API verifies results, and settles or cancels fee routes. Neither contract validates scores, attempt limits, wallet identity, or leaderboard position.
- `gameId` and `raidId` are `bytes32` values calculated as `keccak256(bytes(canonicalId))`, such as `ethers.id("skrumpey-slide")`. The API and contract calls must use the same canonical IDs.
- `ExperimentalMinicoin.CommunityAssetType` is `None=0`, `ERC20=1`, `ERC721=2`, `ERC1155=3`. An NFT collection can be stored as the Community Asset even when no Minicoin is deployed. The factory mapping is the authoritative Minicoin association; metadata on independently deployed tokens is not.
- For a paid run, the API must verify a finalized `EntryPaid` log against chain ID, router address, raid ID, payer wallet, asset, and amount. It must consume the unique `(transaction hash, log index)` once. A wallet can make multiple payments; `paidBy` is an aggregate refund balance, not an attempt counter.
- `EntryFeeRouter` accepts native coin or ERC-20 tokens that transfer the exact requested amount. Fee-on-transfer and rebasing assets are outside v0. Splits are configured per raid and must sum to 10,000 basis points. Integer rounding remainder goes to the treasury recipient. Settlement is possible after the configured end time; cancellation is possible only before settlement. Payers claim cancelled entries, and recipients withdraw settled shares.
- `RaidPrizeVault` accepts a prize through `depositPrize` after an owner registers the raid. The NFT holder approves the vault, then calls `depositPrize`; direct safe transfers are rejected. The owner can cancel before awarding a winner, after which only the depositor can claim the NFT back. Once awarded, only the winner can claim it, to an address they choose. An unsafe direct `transferFrom` can still strand an unregistered NFT and must not be used.
- The backend should coordinate the same raid ID across its database, fee router, and prize vault. Cancellation of one contract does not automatically cancel the other. Awarding a prize and settling fees are separate owner transactions.
- No contract purchases NFTs, links ownership wallets, verifies a game run, or issues a platform token.

## Build and local tests

From `contracts/`:

```sh
npm ci
npm run compile
npm test
npm run artifacts
```

`npm run artifacts` writes ABI and bytecode JSON to ignored `artifacts/`. The tests use a local Hardhat EVM and compile from the pinned local `solc` package, so no remote compiler download is needed.

## Deployment preparation

Copy `.env.example` to `.env` and fill in the intended Monad RPC URL, its expected chain ID, a funded deployer private key, and the intended owner address. The script validates the RPC chain ID before sending transactions. Node 22 can load the file with:

```sh
node --env-file=.env scripts/deploy.cjs
```

Alternatively export those four variables in the shell and run `npm run deploy`. The script deploys the factory, vault, and router. It prints each transaction and address, and writes a public deployment record to ignored `.data/deployments/`. It does not record the RPC URL or private key. If a deployment stops midway, the record remains marked `incomplete` with the successful addresses.

Deploying the contracts does not create a Minicoin, fund a raid, or route an entry. Those are separately authorized operator actions after game, community, raid, and wallet configuration are known.
