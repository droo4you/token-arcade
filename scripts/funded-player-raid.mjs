// Staged operator for a real website raid. Preview by default; --broadcast sends testnet transactions.
// Requires TESTNET_RPC_URL, TESTNET_DEPLOYER_PRIVATE_KEY, and either a public admin-UI plan or ARCADE_ADMIN_TOKEN.
// node --env-file=.env.testnet --experimental-strip-types scripts/funded-player-raid.mjs open|settle WEBSITE_RAID_ID [--plan-file plan.json] [--broadcast]
// With --plan-file, link the returned chain raid ID in the authenticated admin UI immediately after opening.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, http, parseAbi, decodeFunctionData } from 'viem';
import { monadTestnet } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { fundedVaultAbi, artifactHash } from '../apps/api/src/fundedRaids.ts';

const [action, id] = process.argv.slice(2);
assert.ok(['open', 'settle'].includes(action) && id, 'Usage: open|settle WEBSITE_RAID_ID [--broadcast]');
const planIndex = process.argv.indexOf('--plan-file');
const planFile = planIndex >= 0 ? process.argv[planIndex + 1] : undefined;
assert.ok(planFile || process.env.ARCADE_ADMIN_TOKEN, 'Supply --plan-file exported by the admin UI, or ARCADE_ADMIN_TOKEN');
const filePlan = planFile ? JSON.parse(await readFile(planFile, 'utf8')) : undefined;
if (filePlan) assert.equal(filePlan.artifact?.websiteRaidId, id, 'Plan belongs to a different website raid');
assert.ok(process.env.TESTNET_RPC_URL && process.env.TESTNET_DEPLOYER_PRIVATE_KEY, 'Set testnet RPC and signer');
const base = process.env.ARCADE_API_URL || 'https://token-arcade.onrender.com';
const apiUrl = new URL(base);
assert.ok(apiUrl.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(apiUrl.hostname), 'Use HTTPS for the admin token');
const rpc = http(process.env.TESTNET_RPC_URL, { timeout: 15_000, retryCount: 0 });
const client = createPublicClient({ transport: rpc });
assert.equal(await client.getChainId(), 10143, 'Only Monad testnet allowed');
const account = privateKeyToAccount(process.env.TESTNET_DEPLOYER_PRIVATE_KEY);
const wallet = createWalletClient({ account, chain: monadTestnet, transport: rpc });
const broadcast = process.argv.includes('--broadcast');
async function api(path, body) {
  const r = await fetch(new URL(path, base), { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20_000),
    headers: { authorization: `Bearer ${process.env.ARCADE_ADMIN_TOKEN}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || `API status ${r.status}`);
  return data;
}
const prefix = `/api/admin/raids/${encodeURIComponent(id)}/funded`;
const adminAbi = parseAbi([
  'function owner() view returns (address)', 'function activeRaidId() view returns (bytes32)',
  'function freeBalance() view returns (uint256)', 'function nextOpenAt() view returns (uint256)',
  'function config() view returns (uint256 threshold,uint256 maxPrize,uint16 prizeBps,uint64 cooldown,uint64 duration,uint64 settlementTimeout,uint64 claimWindow,bytes32 rulesHash)',
  'function setConfig((uint256 threshold,uint256 maxPrize,uint16 prizeBps,uint64 cooldown,uint64 duration,uint64 settlementTimeout,uint64 claimWindow,bytes32 rulesHash) nextConfig)',
  'function openEconomyRaid() returns (bytes32)',
]);
async function send(address, abi, functionName, args = []) {
  const gas = await client.estimateContractGas({ account, address, abi, functionName, args });
  const gasPrice = await client.getGasPrice();
  assert.ok(gas * gasPrice * 12n / 10n < 100000000000000000n, 'Transaction exceeds 0.1 test MON gas cap');
  const hash = await wallet.writeContract({ address, abi, functionName, args, gas: gas * 12n / 10n, gasPrice });
  console.log(JSON.stringify({ step: functionName, transactionHash: hash }));
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  assert.equal(receipt.status, 'success', 'Transaction reverted');
}
if (action === 'open') {
  const plan = filePlan ?? await api(`${prefix}/rules`);
  assert.ok(plan.vault && plan.chainId === 10143 && plan.rulesHash === artifactHash(plan.artifact), 'Invalid rules plan');
  const address = plan.vault;
  const read = functionName => client.readContract({ address, abi: adminAbi, functionName });
  assert.equal((await read('owner')).toLowerCase(), account.address.toLowerCase(), 'Signer does not own vault');
  let active = await read('activeRaidId');
  if (BigInt(active) !== 0n) {
    const existing = await client.readContract({ address, abi: fundedVaultAbi, functionName: 'raids', args: [active] });
    assert.equal(existing[0], plan.rulesHash, 'Another raid is already active');
  } else {
    const c = await read('config');
    assert.ok(await read('freeBalance') >= c[0], 'Vault needs additional test funding');
    assert.ok((await client.getBlock()).timestamp >= await read('nextOpenAt'), 'Vault cooldown has not elapsed');
    const next = { threshold: c[0], maxPrize: c[1], prizeBps: c[2], cooldown: c[3], duration: 1800n, settlementTimeout: 86400n, claimWindow: 86400n, rulesHash: plan.rulesHash };
    console.log(JSON.stringify({ stage: 'open', websiteRaidId: id, vault: address, durationMinutes: 30, rulesHash: plan.rulesHash, broadcast }));
    if (!broadcast) process.exit(0);
    await send(address, adminAbi, 'setConfig', [next]);
    await send(address, adminAbi, 'openEconomyRaid');
    active = await read('activeRaidId');
  }
  if (broadcast) console.log(JSON.stringify(filePlan ? { websiteRaidId: id, chainRaidId: active, next: 'Link this chain raid in the authenticated admin UI immediately.' } : { linkedRaid: (await api(`${prefix}/bind`, { chainRaidId: active })).raid.id, chainRaidId: active }));
} else {
  const plan = filePlan ?? await api(`${prefix}/settlement`);
  assert.equal(plan.resultHash, artifactHash(plan.artifact), 'Result artifact hash mismatch');
  assert.equal(plan.transaction.chainId, 10143);
  assert.equal(plan.transaction.value, '0');
  const decoded = decodeFunctionData({ abi: fundedVaultAbi, data: plan.transaction.data });
  assert.equal(decoded.functionName, 'settleRaid');
  assert.deepEqual(decoded.args.map(x => String(x).toLowerCase()), [plan.artifact.chainRaidId, plan.artifact.winner, plan.resultHash].map(x => x.toLowerCase()));
  assert.equal(plan.transaction.to.toLowerCase(), plan.artifact.vault.toLowerCase());
  const address = plan.transaction.to;
  assert.equal((await client.readContract({ address, abi: adminAbi, functionName: 'owner' })).toLowerCase(), account.address.toLowerCase());
  const raid = await client.readContract({ address, abi: fundedVaultAbi, functionName: 'raids', args: [plan.artifact.chainRaidId] });
  assert.equal(raid[0], plan.artifact.rulesHash, 'Rules mismatch');
  if (raid[9] === 2 || raid[9] === 3) {
    assert.equal(raid[1], plan.resultHash); assert.equal(raid[8].toLowerCase(), plan.artifact.winner.toLowerCase());
    console.log('Matching settlement already exists; no transaction sent.');
  } else {
    const now = (await client.getBlock()).timestamp;
    assert.ok(raid[9] === 1 && now >= raid[4] && now < raid[5], 'Raid outside settlement window');
    console.log(JSON.stringify({ stage: 'settle', websiteRaidId: id, winner: plan.artifact.winner, resultHash: plan.resultHash, broadcast }));
    if (broadcast) await send(address, fundedVaultAbi, 'settleRaid', decoded.args);
  }
}
