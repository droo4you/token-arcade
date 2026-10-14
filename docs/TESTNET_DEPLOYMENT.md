# Verified Monad testnet economy

Completed 2026-10-13 Pacific (2026-10-14 UTC). Chain **10143**. All 20 deployment/wiring/raid transactions were independently checked for successful receipts, code presence and matching contract wiring. Start block: **70821881**.

## Contracts

| Contract | Address |
| --- | --- |
| MiniCoin (SLIDE) | [0x85043f5C86Fe1CC5a0dFECf8803Ba2d7C7406760](https://testnet.monadscan.com/address/0x85043f5C86Fe1CC5a0dFECf8803Ba2d7C7406760) |
| EconomyManager | [0x03254f5046482695614E56269c4849D185fCA727](https://testnet.monadscan.com/address/0x03254f5046482695614E56269c4849D185fCA727) |
| FeeAccumulator | [0x329D2f485625b19CB6b9299011Db4457A4fea276](https://testnet.monadscan.com/address/0x329D2f485625b19CB6b9299011Db4457A4fea276) |
| EconomyRaidVault | [0x2e9497F8f8fc1cb4b51ACd35E5E27A21b389af7D](https://testnet.monadscan.com/address/0x2e9497F8f8fc1cb4b51ACd35E5E27A21b389af7D) |
| MiniCoinHook | [0xCdE995A2445EBAA8Ded2d00D4D59DdCC35b060cc](https://testnet.monadscan.com/address/0xCdE995A2445EBAA8Ded2d00D4D59DdCC35b060cc) |
| CREATE2 deployer | [0x7737c7065BCDb9604cb7c94c5f3b47BDb372FA8c](https://testnet.monadscan.com/address/0x7737c7065BCDb9604cb7c94c5f3b47BDb372FA8c) |
| Test-only router | [0xAb39d99DC5cb3D14ae4471CAA9A691CB24D6d635](https://testnet.monadscan.com/address/0xAb39d99DC5cb3D14ae4471CAA9A691CB24D6d635) |

The earlier `setup-testnet.cjs` created factory `0xd6C050dD471CC548BdE664EaA5D2aB9CC24320d6` (transaction `0xd4ca27ef3ab85475493ffb9a53b283205cfca27f2ccf77bdfca7266ed61f5cdb`), not a MiniCoin. The economy script therefore created its own token. That token is not associated with the earlier factory's per-game mapping; do not present it as a Creator Portal factory launch.

Monad-maintained infrastructure: PoolManager `0x451D64ab3b650040d2aE1886602b97ed6eDc643d`, WMON `0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541`. [Pinned source manifest](https://github.com/monad-developers/uniswap-v4-hooks-example/blob/c3cc78a88f10e5ba141cd6fb632f31db83c0daf8/shared-infrastructure.json). These are testnet deployments maintained by Monad, not official Uniswap mainnet addresses.

## Demonstrated loop

| Step | Verified transaction |
| --- | --- |
| Deploy SLIDE | [0x6e6f991ac5f577a0f9f78414e0e58399f5d4bae6689f9768b51e903d06311250](https://testnet.monadscan.com/tx/0x6e6f991ac5f577a0f9f78414e0e58399f5d4bae6689f9768b51e903d06311250) |
| Buy with 0.05 WMON | [0xea166673cc0226c211b248218737853a4deb461bda9a0a2eae746616acd6256a](https://testnet.monadscan.com/tx/0xea166673cc0226c211b248218737853a4deb461bda9a0a2eae746616acd6256a) |
| Distribute hook fees | [0xf6185edf3d1de5e6bbd6d29a3a433602df93306b802b01c63ca1c6d14b5cbd9e](https://testnet.monadscan.com/tx/0xf6185edf3d1de5e6bbd6d29a3a433602df93306b802b01c63ca1c6d14b5cbd9e) |
| Open raid | [0x7ee70090474beba0126703ad6dce9210c5d0fe3d66eb703084ebe6313b079ca5](https://testnet.monadscan.com/tx/0x7ee70090474beba0126703ad6dce9210c5d0fe3d66eb703084ebe6313b079ca5) |
| Settle raid | [0x219dd71671e7ca18d7d96e9351eb82606db95a4f39e42483ad50e333077797c7](https://testnet.monadscan.com/tx/0x219dd71671e7ca18d7d96e9351eb82606db95a4f39e42483ad50e333077797c7) |
| Winner claims | [0x061ff1bb51c4b4396eea2d59c9a3d3d1a56f4ce14318b8aa2aad7188e1580d1a](https://testnet.monadscan.com/tx/0x061ff1bb51c4b4396eea2d59c9a3d3d1a56f4ce14318b8aa2aad7188e1580d1a) |

- 1% hook fee: **0.0005 WMON**; split 65% prize / 20% community / 15% treasury.
- Prize vault allocation: **0.000325 WMON**. Raid reserves 25%: **0.00008125 WMON**, successfully claimed.
- Vault free balance afterward: **0.00024375 WMON**; locked balance and uncollected hook fees both zero.
- Raid ID: `0xaba5553e1c686447f285c7c9f3547961b44a3c5667178b2a7af59bb473a87593`.
- Operator/winner: `0x115ab9287A60718Be04585a3226b223476897d51`. Remaining gas balance at verification: **2.67995634 test MON**.

Full receipt hashes, blocks and runtime code hashes: [deployment record](../contracts/deployments/monad-testnet.json).

This is an operator-run testnet demonstration with a demo result hash. It proves the onchain fee/prize path, not automatic leaderboard settlement or a production trade UI. The test router is restricted to test chains and its liquidity owner; production needs reviewed periphery/LP custody. No mainnet transactions were sent.

## Recheck without sending transactions

From the repository root, with the ignored local `.env.testnet` present:

```powershell
node --env-file=.env.testnet contracts/scripts/verify-economy-testnet.cjs
node indexer/scripts/addresses-from-deployment.mjs
```

The verifier reads the chain and updates public verification evidence. The address exporter writes ignored `indexer/.env`. To run another raid intentionally, set `REPEAT_RAID=1`; do not rerun just to inspect the previous result.
