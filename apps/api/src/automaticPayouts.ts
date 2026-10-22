import { createPublicClient, createWalletClient, encodeFunctionData, keccak256, type Hex, type Address } from "viem";
import { monadTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import type { Raid } from "../../../packages/sdk/src/index.ts";
import type { ArcadeStore } from "./store.ts";
import { FundedRaids, FundedRaidError, fundedVaultAbi } from "./fundedRaids.ts";
import { testnetTransport } from "./testnetRpc.ts";

type Job = { raid_id: string; raw: Hex; hash: Hex; state: string };
const requireThat = (ok: unknown, message: string) => { if (!ok) throw new FundedRaidError(message); };

/** One process owns the dedicated signer. Persist before sending; never replace an uncertain tx. */
export class AutomaticPayouts {
  private readonly store: ArcadeStore;
  private readonly funded: FundedRaids;
  private readonly account;
  private readonly client;
  private readonly wallet;
  private busy = false;
  readonly enabled: boolean;
  constructor(store: ArcadeStore, funded: FundedRaids, settings = {
    enabled: process.env.TESTNET_AUTO_PAYOUTS === "true", privateKey: process.env.TESTNET_PAYOUT_PRIVATE_KEY, rpcUrl: process.env.TESTNET_RPC_URL,
  }) {
    this.store = store; this.funded = funded; this.enabled = settings.enabled;
    if (settings.enabled && (!settings.privateKey || !funded.vault)) throw new Error("Automatic payouts require TESTNET_PAYOUT_PRIVATE_KEY and TESTNET_RAID_VAULT");
    this.account = settings.privateKey ? privateKeyToAccount(settings.privateKey as Hex) : undefined;
    this.client = createPublicClient({ chain: monadTestnet, transport: testnetTransport(settings.rpcUrl) });
    this.wallet = createWalletClient({ chain: monadTestnet, account: this.account, transport: testnetTransport(settings.rpcUrl) });
    store.db.exec("CREATE TABLE IF NOT EXISTS raid_payouts (raid_id TEXT PRIMARY KEY, raw TEXT NOT NULL, hash TEXT NOT NULL, state TEXT NOT NULL)");
    store.db.exec("CREATE TABLE IF NOT EXISTS raid_payout_errors (raid_id TEXT PRIMARY KEY)");
  }
  decorate(raid: Raid): Raid {
    if (raid.funding?.payoutMode !== "automatic") return raid;
    const job = this.store.db.prepare("SELECT * FROM raid_payouts WHERE raid_id=?").get(raid.id) as Job | undefined;
    const attention = this.store.db.prepare("SELECT 1 FROM raid_payout_errors WHERE raid_id=?").get(raid.id);
    return { ...raid, payout: { status: job?.state === "paid" ? "paid" : job?.state === "failed" || attention ? "attention" : job ? "submitted" : "pending", ...(job ? { transactionHash: job.hash } : {}) } };
  }
  async assertReady() {
    if (!this.enabled) return;
    requireThat(await this.client.getChainId() === 10143, "Wrong payout network");
    const address = this.funded.vault!;
    requireThat(await this.client.readContract({ address, abi: fundedVaultAbi, functionName: "payoutVersion" }) === 1n, "Unsupported payout vault");
    const owner = await this.client.readContract({ address, abi: fundedVaultAbi, functionName: "owner" });
    requireThat(owner.toLowerCase() === this.account!.address.toLowerCase(), "Payout signer does not own the configured vault");
    requireThat(await this.client.getBalance({ address: this.account!.address }) >= 50000000000000000n, "Fund the payout sponsor before opening a raid");
  }
  async tick(finalize: (raid: Raid) => Raid) {
    if (!this.enabled || this.busy) return;
    this.busy = true;
    try {
      requireThat(await this.client.getChainId() === 10143, "Wrong payout network");
      // An unresolved nonce blocks subsequent signing, including after a restart.
      const pending = this.store.db.prepare("SELECT * FROM raid_payouts WHERE state='submitted' LIMIT 1").get() as Job | undefined;
      if (pending) { await this.broadcast(pending); return; }
      for (const saved of this.store.listRaids()) {
        if (saved.funding?.payoutMode !== "automatic" || saved.funding.vault.toLowerCase() !== this.funded.vault?.toLowerCase()) continue;
        const raid = finalize(saved);
        if (raid.status !== "closed" || !raid.finalResult?.entries.length) continue;
        if (this.store.db.prepare("SELECT 1 FROM raid_payouts WHERE raid_id=?").get(raid.id)) continue;
        try {
          await this.prepare(raid);
          this.store.db.prepare("DELETE FROM raid_payout_errors WHERE raid_id=?").run(raid.id);
        } catch (error) {
          if (!this.store.db.prepare("SELECT 1 FROM raid_payouts WHERE raid_id=?").get(raid.id)) this.store.db.prepare("INSERT OR IGNORE INTO raid_payout_errors VALUES (?)").run(raid.id);
          throw error;
        }
        break;
      }
    } catch {
      // Never log provider errors containing serialized transactions or credential-bearing URLs.
      console.error("Automatic testnet payout needs reconciliation; will retry on the next tick.");
    } finally { this.busy = false; }
  }
  private async prepare(raid: Raid) {
    const plan = this.funded.settlement(raid);
    const address = raid.funding!.vault as Address;
    const args = [raid.funding!.chainRaidId as Hex, plan.artifact.winner, plan.resultHash] as const;
    const read = <T extends "owner" | "payoutVersion">(functionName: T) => this.client.readContract({ address, abi: fundedVaultAbi, functionName });
    requireThat(await read("payoutVersion") === 1n, "Unsupported vault");
    requireThat((await read("owner")).toLowerCase() === this.account!.address.toLowerCase(), "Payout signer is not the vault owner");
    const onchain = await this.client.readContract({ address, abi: fundedVaultAbi, functionName: "raids", args: [args[0]] });
    requireThat(onchain[0] === raid.funding!.rulesHash && onchain[2].toString() === raid.funding!.prizeWei, "Custody mismatch");
    if (onchain[9] === 2 || onchain[9] === 3) {
      requireThat(onchain[1] === plan.resultHash && onchain[8].toLowerCase() === plan.artifact.winner.toLowerCase(), "Settlement mismatch");
      // A separately paid raid is left for operator reconciliation, never paid twice.
      requireThat(onchain[9] !== 3, "Already paid outside worker; reconcile receipt");
    }
    requireThat(onchain[9] === 1 || onchain[9] === 2, "Raid cannot be paid");
    const now = (await this.client.getBlock()).timestamp;
    requireThat(onchain[9] === 1 ? now >= onchain[4] && now < onchain[5] : now < onchain[7], "Payout window closed");
    const data = onchain[9] === 1
      ? encodeFunctionData({ abi: fundedVaultAbi, functionName: "settleAndPay", args })
      : encodeFunctionData({ abi: fundedVaultAbi, functionName: "payWinner", args: [args[0]] });
    const gas = (await this.client.estimateGas({ account: this.account!, to: address, data })) * 12n / 10n;
    const gasPrice = await this.client.getGasPrice();
    requireThat(gas * gasPrice <= 50000000000000000n, "Gas exceeds 0.05 test MON cap");
    requireThat(await this.client.getBalance({ address: this.account!.address }) >= gas * gasPrice, "Sponsor needs test MON");
    const latest = await this.client.getTransactionCount({ address: this.account!.address, blockTag: "latest" });
    requireThat(latest === await this.client.getTransactionCount({ address: this.account!.address, blockTag: "pending" }), "Signer has another pending transaction");
    const raw = await this.wallet.signTransaction({ account: this.account!, chain: monadTestnet, to: address, data, value: 0n, gas, gasPrice, nonce: latest, type: "legacy" });
    const job: Job = { raid_id: raid.id, raw, hash: keccak256(raw), state: "submitted" };
    this.store.db.prepare("INSERT INTO raid_payouts VALUES (?,?,?,?)").run(job.raid_id, raw, job.hash, job.state);
    await this.broadcast(job);
  }
  private async broadcast(job: Job) {
    let receipt;
    try { receipt = await this.client.getTransactionReceipt({ hash: job.hash }); }
    catch (error) { if ((error as Error).name !== "TransactionReceiptNotFoundError") throw error; }
    if (receipt) {
      this.store.db.prepare("UPDATE raid_payouts SET state=? WHERE raid_id=?").run(receipt.status === "success" ? "paid" : "failed", job.raid_id);
      return;
    }
    // Ambiguous failure is kept in the outbox. Every retry uses this exact hash and nonce.
    await this.client.sendRawTransaction({ serializedTransaction: job.raw });
  }
}
