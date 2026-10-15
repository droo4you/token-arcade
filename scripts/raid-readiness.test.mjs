import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zeroHash } from 'viem';
import { fundingSummary, inspectRaid } from './raid-readiness.mjs';

const config = [100n, 1000n, 2500n];
const allocation = ['', '', '', 6500n, 2000n, 1500n];
test('pending fees include allocation rounding dust but cannot make current funds ready', () => {
  const report = fundingSummary(98n, 3n, config, allocation, zeroHash, 10n, 10n);
  assert.equal(report.pendingVaultAllocationWei, 3n);
  assert.equal(report.shortfallNowWei, 2n);
  assert.equal(report.shortfallAfterDistributionWei, 0n);
  assert.equal(report.canOpenOnchainNow, false);
});
test('active raids and cooldown block opening even with sufficient funds', () => {
  const report = fundingSummary(10000n, 0n, config, allocation, '0x01', 11n, 10n);
  assert.equal(report.blockers.length, 2);
  assert.equal(report.prizeNowWei, 1000n);
  assert.equal(report.canOpenOnchainNow, false);
  assert.equal(fundingSummary(100n, 0n, config, allocation, zeroHash, 10n, 10n).canOpenOnchainNow, true);
});
test('zero rounded prize blocks opening even when threshold is met', () => {
  assert.equal(fundingSummary(1n, 0n, [1n, 100n, 2500n], allocation, zeroHash, 0n, 10n).canOpenOnchainNow, false);
});
test('mainnet is refused before any contract reads', async () => {
  await assert.rejects(inspectRaid({ getChainId: async () => 143 }, { chainId: '10143' }), /testnet/);
});
