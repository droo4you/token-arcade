// Testnet only. Requires deployer and dedicated payout keys. Preserves legacy deployments.
// node --env-file=... --env-file=.data/payout-wallet.env scripts/deploy-payout-vault.mjs [--broadcast]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { createPublicClient, createWalletClient, encodeDeployData, encodeFunctionData, parseAbi, keccak256, stringToHex, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';
import { testnetTransport } from '../apps/api/src/testnetRpc.ts';
const require = createRequire(import.meta.url);
const { compileContracts } = require('../contracts/scripts/compile.cjs');
const artifact = compileContracts()['src/EconomyRaidVault.sol'].EconomyRaidVault;
const account = privateKeyToAccount(process.env.TESTNET_DEPLOYER_PRIVATE_KEY);
const owner = privateKeyToAccount(process.env.TESTNET_PAYOUT_PRIVATE_KEY).address;
assert.notEqual(account.address, owner, 'Use a dedicated payout signer');
const client = createPublicClient({ chain: monadTestnet, transport: testnetTransport() });
const wallet = createWalletClient({ chain: monadTestnet, account, transport: testnetTransport() });
assert.equal(await client.getChainId(), 10143);
const path = 'contracts/deployments/monad-testnet-payout-v1.json';
const state = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, 'utf8')) : { chainId: 10143, owner, deployer: account.address, transactions: {} };
assert.equal(state.owner, owner); assert.equal(state.deployer, account.address);
const save = () => fs.writeFileSync(path, JSON.stringify(state, null, 2) + '\n');
const broadcast = process.argv.includes('--broadcast');
const token = '0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541';
const minicoin = '0x85043f5C86Fe1CC5a0dFECf8803Ba2d7C7406760';
const config = { threshold: parseEther('0.0001'), maxPrize: parseEther('0.0001'), prizeBps: 2500, cooldown: 1n, duration: 60n, settlementTimeout: 86400n, claimWindow: 86400n, rulesHash: keccak256(stringToHex('automatic-payout-isolated-rehearsal-v1')) };
async function send(label, transaction, cap) {
  const outbox = `.data/payout-deploy-${label}.json`;
  let job;
  if (fs.existsSync(outbox)) job = JSON.parse(fs.readFileSync(outbox, 'utf8'));
  else {
    const gas = (await client.estimateGas({ account, ...transaction })) * 12n / 10n;
    const gasPrice = await client.getGasPrice();
    assert.ok(gas * gasPrice <= cap, 'Gas cap exceeded');
    console.log(JSON.stringify({ step: label, gasCapWei: String(gas * gasPrice), broadcast }));
    if (!broadcast) return;
    const nonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' });
    const raw = await wallet.signTransaction({ ...transaction, gas, gasPrice, nonce, type: 'legacy' });
    job = { raw, hash: keccak256(raw) };
    fs.writeFileSync(outbox, JSON.stringify(job));
  }
  if (!broadcast) { console.log(JSON.stringify({ step: label, hash: job.hash, broadcast: false })); return; }
  let receipt;
  try { receipt = await client.getTransactionReceipt({ hash: job.hash }); } catch (e) { if (e.name !== 'TransactionReceiptNotFoundError') throw e; }
  if (!receipt) {
    await client.sendRawTransaction({ serializedTransaction: job.raw });
    receipt = await client.waitForTransactionReceipt({ hash: job.hash, timeout: 60_000 });
  }
  assert.equal(receipt.status, 'success');
  state.transactions[label] = job.hash; save();
  console.log(JSON.stringify({ step: label, hash: job.hash }));
  return receipt;
}
if (!state.vault) {
  const data = encodeDeployData({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}`, args: [owner, token, minicoin, keccak256(stringToHex('skrumpey-slide')), config] });
  const receipt = await send('vault', { data, value: 0n }, parseEther('0.7'));
  if (!receipt) process.exit(0);
  state.vault = receipt.contractAddress; state.token = token; state.minicoin = minicoin; state.fundingSource = 'Direct test deposit; existing hook still routes to the legacy vault'; save();
}
assert.equal(await client.readContract({ address: state.vault, abi: artifact.abi, functionName: 'payoutVersion' }), 1n);
if (!state.transactions.sponsor) await send('sponsor', { to: owner, value: parseEther('0.25') }, parseEther('0.01'));
const tokenAbi = parseAbi(['function deposit() payable', 'function transfer(address,uint256) returns (bool)']);
if (!state.transactions.wrap) await send('wrap', { to: token, value: parseEther('0.001'), data: encodeFunctionData({ abi: tokenAbi, functionName: 'deposit' }) }, parseEther('0.02'));
if (!state.transactions.fund) await send('fund', { to: token, value: 0n, data: encodeFunctionData({ abi: tokenAbi, functionName: 'transfer', args: [state.vault, parseEther('0.001')] }) }, parseEther('0.02'));
console.log(JSON.stringify({ vault: state.vault, owner, chainId: 10143 }));
