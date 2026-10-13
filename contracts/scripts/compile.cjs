const fs = require("node:fs");
const path = require("node:path");
const solc = require("solc");

const contractsRoot = path.resolve(__dirname, "..");

function compileContracts(extraSources = {}) {
  const sources = {};
  for (const file of fs.readdirSync(path.join(contractsRoot, "src"))) {
    if (file.endsWith(".sol")) {
      sources[`src/${file}`] = {
        content: fs.readFileSync(path.join(contractsRoot, "src", file), "utf8"),
      };
    }
  }
  for (const [name, content] of Object.entries(extraSources)) {
    sources[name] = { content };
  }

  const input = {
    language: "Solidity",
    sources,
    settings: {
      evmVersion: "cancun",
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
    },
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input), {
    import: (importPath) => {
      const resolved = path.resolve(contractsRoot, "node_modules", importPath);
      if (!resolved.startsWith(path.join(contractsRoot, "node_modules") + path.sep)) {
        return { error: `Import outside dependency directory: ${importPath}` };
      }
      try {
        return { contents: fs.readFileSync(resolved, "utf8") };
      } catch {
        return { error: `Missing import: ${importPath}` };
      }
    },
  }));
  const errors = (output.errors || []).filter((item) => item.severity === "error");
  if (errors.length) throw new Error(errors.map((item) => item.formattedMessage).join("\n"));
  return output.contracts;
}

if (require.main === module) {
  const contracts = compileContracts();
  const names = Object.entries(contracts)
    .filter(([file]) => file.startsWith("src/"))
    .flatMap(([, compiled]) => Object.keys(compiled));
  console.log(`Compiled ${names.join(", ")} with ${solc.version()}`);
  if (process.argv.includes("--artifacts")) {
    const outDir = path.join(contractsRoot, "artifacts");
    fs.mkdirSync(outDir, { recursive: true });
    for (const [file, compiled] of Object.entries(contracts)) {
      if (!file.startsWith("src/")) continue;
      for (const [name, artifact] of Object.entries(compiled)) {
        fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify({
          contractName: name,
          compilerVersion: solc.version(),
          abi: artifact.abi,
          bytecode: `0x${artifact.evm.bytecode.object}`,
          deployedBytecode: `0x${artifact.evm.deployedBytecode.object}`,
        }, null, 2));
      }
    }
    console.log(`Wrote ABI and bytecode to ${outDir}`);
  }
}

module.exports = { compileContracts };
