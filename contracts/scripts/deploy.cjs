const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const { compileContracts } = require("./compile.cjs");

const contractsRoot = path.resolve(__dirname, "..");

async function main() {
  const rpcUrl = process.env.MONAD_RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const owner = process.env.OWNER_ADDRESS;
  const expectedChainId = process.env.MONAD_CHAIN_ID;
  if (!rpcUrl || !privateKey || !owner || !expectedChainId) {
    throw new Error("Set MONAD_RPC_URL, MONAD_CHAIN_ID, DEPLOYER_PRIVATE_KEY and OWNER_ADDRESS before deployment.");
  }
  if (!ethers.isAddress(owner)) throw new Error("OWNER_ADDRESS must be an EVM address.");
  if (!/^\d+$/.test(expectedChainId)) throw new Error("MONAD_CHAIN_ID must be a decimal chain ID.");
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("DEPLOYER_PRIVATE_KEY must be a 0x-prefixed 32-byte hex key.");
  }

  const compiled = compileContracts();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const actualChainId = (await provider.getNetwork()).chainId;
  if (actualChainId !== BigInt(expectedChainId)) {
    throw new Error(`RPC chain ID ${actualChainId} does not match MONAD_CHAIN_ID ${expectedChainId}.`);
  }
  const deployer = new ethers.NonceManager(new ethers.Wallet(privateKey, provider));
  const deployerAddress = await deployer.getAddress();
  const outDir = path.join(contractsRoot, ".data", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${actualChainId}-${Date.now()}.json`);
  const state = {
    status: "incomplete",
    chainId: actualChainId.toString(),
    deployer: deployerAddress,
    owner: ethers.getAddress(owner),
    startedAt: new Date().toISOString(),
    contracts: {},
  };
  const persist = () => fs.writeFileSync(outPath, JSON.stringify(state, null, 2));
  persist();

  for (const name of ["MinicoinFactory", "RaidPrizeVault", "EntryFeeRouter"]) {
    const artifact = compiled[`src/${name}.sol`][name];
    const factory = new ethers.ContractFactory(
      artifact.abi,
      `0x${artifact.evm.bytecode.object}`,
      deployer,
    );
    const contract = await factory.deploy(owner);
    const transaction = contract.deploymentTransaction();
    console.log(`${name} transaction: ${transaction.hash}`);
    const receipt = await transaction.wait(1);
    if (receipt.status !== 1) throw new Error(`${name} deployment reverted: ${transaction.hash}`);
    state.contracts[name] = {
      address: await contract.getAddress(),
      deploymentTx: transaction.hash,
      blockNumber: receipt.blockNumber,
    };
    persist();
    console.log(`${name} address: ${state.contracts[name].address}`);
  }
  state.status = "complete";
  state.completedAt = new Date().toISOString();
  persist();
  console.log(`Deployment record: ${outPath}`);
}

main().catch((error) => {
  console.error(error.shortMessage || error.message);
  process.exitCode = 1;
});
