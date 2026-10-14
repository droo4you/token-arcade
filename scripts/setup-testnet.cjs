// Token-only testnet prerequisite. Never accepts a mainnet chain.
const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("../contracts/node_modules/ethers");
const { compileContracts } = require("../contracts/scripts/compile.cjs");

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.TESTNET_RPC_URL);
  try {
    if ((await provider.getNetwork()).chainId !== 10143n) throw Error("Expected Monad testnet (10143). No transaction sent.");
    const wallet = new ethers.Wallet(process.env.TESTNET_DEPLOYER_PRIVATE_KEY, provider);
    const artifact = compileContracts()["src/MinicoinFactory.sol"].MinicoinFactory;
    const recordPath = path.resolve(__dirname, "../contracts/.data/testnet-factory.json");
    const persist = (record) => { fs.mkdirSync(path.dirname(recordPath), { recursive: true }); fs.writeFileSync(recordPath, JSON.stringify(record, null, 2)); };
    let record = fs.existsSync(recordPath) ? JSON.parse(fs.readFileSync(recordPath, "utf8")) : undefined;
    if (record && (record.chainId !== 10143 || record.owner !== wallet.address)) throw Error("Existing factory record belongs to a different wallet or chain");
    if (!record) {
      const factory = new ethers.ContractFactory(artifact.abi, `0x${artifact.evm.bytecode.object}`, wallet);
      const transaction = await wallet.populateTransaction(await factory.getDeployTransaction(wallet.address));
      transaction.gasLimit = transaction.gasLimit * 120n / 100n;
      const maximumCost = transaction.gasLimit * (transaction.maxFeePerGas ?? transaction.gasPrice);
      if (maximumCost > ethers.parseEther("0.5")) throw Error("Factory deployment estimate exceeds the 0.5 test MON cap");
      console.log(JSON.stringify({ network: "Monad testnet", owner: wallet.address, maximumCostMON: ethers.formatEther(maximumCost) }));
      if (!process.argv.includes("--broadcast")) return;
      const signedTransaction = await wallet.signTransaction(transaction);
      record = { chainId: 10143, owner: wallet.address, address: ethers.getCreateAddress({ from: wallet.address, nonce: transaction.nonce }),
        transactionHash: ethers.keccak256(signedTransaction), signedTransaction, status: "prepared" };
      persist(record); // Exact signed tx allows identical recovery instead of another deployment.
    }
    if (!process.argv.includes("--broadcast")) { console.log(JSON.stringify({ ...record, signedTransaction: undefined })); return; }
    let receipt = await provider.getTransactionReceipt(record.transactionHash);
    if (!receipt) {
      try { await provider.broadcastTransaction(record.signedTransaction); }
      catch { if (!(await provider.getTransaction(record.transactionHash))) throw Error("Broadcast incomplete; rerun to recover the same signed transaction"); }
      receipt = await provider.waitForTransaction(record.transactionHash, 1, 60_000);
    }
    if (!receipt || receipt.status !== 1) throw Error("Factory confirmation missing or reverted; inspect the recorded transaction");
    const deployed = new ethers.Contract(record.address, artifact.abi, provider);
    if ((await deployed.owner()) !== wallet.address || (await provider.getCode(record.address)) === "0x") throw Error("Factory owner/code verification failed");
    record.status = "confirmed"; persist(record);
    if (process.argv.includes("--configure")) {
      const envPath = path.resolve(__dirname, "../.env.testnet");
      let env = fs.readFileSync(envPath, "utf8");
      for (const [key, value] of [["TESTNET_FACTORY_ADDRESS", record.address], ["TESTNET_ENABLE_WRITES", "true"]]) {
        env = env.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
      }
      fs.writeFileSync(envPath, env);
    }
    console.log(JSON.stringify({ network: "Monad testnet", factory: record.address, transactionHash: record.transactionHash, status: record.status }));
  } finally { provider.destroy(); }
}
main().catch(() => { console.error("Testnet setup failed. Check configuration and the local transaction record; no mainnet fallback is permitted."); process.exitCode = 1; });
