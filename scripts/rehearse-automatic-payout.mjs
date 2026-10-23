// Isolated TEST FIXTURE, never uploaded to the website or represented as player gameplay.
// Exercises the real worker against the deployed testnet vault with a zero-gas recipient.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createPublicClient, createWalletClient, parseAbi, keccak256 } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { monadTestnet } from 'viem/chains';
import { ArcadeStore } from '../apps/api/src/store.ts';
import { FundedRaids, fundedVaultAbi } from '../apps/api/src/fundedRaids.ts';
import { AutomaticPayouts } from '../apps/api/src/automaticPayouts.ts';
import { testnetTransport } from '../apps/api/src/testnetRpc.ts';
const deployment = JSON.parse(fs.readFileSync('contracts/deployments/monad-testnet-payout-v1.json', 'utf8'));
const vault = deployment.vault;
const account = privateKeyToAccount(process.env.TESTNET_PAYOUT_PRIVATE_KEY);
assert.equal(account.address, deployment.owner);
const client = createPublicClient({ chain: monadTestnet, transport: testnetTransport() });
const wallet = createWalletClient({ account, chain: monadTestnet, transport: testnetTransport() });
assert.equal(await client.getChainId(), 10143);
const recipientPath = '.data/payout-rehearsal-recipient.key';
if (!fs.existsSync(recipientPath)) fs.writeFileSync(recipientPath, generatePrivateKey(), { mode: 0o600 });
const recipient = privateKeyToAccount(fs.readFileSync(recipientPath, 'utf8')).address;
assert.equal(await client.getBalance({ address: recipient }), 0n);
const store = new ArcadeStore('.data/payout-rehearsal.sqlite', false);
const funded = new FundedRaids(store, { vault, rpcUrl: undefined });
const worker = new AutomaticPayouts(store, funded, { enabled: true, privateKey: process.env.TESTNET_PAYOUT_PRIVATE_KEY, rpcUrl: undefined });
const abi = parseAbi(['function openEconomyRaid() returns (bytes32)', 'function activeRaidId() view returns (bytes32)', 'function balanceOf(address) view returns (uint256)']);
try {
  let raid = store.getRaid('isolated-payout-rehearsal');
  if (!raid) {
    let chainRaidId = await client.readContract({ address: vault, abi, functionName: 'activeRaidId' });
    if (BigInt(chainRaidId) === 0n) {
      const outbox = '.data/payout-rehearsal-open.json';
      let tx;
      if (fs.existsSync(outbox)) tx = JSON.parse(fs.readFileSync(outbox, 'utf8'));
      else {
        const nonce = await client.getTransactionCount({ address: account.address, blockTag: 'pending' });
        const { request: simulated } = await client.simulateContract({ account, address: vault, abi, functionName: 'openEconomyRaid' });
        const gas = await client.estimateContractGas(simulated);
        const gasPrice = await client.getGasPrice();
        assert.ok(gas * gasPrice * 12n / 10n < 50000000000000000n);
        const { encodeFunctionData } = await import('viem');
        const raw = await wallet.signTransaction({ to: vault, data: encodeFunctionData({ abi, functionName: 'openEconomyRaid' }), gas: gas * 12n / 10n, gasPrice, nonce, type: 'legacy' });
        tx = { raw, hash: keccak256(raw) }; fs.writeFileSync(outbox, JSON.stringify(tx));
      }
      await client.sendRawTransaction({ serializedTransaction: tx.raw });
      await client.waitForTransactionReceipt({ hash: tx.hash });
      chainRaidId = await client.readContract({ address: vault, abi, functionName: 'activeRaidId' });
    }
    const onchain = await client.readContract({ address: vault, abi: fundedVaultAbi, functionName: 'raids', args: [chainRaidId] });
    raid = { id: 'isolated-payout-rehearsal', name: 'Isolated automatic payout fixture (not player gameplay)', gameId: 'skrumpey-slide', communityId: 'test-fixture', objective: 'distance', seed: 'fixture', maxAttempts: 1,
      startsAt: new Date(Number(onchain[3])*1000).toISOString(), endsAt: new Date(Number(onchain[4])*1000).toISOString(), status: 'closed',
      reward: { type: 'erc20', asset: deployment.token, amount: String(onchain[2]) }, feeSplitBps: { prize: 0, community: 0, treasury: 10000 },
      funding: { chainId: 10143, vault, chainRaidId, rulesHash: onchain[0], prizeWei: String(onchain[2]), gameVersion: 'fixture', payoutMode: 'automatic' },
      finalResult: { finalizedAt: new Date().toISOString(), entries: [{ rank: 1, playerId: 'fixture-recipient', displayName: 'TEST FIXTURE', primaryMetric: 1, objective: 'distance', finishedAt: new Date().toISOString(), runId: 'not-gameplay' }] } };
    store.saveRaid(raid);
    store.db.prepare('INSERT OR IGNORE INTO funded_raid_players VALUES (?,?,?)').run(raid.id, 'fixture-recipient', recipient);
  }
  if (Date.now() < Date.parse(raid.endsAt)) { console.log(JSON.stringify({ waitingUntil: raid.endsAt, next: 'Run again after the test window closes' })); process.exitCode = 2; }
  else {
    await worker.tick(r => r);
    const status = worker.decorate(raid).payout;
    console.log(JSON.stringify(status));
    if (status?.status === 'paid') {
      const chain = await client.readContract({ address: vault, abi: fundedVaultAbi, functionName: 'raids', args: [raid.funding.chainRaidId] });
      assert.equal(chain[9], 3); assert.equal(chain[8].toLowerCase(), recipient.toLowerCase());
      assert.equal(await client.readContract({ address: deployment.token, abi, functionName: 'balanceOf', args: [recipient] }), BigInt(raid.funding.prizeWei));
      assert.equal(await client.getBalance({ address: recipient }), 0n);
      fs.writeFileSync('contracts/deployments/automatic-payout-rehearsal.json', JSON.stringify({ fixtureOnly: true, chainId: 10143, vault, chainRaidId: raid.funding.chainRaidId, recipient, recipientNativeBalance: '0', prizeWei: raid.funding.prizeWei, ...status }, null, 2)+'\n');
    }
  }
} finally { store.close(); }
