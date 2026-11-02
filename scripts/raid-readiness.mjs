// Read-only: no signer, transaction, secret loading, or deployment-record writes.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createPublicClient, http, parseAbi, keccak256, stringToHex, zeroHash } from 'viem';

export function fundingSummary(free, accrued, config, allocation, active, nextOpenAt, now) {
  const [threshold, maxPrize, prizeBps] = config;
  // EconomyManager gives rounding dust to the prize allocation.
  const pending = accrued - accrued * allocation[4] / 10000n - accrued * allocation[5] / 10000n;
  const projected = free + pending;
  const prize = (balance) => { const value = balance * prizeBps / 10000n; return value < maxPrize ? value : maxPrize; };
  const blockers = [];
  if (active !== zeroHash) blockers.push('An active onchain raid must be resolved first.');
  if (now < nextOpenAt) blockers.push('The vault cooldown has not elapsed.');
  if (free < threshold) blockers.push('The vault is below its funding threshold.');
  if (prize(free) === 0n) blockers.push('The current balance rounds to a zero prize.');
  return { freeWei: free, accruedHookFeesWei: accrued, pendingVaultAllocationWei: pending,
    thresholdWei: threshold, shortfallNowWei: threshold > free ? threshold - free : 0n,
    shortfallAfterDistributionWei: threshold > projected ? threshold - projected : 0n,
    prizeNowWei: prize(free), prizeAfterDistributionWei: prize(projected),
    canOpenOnchainNow: blockers.length === 0, blockers };
}

export async function inspectRaid(client, deployment) {
  if (await client.getChainId() !== 10143 || String(deployment.chainId) !== '10143') throw new Error('Monad testnet (10143) is required.');
  const block = await client.getBlock();
  const blockNumber = block.number;
  const c = deployment.contracts;
  const read = (address, signature, functionName, args = []) => client.readContract({ address, abi: parseAbi([signature]), functionName, args, blockNumber });
  const [config, free, locked, active, nextOpenAt, owner, token, game, wmon, accrued, allocation, feeSource, approvedPool] = await Promise.all([
    read(c.raidVault, 'function config() view returns (uint256,uint256,uint16,uint64,uint64,uint64,uint64,bytes32)', 'config'),
    read(c.raidVault, 'function freeBalance() view returns (uint256)', 'freeBalance'),
    read(c.raidVault, 'function lockedBalance() view returns (uint256)', 'lockedBalance'),
    read(c.raidVault, 'function activeRaidId() view returns (bytes32)', 'activeRaidId'),
    read(c.raidVault, 'function nextOpenAt() view returns (uint256)', 'nextOpenAt'),
    read(c.raidVault, 'function owner() view returns (address)', 'owner'),
    read(c.raidVault, 'function minicoin() view returns (address)', 'minicoin'),
    read(c.raidVault, 'function gameId() view returns (bytes32)', 'gameId'),
    read(c.raidVault, 'function wmon() view returns (address)', 'wmon'),
    read(c.miniCoinHook, 'function accrued(bytes32) view returns (uint256)', 'accrued', [deployment.pool.poolId]),
    read(c.economyManager, 'function allocations(bytes32) view returns (address,address,address,uint16,uint16,uint16,bool)', 'allocations', [deployment.pool.poolId]),
    read(c.economyManager, 'function feeSource() view returns (address)', 'feeSource'),
    read(c.miniCoinHook, 'function approvedPoolId() view returns (bytes32)', 'approvedPoolId'),
  ]);
  const equal = (a, b) => a.toLowerCase() === b.toLowerCase();
  if (!equal(token, c.miniCoin) || !equal(game, keccak256(stringToHex(deployment.gameId))) ||
      !equal(wmon, deployment.external.wmon) || !equal(allocation[0], c.raidVault) || !allocation[6] ||
      !equal(feeSource, c.miniCoinHook) || !equal(approvedPool, deployment.pool.poolId)) throw new Error('Deployment wiring does not match the onchain vault, pool, or fee allocation.');
  // viem decodes small uint fields as numbers; normalize before integer math.
  const normalizedConfig = config.map((value, index) => index < 7 ? BigInt(value) : value);
  const normalizedAllocation = allocation.map((value, index) => index >= 3 && index <= 5 ? BigInt(value) : value);
  return { chainId: 10143, gameId: deployment.gameId, blockNumber, chainTimestamp: block.timestamp,
    vault: c.raidVault, owner, activeRaidId: active, lockedWei: locked, nextOpenAt,
    durationSeconds: config[4], settlementTimeoutSeconds: config[5], claimWindowSeconds: config[6], rulesHash: config[7],
    ...fundingSummary(free, accrued, normalizedConfig, normalizedAllocation, active, nextOpenAt, block.timestamp),
    playerPilotReady: false,
    remainingIntegration: ['Bind website raid and verified final result to the onchain raid and rules hash.',
      'Resolve the winning player wallet and submit owner settlement.', 'Provide the winner with a claim flow.'],
    note: 'Opening starts the onchain timer immediately. Funding readiness alone does not establish player pilot readiness.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const rpc = process.env.TESTNET_RPC_URL || process.env.MONAD_RPC_URL || process.env.RPC_URL;
    if (!rpc) throw new Error('Set TESTNET_RPC_URL to a Monad testnet RPC URL. No private key is needed.');
    const deployment = JSON.parse(readFileSync(new URL('../contracts/deployments/monad-testnet.json', import.meta.url), 'utf8'));
    const client = createPublicClient({ transport: http(rpc, { timeout: 15000, retryCount: 1 }) });
    console.log(JSON.stringify(await inspectRaid(client, deployment), (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
  } catch (error) {
    // Avoid printing RPC URLs or provider error bodies, which may include credentials.
    console.error(error?.name === 'Error' ? error.message : 'Read-only RPC check failed. Check connectivity and the testnet endpoint.');
    process.exitCode = 1;
  }
}
