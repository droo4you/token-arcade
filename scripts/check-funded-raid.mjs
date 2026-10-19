// Read-only: reconcile the recorded Monad testnet rehearsal with RPC and Envio.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createPublicClient, http, parseAbi, formatEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const deployment = JSON.parse(await readFile(new URL('../contracts/deployments/monad-testnet.json', import.meta.url), 'utf8'));
const client = createPublicClient({ transport: http(process.env.TESTNET_RPC_URL || 'https://testnet-rpc.monad.xyz', { timeout: 15_000, retryCount: 1 }) });
assert.equal(await client.getChainId(), 10143, 'Expected Monad testnet');
const abi = parseAbi([
  'function owner() view returns (address)',
  'function freeBalance() view returns (uint256)',
  'function activeRaidId() view returns (bytes32)',
  'function config() view returns (uint256 threshold,uint256 maxPrize,uint16 prizeBps,uint64 cooldown,uint64 duration,uint64 settlementTimeout,uint64 claimWindow,bytes32 rulesHash)',
  'function raids(bytes32) view returns (bytes32 rulesHash,bytes32 resultHash,uint256 prize,uint256 startsAt,uint256 endsAt,uint256 settleBy,uint256 claimWindow,uint256 claimDeadline,address winner,uint8 status)',
]);
const vault = deployment.contracts.raidVault;
const call = (functionName, args) => client.readContract({ address: vault, abi, functionName, args });
const prior = deployment.raids.at(-1);
assert.ok(prior, 'No recorded rehearsal');
const [owner, free, active, config, raid] = await Promise.all([
  call('owner'), call('freeBalance'), call('activeRaidId'), call('config'), call('raids', [prior.raidId]),
]);
const receipts = [];
for (const [step, hash] of Object.entries(prior.transactions)) {
  const receipt = await client.getTransactionReceipt({ hash });
  assert.equal(receipt.status, 'success', `${step} did not succeed`);
  receipts.push({ step, hash, block: receipt.blockNumber.toString() });
}
assert.equal(raid[9], 3, 'Recorded raid is not claimed');
assert.equal(raid[2].toString(), prior.prizeWei, 'Chain prize differs from deployment record');
assert.equal(raid[8].toLowerCase(), prior.winner.toLowerCase(), 'Chain winner differs');
const indexerUrl = process.env.ENVIO_GRAPHQL_URL || 'https://indexer.dev.hyperindex.xyz/0712619/v1/graphql';
const response = await fetch(indexerUrl, {
  method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(20_000),
  body: JSON.stringify({ query: 'query($id: String!) { Raid(where: {id: {_eq: $id}}) { id status winner prize resultHash claims { amount to txHash } } }', variables: { id: `${vault.toLowerCase()}-${prior.raidId}` } }),
});
assert.ok(response.ok, 'Envio endpoint unavailable');
const indexed = await response.json();
assert.ok(!indexed.errors, JSON.stringify(indexed.errors));
const row = indexed.data.Raid[0];
assert.equal(row?.status, 'CLAIMED', 'Envio has not indexed the claimed raid');
assert.equal(row.winner.toLowerCase(), prior.winner.toLowerCase());
assert.equal(row.prize, prior.prizeWei);
assert.equal(row.resultHash.toLowerCase(), raid[1].toLowerCase());
assert.ok(row.claims.some(c => c.txHash.toLowerCase() === prior.claimTx.toLowerCase() && c.amount === prior.prizeWei && c.to.toLowerCase() === prior.winner.toLowerCase()), 'Envio claim does not match RPC');
const configuredSigner = process.env.TESTNET_DEPLOYER_PRIVATE_KEY ? privateKeyToAccount(process.env.TESTNET_DEPLOYER_PRIVATE_KEY).address : null;
const report = {
  checkedAt: new Date().toISOString(), chainId: 10143, vault, owner,
  configuredSigner, signerMatchesOwner: configuredSigner ? configuredSigner.toLowerCase() === owner.toLowerCase() : false,
  existingRehearsal: { raidId: prior.raidId, verified: true, winner: prior.winner, prizeWMON: formatEther(raid[2]), receipts, envio: row },
  nextRaid: { freeWMON: formatEther(free), thresholdWMON: formatEther(config[0]), thresholdMet: free >= config[0], activeRaidId: active,
    durationSeconds: Number(config[4]), settlementTimeoutSeconds: Number(config[5]), claimWindowSeconds: Number(config[6]), rulesHash: config[7] },
  playerPilot: { ready: false, remainingChecks: ['Deploy and configure the funded raid API and Privy claim UI', 'Verify each player can sign with their Passport arcade wallet and has test MON for claim gas', 'Create a new linked raid with a 30-minute window; do not reuse the prior free raid'] },
};
await mkdir(new URL('../.data/', import.meta.url), { recursive: true });
await writeFile(new URL('../.data/funded-raid-readiness.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
